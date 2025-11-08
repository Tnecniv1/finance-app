// src/controllers/csvController.js
const csv = require('csv-parser');
const { Readable } = require('stream');
const Transaction = require('../models/Transaction');
const CsvImport = require('../models/CsvImport');

class CsvController {
  /**
   * Page d'import CSV
   */
  static async showImportPage(req, res) {
    try {
      const userId = req.session.userId;
      const recentImports = await CsvImport.findByUserId(userId, 5);

      res.render('transactions/import-csv', {
        pseudo: req.session.pseudo,
        recentImports,
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
   * Upload & traitement du CSV
   */
  static async handleCsvUpload(req, res) {
    let csvImport = null;

    try {
      const userId = req.session.userId;
      if (!req.file) {
        return res.redirect('/transactions/import-csv?error=Aucun fichier sélectionné');
      }

      const filename = req.file.originalname;
      let fileContent = req.file.buffer.toString('utf-8');
      const fileSize = req.file.size;

      console.log(`📄 Import CSV: ${filename} (${fileSize} octets)`);

      // Enlève BOM si présent
      if (fileContent.charCodeAt(0) === 0xFEFF) fileContent = fileContent.slice(1);

      // 1) Sauvegarde brut du CSV
      csvImport = await CsvImport.create(userId, filename, fileContent, fileSize);
      console.log(`✅ CSV sauvegardé (ID: ${csvImport.id})`);

      // 2) Statut "processing"
      await CsvImport.updateStatus(csvImport.id, 'processing');

      // 3) Parse & normalisation
      const parsed = await CsvController.parseCsvContent(fileContent);
      const transactions = parsed.filter(t => t && t.objet && t.objet.trim().length > 0 && t.date && t.montant != null);

      console.log(`📊 ${transactions.length} transaction(s) valide(s) / ${parsed.length} ligne(s) lues`);

      if (transactions.length === 0) {
        await CsvImport.updateStatus(csvImport.id, 'error', 0, 0, 'Aucune transaction valide trouvée dans le fichier');
        return res.redirect('/transactions/import-csv?error=Aucune transaction valide trouvée');
      }

      // 4) Insertion DB
      let imported = 0;
      let errors = 0;
      const errorMessages = [];

      for (const t of transactions) {
        // Log de contrôle sur les 3 premières
        if (imported + errors < 3) {
          console.log('🔍 Transaction normalisée:', t);
        }

        try {
          await Transaction.create({
            user_id: userId,
            objet: t.objet,
            montant: t.montant,           // ⚠️ signé (+ revenu, − dépense)
            nature: t.nature,             // 'revenu' | 'depense' déduit du signe
            date: t.date,
            sous_categorie_revenu_id: null,
            sous_categorie_depense_id: null
          });
          imported++;
        } catch (e) {
          errors++;
          const msg = `Transaction "${t.objet}" du ${t.date}: ${e.message}`;
          errorMessages.push(msg);
          console.error('❌ Insertion transaction:', msg);
        }
      }

      // 5) Statut final
      await CsvImport.updateStatus(
        csvImport.id,
        'completed',
        imported,
        errors,
        errors > 0 ? errorMessages.join('\n') : null
      );

      const message = `✅ ${imported} transaction(s) importée(s)${errors ? `, ${errors} erreur(s)` : ''}`;
      console.log(message);
      res.redirect(`/transactions?success=${encodeURIComponent(message)}`);
    } catch (error) {
      console.error('❌ Erreur import CSV:', error);
      if (csvImport) {
        try {
          await CsvImport.updateStatus(csvImport.id, 'error', 0, 0, error.message);
        } catch (e) {
          console.error('Erreur MAJ statut import:', e);
        }
      }
      res.redirect('/transactions/import-csv?error=Erreur lors de l\'import du fichier');
    }
  }

  // --------------------------------------------------------------------------
  // ---------------------- Normalisation / Parsing robustes -------------------
  // --------------------------------------------------------------------------

  /**
   * Détecte le séparateur le plus probable en lisant l'entête
   */
  static detectSeparator(content) {
    const firstLine = (content.split(/\r?\n/)[0] || '');
    const countSemi = (firstLine.match(/;/g) || []).length;
    const countComma = (firstLine.match(/,/g) || []).length;
    // Par défaut, beaucoup de banques FR exportent au ';'
    if (countSemi === 0 && countComma === 0) return ';';
    return countSemi >= countComma ? ';' : ',';
  }

  /**
   * Parse tout le contenu CSV → array de transactions normalisées
   */
  static async parseCsvContent(content) {
    const sep = CsvController.detectSeparator(content);
    console.log(`🧭 Séparateur détecté: "${sep}"`);

    return new Promise((resolve, reject) => {
      const out = [];
      const stream = Readable.from(content);

      let firstRowLogged = false;

      stream
        .pipe(csv({
          separator: sep,
          quote: '"',
          escape: '"',
          mapHeaders: ({ header }) => (header || '').trim().toLowerCase()
        }))
        .on('data', (row) => {
          try {
            if (!firstRowLogged) {
              firstRowLogged = true;
              console.log('🔎 Première ligne brute:', row);
            }
            const norm = CsvController.normalizeCsvRow(row);
            if (norm) out.push(norm);
          } catch (e) {
            console.error('Ligne ignorée (parse error):', e.message);
          }
        })
        .on('end', () => resolve(out))
        .on('error', reject);
    });
  }

  /**
   * Convertit une ligne CSV brute en { date, objet, montant (signé), nature }
   */
  static normalizeCsvRow(row) {
    // normalise clés
    const fields = {};
    for (const [k, v] of Object.entries(row)) {
      fields[(k || '').trim().toLowerCase()] = v;
    }

    // 1) Date
    const dateRaw =
      fields['date opération'] ?? fields['date operation'] ?? fields['date de l\'opération'] ??
      fields['date valeur'] ?? fields['dateval'] ?? fields['transaction date'] ??
      fields['date transaction'] ?? fields['booking date'] ?? fields['date'];
    const date = CsvController.parseDate(String(dateRaw || '').trim());
    if (!date) return null;

    // 2) Libellé
    const libelle =
      fields['libelle'] ?? fields['libellé'] ?? fields['description'] ??
      fields['intitule'] ?? fields['intitulé'] ?? fields['label'] ??
      fields['details'] ?? fields['détails'] ?? '';
    const objet = String(libelle || '').trim().replace(/^["']|["']$/g, '');
    if (!objet) return null;

    // 3) Montant signé
    const montant = CsvController.extractSignedAmount(fields, objet);
    if (montant == null) return null;

    // 4) Nature à partir du signe
    const nature = montant < 0 ? 'depense' : 'revenu';

    return { date, objet, montant: Number(montant), nature };
  }

  /**
   * Parse FR/EN + parenthèses (négatif)
   */
  static parseEuroAmount(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();

    // Parenthèses => négatif
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }

    // remove spaces, thousands, currency, plus
    s = s.replace(/\s+/g, '').replace(/[€]/g, '').replace(/\+/g, '').replace(/'/g, '');

    // Cas FR "1.234,56" → "1234.56"
    if (/,/.test(s) && /\.\d{3},\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    // Cas FR "1234,56" → "1234.56"
    else if (/,/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(',', '.');

    const val = Number(s);
    if (Number.isNaN(val)) return null;
    return neg ? -val : val;
  }

  /**
   * Déduire un montant **signé** à partir des schémas bancaires courants
   */
  static extractSignedAmount(fields, objet) {
    const get = (k) => fields[k] ?? fields[k.normalize?.()];

    const créditKeys = ['credit', 'crédit', 'montant crédit', 'montant credit', 'crédit (eur)', 'credit amount'];
    const débitKeys  = ['debit', 'débit', 'montant débit',  'montant debit',  'débit (eur)',  'debit amount'];
    const montantKeys= ['montant', 'amount', 'valeur', 'transaction amount', 'montant (eur)'];

    // A) Colonnes séparées Crédit / Débit
    for (const k of créditKeys) {
      if (fields[k] != null && String(fields[k]).trim() !== '') {
        const a = CsvController.parseEuroAmount(fields[k]);
        if (a != null && a !== 0) return Math.abs(a); // crédit => +
      }
    }
    for (const k of débitKeys) {
      if (fields[k] != null && String(fields[k]).trim() !== '') {
        const a = CsvController.parseEuroAmount(fields[k]);
        if (a != null && a !== 0) return -Math.abs(a); // débit => -
      }
    }

    // B) Colonne unique "Montant" + "Sens/Type" (D/C)
    const sens = (fields['sens'] || fields['type'] || fields['nature'] || '').toString().trim().toLowerCase();
    for (const k of montantKeys) {
      if (fields[k] != null && String(fields[k]).trim() !== '') {
        let a = CsvController.parseEuroAmount(fields[k]);
        if (a == null) continue;

        if (['d', 'debit', 'débit', 'debit card', 'debit transaction'].includes(sens)) a = -Math.abs(a);
        if (['c', 'credit', 'crédit'].includes(sens)) a = +Math.abs(a);

        return a;
      }
    }

    // C) Dernier recours : scanner une colonne plausible et heuristique libellé
    for (const [k, v] of Object.entries(fields)) {
      const a = CsvController.parseEuroAmount(v);
      if (a != null && Math.abs(a) > 0 && /montant|amount|credit|crédit|debit|débit/i.test(k)) {
        const looksExpense = /(cb|carte|prlv|sepa[ _-]?sdd|paypal|amazon|facture|abonnement|loyer|edf|engie|sfr|free|orange|urssaf|imp[oô]t|taxe|retrait|essence|supermarch|uber|deliveroo|itunes|spotify|netflix|sncf|ratp|apple|google|decathlon)/i.test(objet || '');
        return looksExpense ? -Math.abs(a) : a;
      }
    }

    return null;
  }

  /**
   * Parse plusieurs formats de date (FR/ISO)
   */
  static parseDate(s) {
    if (!s) return null;
    s = s.trim();

    // YYYY-MM-DD (ou ISO début)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return s.slice(0, 10);
    }
    // DD/MM/YYYY
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
    // DD-MM-YYYY
    const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

    // Tentative générique
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  /**
   * Template CSV téléchargeable
   */
  static downloadTemplate(req, res) {
    const template = `Date;Description;Montant
2025-01-15;Salaire;2500,00
2025-01-16;Loyer;-850,00
2025-01-17;Courses Carrefour;-65,50
2025-01-18;Remboursement Sécu;45,00`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=template-import.csv');
    res.send('\uFEFF' + template);
  }

  /**
   * Historique d'import
   */
  static async showImportHistory(req, res) {
    try {
      const userId = req.session.userId;
      const imports = await CsvImport.findByUserId(userId, 20);

      res.render('transactions/import-history', {
        pseudo: req.session.pseudo,
        imports
      });
    } catch (error) {
      console.error('Erreur historique imports:', error);
      res.redirect('/transactions?error=Erreur lors du chargement de l\'historique');
    }
  }
}

module.exports = CsvController;
