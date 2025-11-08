// src/services/cashflowMonteCarlo.js
// Monte Carlo de trésorerie — récurrences + événements fixes (option) + bruit résiduel
// Hypothèses :
// - transactions: { id, user_id, date (ISO), montant (number), nature ('revenu'|'depense') }
// - récurrences validées: via RecurringTransaction.findByUserId(userId)
// - mapping anti-double: table transaction_recurrence_mapping (si présente)
// - point d'entrée: runProjection({ userId, horizonWeeks=12, nSims=1000, startBalance })

const supabase = require('../../config/supabase');
const RecurringTransaction = require('../models/RecurringTransaction');

// ---------------- utils date ----------------
function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d, k) {
  const x = new Date(d);
  x.setDate(x.getDate() + k);
  return x;
}
function formatLabelWeek(i) {
  return `S${i + 1}`;
}
function clamp(x, min, max) {
  if (min != null && x < min) return min;
  if (max != null && x > max) return max;
  return x;
}
function randn() {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------- montant récurrent ----------------
function sampleRecurringAmount(rec) {
  const mean = rec.montant_moyen ?? null;
  const sd = rec.montant_ecart_type ?? rec.montant_std ?? null;
  const min = rec.montant_min ?? null;
  const max = rec.montant_max ?? null;

  let val;
  if (mean != null && sd != null && sd > 0) {
    val = mean + randn() * sd;
    val = clamp(val, min, max);
  } else if (min != null && max != null) {
    val = min + Math.random() * (max - min);
  } else if (mean != null) {
    val = mean;
  } else {
    val = 0;
  }

  // Signe selon nature
  if (rec.nature === 'depense' && val > 0) val = -Math.abs(val);
  if (rec.nature === 'revenu' && val < 0) val = Math.abs(val);
  return val;
}
function occursBernoulli(p = 1) {
  const prob = p == null ? 1 : Number(p);
  return Math.random() < prob;
}

// ---------------- planning récurrent ----------------
function buildRecurringSchedule(recurringList, startDate, endDate) {
  const schedule = []; // { date: Date, rec }
  recurringList.forEach((rec) => {
    const occs =
      RecurringTransaction.shouldOccurInPeriod(rec, startDate, endDate) || [];
    const jitter = Number(rec.jitter_days || 0);

    occs.forEach((oc) => {
      let d = new Date(oc);
      if (jitter > 0) {
        const shift = Math.floor(Math.random() * (2 * jitter + 1) - jitter);
        d = addDays(d, shift);
      }
      schedule.push({ date: toDateOnly(d), rec });
    });
  });

  schedule.sort((a, b) => a.date - b.date);
  return schedule;
}

// ---------------- bruit résiduel (bootstrap quotidien complet) ----------------
function buildResidualSampler(nonRecurringTx, lookbackDays = 365, mode = 'historical') {
  // 1) Série quotidienne complète (inclut les jours sans transaction)
  const today = toDateOnly(new Date());
  const start = addDays(today, -lookbackDays + 1);

  const byDay = new Map(); // 'YYYY-MM-DD' -> somme du jour (hors récurrences)
  for (const t of nonRecurringTx) {
    const d = toDateOnly(t.date);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(t.montant));
  }

  const series = [];
  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const key = toDateOnly(d).toISOString().slice(0, 10);
    series.push(byDay.get(key) ?? 0);
  }
  if (series.length === 0) return () => 0;

  // 2) Moyenne historique (peut être négative) et centrage
  const meanDaily = series.reduce((a, b) => a + b, 0) / series.length;
  const centered = series.map((v) => v - meanDaily);

  // 3) Plafond d'écart-type quotidien (stabilité)
  const sd = Math.sqrt(centered.reduce((s, v) => s + v * v, 0) / centered.length);
  const targetDailySd = Math.min(sd || 0, 50); // ~50 €/jour par défaut (ajuste)

  // 4) Sampler : bootstrap + éventuel rescaling
  return function sampleResidual() {
    const idx = Math.floor(Math.random() * centered.length);
    let v = centered[idx] || 0;
    if (sd > 0 && targetDailySd !== sd) v *= targetDailySd / sd;

    // mode:
    // - 'historical' => conserve la moyenne historique (drift réel)
    // - 'zero'       => moyenne forcée à 0
    return mode === 'zero' ? v : meanDaily + v;
  };
}

