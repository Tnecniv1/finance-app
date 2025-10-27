const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Transaction = require('../models/Transaction');

class CsvController {
  /**
   * Afficher la page d'import CSV
   */
  static async showImportPage(req, res) {
    try {
      res.render('transactions/import-csv', {
        pseudo: req.session.pseudo,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Erreur affichage page import:', error);
      res.redirect('/transactions?error=Erreur lors du chargement de la page');
    }
  }

  /**
   * Traiter le fichier CSV uploadé
   */
  static async handleCsvUpload(req, res) {
    try {
      const userId = req.session.userId;

      // Vérifier qu'un fichier a été uploadé
      if (!req.file) {
        return res.redirect('/transactions/import-csv?error=Aucun fichier sélectionné');
      }

      const filePath = req.file.path;
      const transactions = [];
      let errors = [];

      console.log('📄 Lecture du fichier CSV:', filePath);

      // Lire et parser le CSV
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv({
            separator: [';', ','], // Support à la fois ; et ,
            mapHeaders: ({ header }) => header.trim().toLowerCase()
          }))
          .on('data', (row) => {
            try {
              // Extraire les données (adapté aux formats courants)
              const transaction = CsvController.parseTransaction(row);
              if (transaction) {
                transactions.push(transaction);
              }
            } catch (err) {
              errors.push(`Ligne ignorée: ${err.message}`);
            }
          })
          .on('end', () => {
            console.log(`✅ ${transactions.length} transactions trouvées`);
            resolve();
          })
          .on('error', (error) => {
            reject(error);
          });
      });

      // Supprimer le fichier temporaire
      fs.unlinkSync(filePath);

      if (transactions.length === 0) {
        return res.redirect('/transactions/import-csv?error=Aucune transaction valide trouvée dans le fichier');
      }

      // Insérer les transactions dans la base de données
      let imported = 0;
      let duplicates = 0;

      for (const transaction of transactions) {
        try {
          await Transaction.create(
            userId,
            transaction.objet,
            transaction.montant,
            transaction.nature,
            transaction.date,
            null, // sous_categorie_revenu_id (à catégoriser manuellement)
            null  // sous_categorie_depense_id
          );
          imported++;
        } catch (error) {
          // Si erreur de doublon (dépend de votre structure DB)
          console.log('Transaction en doublon ou erreur:', transaction.objet);
          duplicates++;
        }
      }

      const message = `${imported} transaction(s) importée(s)${duplicates > 0 ? `, ${duplicates} doublon(s) ignoré(s)` : ''}`;
      console.log(`✅ ${message}`);
      
      if (errors.length > 0) {
        console.log(`⚠️ ${errors.length} ligne(s) ignorée(s)`);
      }

      res.redirect(`/transactions?success=${encodeURIComponent(message)}`);
    } catch (error) {
      console.error('❌ Erreur import CSV:', error);
      
      // Nettoyer le fichier en cas d'erreur
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.redirect('/transactions/import-csv?error=Erreur lors de l\'import du fichier');
    }
  }

  /**
   * Parser une ligne CSV en transaction
   * Adapte aux formats courants des banques françaises
   */
  static parseTransaction(row) {
    // Normaliser les noms de colonnes
    const keys = Object.keys(row).map(k => k.toLowerCase().trim());
    
    // Essayer de trouver les colonnes importantes
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

    // Déterminer la nature (revenu si positif, dépense si négatif)
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

    // Nettoyer la chaîne
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

    // Format anglais (MM/DD/YYYY)
    const usMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usMatch) {
      return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
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

    // Nettoyer la chaîne
    montantStr = montantStr.toString().trim();

    // Supprimer les symboles monétaires
    montantStr = montantStr.replace(/[€$£]/g, '');

    // Remplacer la virgule par un point (format français)
    montantStr = montantStr.replace(',', '.');

    // Supprimer les espaces
    montantStr = montantStr.replace(/\s/g, '');

    // Parser en nombre
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
    res.send('\uFEFF' + template); // BOM pour Excel
  }
}

module.exports = CsvController;