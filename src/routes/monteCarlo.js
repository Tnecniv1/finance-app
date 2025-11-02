// src/routes/monteCarlo.js
const express = require('express');
const router = express.Router();
const monteCarloController = require('../controllers/monteCarloController');
const { requireAuth } = require('../middleware/auth');

// API pour obtenir la projection Monte Carlo (appelé en AJAX depuis la page Évolution)
router.get('/api/projection', requireAuth, monteCarloController.getProjection);

module.exports = router;