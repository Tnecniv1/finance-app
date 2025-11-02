// src/controllers/monteCarloController.js
const Transaction = require('../models/Transaction');
const RecurringTransaction = require('../models/RecurringTransaction');

/**
 * Génère la projection Monte Carlo avec récurrences
 */
exports.getProjection = async (req, res) => {
  try {
    const userId = req.session.userId;

    // 1. Récupérer toutes les transactions de l'utilisateur
    const allTransactions = await Transaction.findByUserId(userId);

    // 2. Récupérer les récurrences validées
    const recurrences = await RecurringTransaction.findByUserId(userId);

    console.log(`📊 ${allTransactions.length} transactions totales`);
    console.log(`🔁 ${recurrences.length} récurrences validées`);

    // 3. Séparer les transactions récurrentes des ponctuelles
    const { recurring, ponctual } = await separateTransactions(allTransactions, recurrences);

    console.log(`✅ ${recurring.length} transactions récurrentes identifiées`);
    console.log(`💰 ${ponctual.length} transactions ponctuelles`);

    // 4. Calculer le solde actuel
    let soldeActuel = 0;
    allTransactions.forEach(t => {
      if (t.nature === 'revenu') {
        soldeActuel += parseFloat(t.montant);
      } else {
        soldeActuel -= parseFloat(t.montant);
      }
    });

    // 5. Calculer moyennes et écarts-types UNIQUEMENT sur le ponctuel
    const stats = calculateWeeklyStats(ponctual);

    console.log(`📈 Stats ponctuelles - Revenus: ${stats.revenuMoyen.toFixed(2)}€/sem (±${stats.revenuEcartType.toFixed(2)})`);
    console.log(`📉 Stats ponctuelles - Dépenses: ${stats.depenseMoyenne.toFixed(2)}€/sem (±${stats.depenseEcartType.toFixed(2)})`);

    // 6. Simulation Monte Carlo (1000 simulations sur 12 semaines)
    const nbSimulations = 1000;
    const nbSemaines = 12;
    const simulations = [];

    for (let sim = 0; sim < nbSimulations; sim++) {
      const trajectory = [soldeActuel];
      let solde = soldeActuel;

      for (let week = 1; week <= nbSemaines; week++) {
        const dateDebut = addWeeks(new Date(), week - 1);
        const dateFin = addWeeks(dateDebut, 1);

        // ✅ PARTIE DÉTERMINISTE : Récurrences fixes
        const fluxRecurrents = calculateRecurringFlows(recurrences, dateDebut, dateFin);
        
        // ✅ PARTIE STOCHASTIQUE : Flux ponctuels aléatoires
        const revenuPonctuel = randomNormal(stats.revenuMoyen, stats.revenuEcartType);
        const depensePonctuelle = randomNormal(stats.depenseMoyenne, stats.depenseEcartType);
        
        // Mise à jour du solde
        solde += fluxRecurrents.revenus;
        solde -= fluxRecurrents.depenses;
        solde += revenuPonctuel;
        solde -= depensePonctuelle;
        
        trajectory.push(solde);
      }

      simulations.push(trajectory);
    }

    // 7. Calculer percentiles (P10, P50, P90)
    const percentiles = calculatePercentiles(simulations, nbSemaines);

    // 8. Préparer les données pour Chart.js
    const labels = ['Aujourd\'hui'];
    for (let i = 1; i <= nbSemaines; i++) {
      labels.push(`S${i}`);
    }

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Meilleur scénario (10% de chance)',
          data: percentiles.p90,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.4
        },
        {
          label: 'Scénario probable (50/50)',
          data: percentiles.p50,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.2)',
          borderWidth: 3,
          fill: false,
          tension: 0.4
        },
        {
          label: 'Pire scénario (10% de risque)',
          data: percentiles.p10,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.4
        }
      ]
    };

    // 9. Métriques et alertes
    const soldeMedianFinal = percentiles.p50[nbSemaines];
    const risqueNegatif = calculateRisqueNegatif(simulations, nbSemaines);

    let alert = null;
    if (risqueNegatif > 30) {
      alert = {
        level: 'danger',
        message: `⚠️ Attention : ${risqueNegatif.toFixed(0)}% de risque de solde négatif dans 12 semaines`
      };
    } else if (risqueNegatif > 10) {
      alert = {
        level: 'warning',
        message: `⚡ Vigilance : ${risqueNegatif.toFixed(0)}% de risque de solde négatif`
      };
    } else {
      alert = {
        level: 'success',
        message: `✅ Situation stable : ${risqueNegatif.toFixed(0)}% de risque seulement`
      };
    }

    // 10. Réponse
    res.json({
      success: true,
      projection: chartData,
      metrics: {
        soldeActuel: Math.round(soldeActuel * 100) / 100,
        soldeMedianFinal: Math.round(soldeMedianFinal * 100) / 100,
        risqueNegatif: Math.round(risqueNegatif * 100) / 100,
        revenuMoyenHebdo: Math.round(stats.revenuMoyen * 100) / 100,
        depenseMoyenneHebdo: Math.round(stats.depenseMoyenne * 100) / 100,
        nbRecurrences: recurrences.length,
        nbTransactionsPonctuelles: ponctual.length
      },
      alert
    });

  } catch (error) {
    console.error('Erreur Monte Carlo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération de la projection'
    });
  }
};