// ---------------- lecture données ----------------
async function fetchAllTransactions(userId) {
  const from = addDays(new Date(), -365).toISOString();
  const { data, error } = await supabase
    .from('transactions')
    .select('id, user_id, date, montant, nature')
    .eq('user_id', userId)
    .gte('date', from)
    .order('date', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchMappingTransactionIds(/* userId */) {
  // On récupère juste les transaction_id mappés; RLS filtrera côté Supabase si active.
  const { data, error } = await supabase
    .from('transaction_recurrence_mapping')
    .select('transaction_id, recurring_transaction_id');

  if (error) throw error;
  return new Set((data || []).map((r) => r.transaction_id));
}

function splitResidualVsRecurring(allTx, mappedTxIds) {
  const nonRecurring = [];
  const recurringTx = [];
  for (const t of allTx) {
    if (mappedTxIds.has(t.id)) recurringTx.push(t);
    else nonRecurring.push(t);
  }
  return { nonRecurring, recurringTx };
}

function computeCurrentBalanceFromHistory(allTx) {
  return allTx.reduce((acc, t) => acc + Number(t.montant), 0);
}

// ---------------- simulation ----------------
function simulatePaths({ startBalance, horizonDays, nSims, recurringSchedule, residualSample }) {
  // index des occurrences récurrentes par jour (ISO date -> [rec,...])
  const occMap = new Map();
  for (const { date, rec } of recurringSchedule) {
    const key = date.toISOString().slice(0, 10);
    const arr = occMap.get(key) || [];
    arr.push(rec);
    occMap.set(key, arr);
  }

  const paths = []; // tableau de trajectoires; chaque traj = [bal_j0, bal_j1, ...]
  const negHitFlags = new Array(nSims).fill(false);

  for (let s = 0; s < nSims; s++) {
    let bal = Number(startBalance);
    const daily = [bal]; // j0 = S0 (solde initial)

    for (let d = 0; d < horizonDays; d++) {
      const dateKey = toDateOnly(addDays(new Date(), d + 1))
        .toISOString()
        .slice(0, 10);

      // 1) récurrences du jour
      const recs = occMap.get(dateKey) || [];
      for (const rec of recs) {
        const p = rec.p_occurrence == null ? 1 : Number(rec.p_occurrence);
        if (occursBernoulli(p)) {
          bal += sampleRecurringAmount(rec);
        }
      }

      // 2) bruit résiduel (net quotidien hors récurrences)
      bal += residualSample();

      daily.push(bal);
      if (bal < 0) negHitFlags[s] = true;
    }

    paths.push(daily);
  }

  // Agrégation en percentiles
  const percentiles = (arr, ps) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return ps.map((p) => {
      const k = (sorted.length - 1) * p;
      const f = Math.floor(k);
      const c = Math.ceil(k);
      if (f === c) return sorted[f];
      return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
    });
  };

  // Échantillonnage hebdo (12 points)
  const weeks = 12;
  const step = Math.floor(horizonDays / weeks); // ≈7
  const labels = Array.from({ length: weeks }, (_, i) => formatLabelWeek(i));
  const seriesP10 = [];
  const seriesP50 = [];
  const seriesP90 = [];

  for (let w = 1; w <= weeks; w++) {
    const dayIndex = Math.min(w * step, horizonDays); // index dans daily
    const values = paths.map((path) => path[dayIndex]);
    const [p10, p50, p90] = percentiles(values, [0.1, 0.5, 0.9]);
    seriesP10.push(p10);
    seriesP50.push(p50);
    seriesP90.push(p90);
  }

  const riskAnyNegative = negHitFlags.filter(Boolean).length / nSims;

  return {
    labels,
    p10: seriesP10,
    p50: seriesP50,
    p90: seriesP90,
    riskAnyNegative,
  };
}

// ---------------- API principale ----------------
async function runProjection({ userId, horizonWeeks = 12, nSims = 1000, startBalance }) {
  const horizonDays = horizonWeeks * 7;

  // 1) données
  const [allTx, recurringList, mappedIds] = await Promise.all([
    fetchAllTransactions(userId),
    RecurringTransaction.findByUserId(userId),
    fetchMappingTransactionIds(userId),
  ]);

  const { nonRecurring } = splitResidualVsRecurring(allTx, mappedIds);

  // 2) solde initial (priorité au snapshot reçu)
  const soldeActuel =
    startBalance != null ? Number(startBalance) : computeCurrentBalanceFromHistory(allTx);

  // 3) planning récurrent
  const startDate = toDateOnly(new Date());
  const endDate = addDays(startDate, horizonDays);
  const recurringSchedule = buildRecurringSchedule(recurringList || [], startDate, endDate);

  // 4) bruit résiduel (bootstrap quotidien complet)
  const residualSample = buildResidualSampler(nonRecurring); // moyenne historique conservée

  // 5) simulation
  const result = simulatePaths({
    startBalance: soldeActuel,
    horizonDays,
    nSims,
    recurringSchedule,
    residualSample,
  });

  // 🔹 Afficher explicitement le solde initial comme premier point "S0"
  result.labels.unshift('S0');
  result.p10.unshift(Number(soldeActuel));
  result.p50.unshift(Number(soldeActuel));
  result.p90.unshift(Number(soldeActuel));

  // 6) format Chart.js
  const projection = {
    labels: result.labels,
    datasets: [
      {
        label: 'P10 (pessimiste)',
        data: result.p10,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      },
      {
        label: 'P50 (médiane)',
        data: result.p50,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      },
      {
        label: 'P90 (optimiste)',
        data: result.p90,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 2,
        fill: false,
        tension: 0.25,
      },
    ],
  };

  const metrics = {
    soldeActuel: soldeActuel,
    soldeMedianFinal: result.p50[result.p50.length - 1],
    risqueNegatif: Math.round(result.riskAnyNegative * 10000) / 100, // %
  };

  return { projection, metrics };
}

module.exports = { runProjection };

