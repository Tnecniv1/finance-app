// src/controllers/recurrencesController.js
const supabase = require('../../config/supabase');
const { ensureAuthenticated } = require('../middleware/auth'); // juste pour rappel de dépendance
const RecurrenceMapping = require('../models/RecurrenceMapping'); // fichier ajouté précédemment
const RecurringTransaction = require('../models/RecurringTransaction'); // déjà présent

// ------------------ HELPERS ------------------

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function sanitizeNature(n) {
  const s = String(n || '').toLowerCase();
  return s === 'depense' ? 'depense' : 'revenu';
}

// ------------------ PAGE / JSON ------------------

/**
 * GET /recurrences
 * Page de gestion (liste + création + mapping)
 */
exports.showManagePage = async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.redirect('/login?next=/recurrences');
    }

    const { data: recurrences, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', String(userId))
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.render('recurrences/index', {
      user: { id: userId, pseudo: req.session.pseudo },
      recurrences: recurrences || [],
      flash: { success: req.query.success || null, error: req.query.error || null }
    });
  } catch (e) {
    console.error('[recurrences.showManagePage]', e);
    res.status(500).send('Erreur chargement page récurrences');
  }
};


/**
 * GET /recurrences/all
 * JSON: liste des récurrences (utile si front veut recharger dynamiquement)
 */
exports.getAll = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', String(userId))
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, recurrences: data || [] });
  } catch (e) {
    console.error('[recurrences.getAll]', e);
    res.status(500).json({ success: false, error: 'Erreur récupération récurrences' });
  }
};

// ------------------ CRUD RECURRENCES ------------------

/**
 * POST /recurrences
 * Body: { titre, nature, montant_moyen, montant_ecart_type, p_occurrence, day_of_month, jitter_days }
 */
exports.create = async (req, res) => {
  try {
    const userId = req.session.userId;
    const {
      titre,              // ⚠️ Formulaire envoie "titre"
      nature,
      montant_moyen,
      montant_ecart_type,
      p_occurrence,
      day_of_month,       // ⚠️ Formulaire envoie "day_of_month"
      jitter_days,
      start_date,
      frequence
    } = req.body || {};

    // ✅ Mapper les champs du formulaire aux colonnes de la table
    const payload = {
      user_id: String(userId),
      nom: String(titre || '').trim(),                    // ✅ titre → nom
      nature: sanitizeNature(nature),
      montant_moyen: numOrNull(montant_moyen),
      montant_ecart_type: numOrNull(montant_ecart_type),
      p_occurrence: numOrNull(p_occurrence) ?? 1,
      jour_mois: intOrNull(day_of_month),                 // ✅ day_of_month → jour_mois
      jitter_days: intOrNull(jitter_days) ?? 0,
      date_debut: start_date || null,                     // ✅ Ajouter date_debut
      frequence: frequence || 'monthly',                  // ✅ Ajouter frequence
      active: true,                                       // ✅ Activer par défaut
      nb_occurrences: 0,                                  // ✅ Init à 0
      transaction_ids: []                                 // ✅ Array vide
    };

    if (!payload.nom) {
      return res.redirect('/recurrences?error=Le nom est requis');
    }

    const { data, error } = await supabase
      .from('recurring_transactions')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    return res.redirect('/recurrences?success=Récurrence créée');
  } catch (e) {
    console.error('[recurrences.create]', e);
    return res.redirect('/recurrences?error=Erreur lors de la création');
  }
};

/**
 * POST /recurrences/:id/delete
 * Supprimer une récurrence (et éventuellement ses mappings)
 */
exports.remove = async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = req.params.id;

    // 1. Supprimer les détections liées (contrainte FK)
    const { error: detErr } = await supabase
      .from('detected_recurrences')
      .delete()
      .eq('recurring_transaction_id', id);

    if (detErr) console.warn('[recurrences.remove] detected_recurrences:', detErr);

    // 2. Supprimer les mappings liés
    const { error: mapErr } = await supabase
      .from('transaction_recurrence_mapping')
      .delete()
      .eq('user_id', String(userId))
      .eq('recurring_transaction_id', id);

    if (mapErr) throw mapErr;

    // 3. Supprimer la récurrence
    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', String(userId));

    if (error) throw error;

    return res.redirect('/recurrences?success=R%C3%A9currence%20supprim%C3%A9e');
  } catch (e) {
    console.error('[recurrences.remove]', e);
    return res.redirect('/recurrences?error=Erreur%20lors%20de%20la%20suppression');
  }
};






