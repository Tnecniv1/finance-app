// src/models/AccountSnapshot.js
const supabase = require('../../config/supabase');

/**
 * Retourne le dernier solde (snapshot) pour l'utilisateur, ou 0 si absent.
 */
async function getLatestSnapshot(userId) {
  // log à l'intérieur de la fonction (userId est un paramètre ici)
  console.log('[Snapshot] lookup for userId =', userId);

  const { data, error } = await supabase
    .from('account_snapshot')
    .select('balance, date_snapshot')
    .eq('user_id', String(userId))            // cast en string : robuste si userId est numérique
    .order('date_snapshot', { ascending: false })
    .limit(1)
    .maybeSingle();                           // renvoie { data: null, error: null } si pas de snapshot

  if (error) {
    console.error('[Snapshot] supabase error:', error);
    throw error;
  }

  const balance = data?.balance ?? 0;
  console.log('[Snapshot] latest balance =', balance);
  return Number(balance);
}

module.exports = { getLatestSnapshot };
