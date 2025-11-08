// src/models/RecurrenceMapping.js
const supabase = require('../../config/supabase');

/**
 * Crée une association transaction ↔ récurrence.
 */
async function create({ userId, transactionId, recurrenceId }) {
  const { data, error } = await supabase
    .from('transaction_recurrence_mapping')
    .insert({
      user_id: String(userId),
      transaction_id: transactionId,
      recurring_transaction_id: recurrenceId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Supprime une association par son id (sécurisé par userId).
 */
async function remove({ userId, mapId }) {
  const { error } = await supabase
    .from('transaction_recurrence_mapping')
    .delete()
    .eq('id', mapId)
    .eq('user_id', String(userId));
  if (error) throw error;
  return true;
}

/**
 * Liste les associations pour une récurrence donnée,
 * puis récupère les transactions liées en 2 requêtes (robuste sans relation PostgREST).
 */
async function listForRecurrence({ userId, recurrenceId }) {
  // 1) Mappings
  const { data: maps, error: mErr } = await supabase
    .from('transaction_recurrence_mapping')
    .select('id, transaction_id, matched_at')
    .eq('user_id', String(userId))
    .eq('recurring_transaction_id', recurrenceId)
    .order('matched_at', { ascending: false });
  if (mErr) throw mErr;

  const ids = (maps || []).map(m => m.transaction_id);
  if (!ids.length) return [];

  // 2) Transactions liées (on récupère "objet" et on fabrique libelle côté JS)
  const { data: txs, error: tErr } = await supabase
    .from('transactions')
    .select('id, date, objet, montant, nature')
    .in('id', ids);
  if (tErr) throw tErr;

  const byId = Object.fromEntries((txs || []).map(t => [t.id, t]));

  // 3) Merge
  return (maps || []).map(m => {
    const t = byId[m.transaction_id] || null;
    const label = t ? (t.objet || '') : '';
    return {
      id: m.id,
      transaction_id: m.transaction_id,
      matched_at: m.matched_at,
      transactions: t ? { ...t, libelle: label } : null,
    };
  });
}

/**
 * Suggère des transactions candidates à associer :
 * - même utilisateur, même nature
 * - 180 jours de lookback
 * - exclut TOUTES les transactions déjà mappées (toutes récurrences)
 * - tri léger par proximité du montant moyen si dispo
 * - filtre par titre (si présent) dans le libellé (fallback libelle = objet)
 */
async function suggestCandidates({ userId, recurrence }) {
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 180);

  // 1) Récupère toutes les transactions déjà mappées de l'utilisateur
  const { data: mappedAll, error: mapAllErr } = await supabase
    .from('transaction_recurrence_mapping')
    .select('transaction_id')
    .eq('user_id', String(userId));
  if (mapAllErr) throw mapAllErr;

  const exclude = new Set((mappedAll || []).map(m => String(m.transaction_id)));

  // 2) Récupère des candidates BRUTES (sans NOT IN, on filtrera côté JS)
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, objet, montant, nature')
    .eq('user_id', String(userId))
    .eq('nature', recurrence.nature)
    .gte('date', lookback.toISOString())
    .order('date', { ascending: false })
    .limit(200); // on prend un peu de marge

  if (error) throw error;

  // 3) Filtre côté JS: on exclut celles déjà mappées
  const rows0 = (data || []).filter(t => !exclude.has(String(t.id)));

  // 4) Uniformise le libellé côté JS
  const rows = rows0.map(t => ({ ...t, libelle: t.objet || '' }));

  // 5) Tri par proximité du montant moyen si dispo
  const mean = Number(recurrence.montant_moyen || recurrence.montant || 0) || 0;
  const ranked = mean
    ? [...rows].sort(
        (a, b) =>
          Math.abs(Number(a.montant) - mean) - Math.abs(Number(b.montant) - mean)
      )
    : rows;

  // 6) Filtre par titre (facultatif)
  const title = (recurrence.titre || recurrence.title || '').toLowerCase();
  const filtered = title
    ? ranked.filter(t => (t.libelle || '').toLowerCase().includes(title))
    : ranked;

  // 7) On renvoie les 20 meilleurs
  return filtered.slice(0, 20);
}

module.exports = {
  create,
  remove,
  listForRecurrence,
  suggestCandidates,
};