// ------------------ MAPPING: candidats / associer / dissocier ------------------

/**
 * GET /recurrences/:id/candidates
 * Liste de transactions candidates à associer à la récurrence
 */
exports.listCandidates = async (req, res) => {
  try {
    const userId = req.session.userId;
    const recurrenceId = req.params.id;

    const rec = await RecurringTransaction.findById(recurrenceId);
    if (!rec || String(rec.user_id) !== String(userId)) {
      return res.status(404).json({ success: false, error: 'Récurrence introuvable' });
    }

    const candidates = await RecurrenceMapping.suggestCandidates({ userId, recurrence: rec });
    return res.json({ success: true, candidates });
  } catch (e) {
    console.error('[recurrences.listCandidates]', e);
    return res.status(500).json({ success: false, error: 'Erreur récupération candidats' });
  }
};


// GET /recurrences/:id/mappings
exports.listMappings = async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success:false, error:'Unauthorized' });

    const recurrenceId = req.params.id;

    const { data: maps, error: mErr } = await supabase
      .from('transaction_recurrence_mapping')
      .select('id, transaction_id, matched_at')
      .eq('user_id', String(userId))
      .eq('recurring_transaction_id', recurrenceId)
      .order('matched_at', { ascending: false });
    if (mErr) throw mErr;

    const ids = (maps || []).map(m => m.transaction_id);
    if (!ids.length) return res.json({ success: true, mappings: [] });

    const { data: txs, error: tErr } = await supabase
      .from('transactions')
      .select('id, date, objet, montant, nature'); // 👈 libelle retiré
    if (tErr) throw tErr;

    const byId = Object.fromEntries((txs || []).map(t => [t.id, t]));
    const result = (maps || []).map(m => {
      const t = byId[m.transaction_id] || null;
      const label = t ? (t.objet || '') : '';
      return { id: m.id, transaction_id: m.transaction_id, matched_at: m.matched_at, transactions: t ? { ...t, libelle: label } : null };
    });

    return res.json({ success: true, mappings: result });
  } catch (e) {
    console.error('[recurrences.listMappings]', e);
    return res.status(500).json({ success: false, error: 'Erreur récupération associations' });
  }
};




/**
 * POST /recurrences/:id/map   body: { transaction_id }
 * Associer une transaction à la récurrence
 */
exports.mapTransaction = async (req, res) => {
  try {
    const userId = req.session.userId;
    const recurrenceId = req.params.id;
    const { transaction_id } = req.body || {};

    if (!transaction_id) {
      return res.status(400).json({ success: false, error: 'transaction_id manquant' });
    }

    // 1) Contrôles basiques (propriété + nature)
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('id, user_id, nature')
      .eq('id', transaction_id)
      .single();

    if (txErr || !tx || String(tx.user_id) !== String(userId)) {
      return res.status(404).json({ success: false, error: 'Transaction introuvable' });
    }

    const rec = await RecurringTransaction.findById(recurrenceId);
    if (!rec || String(rec.user_id) !== String(userId)) {
      return res.status(404).json({ success: false, error: 'Récurrence introuvable' });
    }

    if (rec.nature !== tx.nature) {
      return res.status(400).json({ success: false, error: 'Nature incohérente (revenu/depense)' });
    }

    // 2) Création du mapping
    const mapping = await RecurrenceMapping.create({
      userId,
      transactionId: transaction_id,
      recurrenceId
    });

    return res.json({ success: true, mapping });
  } catch (e) {
    console.error('[recurrences.mapTransaction]', e);
    return res.status(500).json({ success: false, error: 'Erreur création mapping' });
  }
};

/**
 * DELETE /recurrences/map/:mapId
 * Dissocier une transaction
 */
exports.unmapTransaction = async (req, res) => {
  try {
    const userId = req.session.userId;
    const mapId = req.params.mapId;
    await RecurrenceMapping.remove({ userId, mapId });
    return res.json({ success: true });
  } catch (e) {
    console.error('[recurrences.unmapTransaction]', e);
    return res.status(500).json({ success: false, error: 'Erreur suppression mapping' });
  }
};