// ===============================
// Fonctions utilitaires
// ===============================

/**
 * Sépare les transactions en récurrentes et ponctuelles
 */
async function separateTransactions(allTransactions, recurrences) {
  const recurringTxIds = [];
  
  // Récupérer les IDs de toutes les transactions liées aux récurrences
  for (const rec of recurrences) {
    const txIds = await RecurringTransaction.getTransactionsByRecurringId(rec.id);
    recurringTxIds.push(...txIds);
  }

  const recurring = [];
  const ponctual = [];

  allTransactions.forEach(tx => {
    if (recurringTxIds.includes(tx.id)) {
      recurring.push(tx);
    } else {
      ponctual.push(tx);
    }
  });

  return { recurring, ponctual };
}

/**
 * Calcule les flux récurrents qui tombent dans une période
 */
function calculateRecurringFlows(recurrences, dateDebut, dateFin) {
  let revenus = 0;
  let depenses = 0;

  recurrences.forEach(rec => {
    const occurrences = RecurringTransaction.shouldOccurInPeriod(rec, dateDebut, dateFin);

    occurrences.forEach(() => {
      let montant = rec.montant_moyen;

      // Si variabilité > 0, ajouter du bruit
      if (rec.variabilite_pct > 0) {
        const ecartType = montant * rec.variabilite_pct / 100;
        const variation = randomNormal(0, ecartType);
        montant += variation;
      }

      if (rec.nature === 'revenu') {
        revenus += Math.max(0, montant);
      } else {
        depenses += Math.max(0, montant);
      }
    });
  });

  return { revenus, depenses };
}

/**
 * Calcule les statistiques hebdomadaires (moyenne et écart-type)
 */
function calculateWeeklyStats(transactions) {
  const weeks = {};

  transactions.forEach(t => {
    const date = new Date(t.date);
    const weekKey = getWeekKey(date);

    if (!weeks[weekKey]) {
      weeks[weekKey] = { revenus: 0, depenses: 0 };
    }

    if (t.nature === 'revenu') {
      weeks[weekKey].revenus += parseFloat(t.montant);
    } else {
      weeks[weekKey].depenses += parseFloat(t.montant);
    }
  });

  const weeklyRevenus = Object.values(weeks).map(w => w.revenus);
  const weeklyDepenses = Object.values(weeks).map(w => w.depenses);

  return {
    revenuMoyen: mean(weeklyRevenus) || 0,
    revenuEcartType: stdDev(weeklyRevenus) || 50,
    depenseMoyenne: mean(weeklyDepenses) || 0,
    depenseEcartType: stdDev(weeklyDepenses) || 50
  };
}

/**
 * Ajoute des semaines à une date
 */
function addWeeks(date, weeks) {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

/**
 * Génère une clé unique pour chaque semaine
 */
function getWeekKey(date) {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week}`;
}

/**
 * Calcule le numéro de semaine
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Moyenne
 */
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Écart-type
 */
function stdDev(arr) {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Génération aléatoire normale (Box-Muller)
 */
function randomNormal(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/**
 * Calcule les percentiles P10, P50, P90
 */
function calculatePercentiles(simulations, nbSemaines) {
  const p10 = [];
  const p50 = [];
  const p90 = [];

  for (let week = 0; week <= nbSemaines; week++) {
    const values = simulations.map(sim => sim[week]).sort((a, b) => a - b);
    
    p10.push(values[Math.floor(values.length * 0.1)]);
    p50.push(values[Math.floor(values.length * 0.5)]);
    p90.push(values[Math.floor(values.length * 0.9)]);
  }

  return { p10, p50, p90 };
}

/**
 * Calcule le % de simulations qui finissent en négatif
 */
function calculateRisqueNegatif(simulations, nbSemaines) {
  const negatives = simulations.filter(sim => sim[nbSemaines] < 0).length;
  return (negatives / simulations.length) * 100;
}