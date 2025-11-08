// src/controllers/monteCarloController.js
const { runProjection } = require('../services/cashflowMonteCarlo');
const { getLatestSnapshot } = require('../models/AccountSnapshot');

exports.getProjection = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Non authentifié' });
    }

    // Paramètres
    const weeks = Math.max(1, Number(req.query.weeks || 12));
    const nSims = Math.max(100, Number(req.query.numSimulations || 1000));

    // 1) Solde initial = snapshot en base
    let startBalance = await getLatestSnapshot(userId);
    console.log('[Projection] session userId =', userId);
    console.log('[Projection] startBalance utilisé =', startBalance);




    // 2) Override possible par query (utile pour tests manuels)
    if (req.query.startBalance != null && req.query.startBalance !== '') {
      const parsed = Number(req.query.startBalance);
      if (!Number.isNaN(parsed)) startBalance = parsed;
    }

    // 3) Projection
    const { projection, metrics } = await runProjection({
      userId,
      horizonWeeks: weeks,
      nSims,
      startBalance
    });

    return res.json({ success: true, projection, metrics });
  } catch (err) {
    console.error('[MonteCarlo] getProjection error:', err);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la projection Monte Carlo'
    });
  }
};
