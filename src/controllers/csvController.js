const csv = require('csv-parser');
const { Readable } = require('stream');
const Transaction = require('../models/Transaction');
const CsvImport = require('../models/CsvImport');

class CsvController {
  /**
   * Afficher la page d'import CSV
   */
  static async showImportPage(req, res) {
    try {
      const userId = req.session.userId;
      
      // Récupérer les 5 derniers imports
      const recentImports = await CsvImport.findByUserId(userId, 5);

      res.render('transactions/import-csv', {
        pseudo: req.session.pseudo,
        recentImports: recentImports,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Erreur affichage page import:', error);
      res.render('transactions/import-csv', {
        pseudo: req.session.pseudo,
        recentImports: [],
        error: 'Erreur lors du chargement de la page',
        success: null
      });
    }
  }

  /**
   * Traiter le fichier CSV uploadé
   */
  static async handleCsvUpload(req, res) {
    let csvImport = null;
    
    try {
      const userId = req.session.userId;

      // Vérifier qu'un fichier a été uploadé
      if (!req.file) {
        return res.redirect('/transactions/import-csv?error=Aucun fichier sélectionné');
      }

      const filename = req.file.originalname;
      const fileContent = req.file.buffer.toString('utf-8');
      const fileSize = req.file.size;

      console.log(`📄 Import CSV: ${filename} (${fileSize} octets)`);

      // 1. Sauvegarder le CSV dans Supabase
      csvImport = await CsvImport.create(userId, filename, fileContent, fileSize);
      console.log(`✅ CSV sauvegardé dans Supabase (ID: ${csvImport.id})`);

      // 2. Mettre le statut en "processing"
      await CsvImport.updateStatus(csvImport.id, 'processing');

      // 3. Parser le CSV
      const transactions = await CsvController.parseCsvContent(fileContent);
      console.log(`📊 ${transactions.length} transaction(s) trouvée(s)`);

      if (transactions.length === 0) {
        await CsvImport.updateStatus(
          csvImport.id, 
          'error', 
          0, 
          0, 
          'Aucune transaction valide trouvée dans le fichier'
        );
        return res.redirect('/transactions/import-csv?error=Aucune transaction valide trouvée');
      }

      // 4. Insérer les transactions dans la base de données
      let imported = 0;
      let errors = 0;
      const errorMessages = [];

      for (const transaction of transactions) {
        try {
          await Transaction.create(
            userId,
            transaction.objet,
            transaction.montant,
            transaction.nature,
            transaction.date,
            null, // sous_categorie_revenu_id
            null  // sous_categorie_depense_id
          );
          imported++;
        } catch (error) {
          errors++;
          errorMessages.push(`Transaction "${transaction.objet}": ${error.message}`);
          console.error(`Erreur import transaction:`, error.message);
        }
      }

      // 5. Mettre à jour le statut final
      await CsvImport.updateStatus(
        csvImport.id,
        'completed',
        imported,
        errors,
        errors > 0 ? errorMessages.join('\n') : null
      );

      const message = `✅ ${imported} transaction(s) importée(s)${errors > 0 ? `, ${errors} erreur(s)` : ''}`;
      console.log(message);

      res.redirect(`/transactions?success=${encodeURIComponent(message)}`);
    } catch (error) {
      console.error('❌ Erreur import CSV:', error);
      
      // Marquer l'import comme erreur si déjà créé
      if (csvImport) {
        try {
          await CsvImport.updateStatus(
            csvImport.id,
            'error',
            0,
            0,
            error.message
          );
        } catch (updateError) {
          console.error('Erreur mise à jour statut:', updateError);
        }
      }

      res.redirect('/transactions/import-csv?error=Erreur lors de l\'import du fichier');
    }
  }

  /**
   * Parser le contenu CSV en mémoire
   */
  static async parseCsvContent(content) {
    return new Promise((resolve, reject) => {
      const transactions = [];
      const errors = [];

      const stream = Readable.from(content);

      stream
        .pipe(csv({
          separator: [';', ','],
          mapHeaders: ({ header }) => header.trim().toLowerCase()
        }))
        .on('data', (row) => {
          try {
            const transaction = CsvController.parseTransaction(row);
            if (transaction) {
              transactions.push(transaction);
            }
          } catch (err) {
            errors.push(`Ligne ignorée: ${err.message}`);
          }
        })
        .on('end', () => {
          console.log(`✅ Parsing terminé: ${transactions.length} transactions, ${errors.length} erreurs`);
          resolve(transactions);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Parser une ligne CSV en transaction
   */
  static parseTransaction(row) {
    const keys = Object.keys(row).map(k => k.toLowerCase().trim());
    
    let date, description, montant;

    // Recherche de la date
    const dateKeys = ['date', 'date operation', 'date opération', 'date de l\'opération', 'date valeur'];
    for (const key of dateKeys) {
      if (keys.includes(key) && row[key]) {
        date = CsvController.parseDate(row[key]);
        break;
      }
    }

    // Recherche de la description
    const descKeys = ['libelle', 'libellé', 'description', 'intitule', 'intitulé', 'label', 'details', 'détails'];
    for (const key of descKeys) {
      if (keys.includes(key) && row[key]) {
        description = row[key].trim();
        break;
      }
    }

    // Recherche du montant
    const montantKeys = ['montant', 'debit', 'débit', 'credit', 'crédit', 'amount'];
    for (const key of montantKeys) {
      if (keys.includes(key) && row[key]) {
        montant = CsvController.parseMontant(row[key]);
        if (montant !== null) break;
      }
    }

    // Si montant pas trouvé, essayer avec débit/crédit séparés
    if (montant === null) {
      const debit = row['debit'] || row['débit'];
      const credit = row['credit'] || row['crédit'];
      
      if (debit) {
        montant = -Math.abs(CsvController.parseMontant(debit));
      } else if (credit) {
        montant = Math.abs(CsvController.parseMontant(credit));
      }
    }

    // Validation
    if (!date || !description || montant === null) {
      return null;
    }

    // Déterminer la nature
    const nature = montant >= 0 ? 'revenu' : 'depense';

    return {
      date: date,
      objet: description,
      montant: Math.abs(montant),
      nature: nature
    };
  }

  /**
   * Parser une date depuis différents formats
   */
  static parseDate(dateStr) {
    if (!dateStr) return null;

    dateStr = dateStr.trim();

    // Format ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Format français (DD/MM/YYYY)
    const frMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frMatch) {
      return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
    }

    // Format avec tirets inversés (DD-MM-YYYY)
    const dashMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dashMatch) {
      return `${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}`;
    }

    return null;
  }

  /**
   * Parser un montant depuis différents formats
   */
  static parseMontant(montantStr) {
    if (!montantStr) return null;

    montantStr = montantStr.toString().trim();
    montantStr = montantStr.replace(/[€$£]/g, '');
    montantStr = montantStr.replace(',', '.');
    montantStr = montantStr.replace(/\s/g, '');

    const montant = parseFloat(montantStr);
    return isNaN(montant) ? null : montant;
  }

  /**
   * Télécharger un template CSV
   */
  static downloadTemplate(req, res) {
    const template = `Date;Description;Montant
2025-01-15;Salaire;2500.00
2025-01-16;Loyer;-850.00
2025-01-17;Courses Carrefour;-65.50
2025-01-18;Remboursement Sécu;45.00`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=template-import.csv');
    res.send('\uFEFF' + template);
  }

  /**
   * Afficher l'historique des imports
   */
  static async showImportHistory(req, res) {
    try {
      const userId = req.session.userId;
      const imports = await CsvImport.findByUserId(userId, 20);

      res.render('transactions/import-history', {
        pseudo: req.session.pseudo,
        imports: imports
      });
    } catch (error) {
      console.error('Erreur historique imports:', error);
      res.redirect('/transactions?error=Erreur lors du chargement de l\'historique');
    }
  }
}

module.exports = CsvController;