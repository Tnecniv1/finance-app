const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

// ✨ NOUVELLE ROUTE : Vue graphique (DOIT être AVANT la route '/')
router.get('/graph', TransactionController.graphView);

// Afficher les transactions avec filtres et suggestions IA
router.get('/', TransactionController.index);

// Catégoriser une transaction (avec apprentissage IA)
router.post('/:id/categorize', TransactionController.categorize);

// Catégoriser plusieurs transactions en masse (avec apprentissage IA)
router.post('/categorize-bulk', TransactionController.categorizeBulk);

// 🤖 Routes IA
router.post('/ai/generate-suggestions', TransactionController.generateSuggestions);
router.post('/ai/suggestions/:id/accept', TransactionController.acceptSuggestion);
router.post('/ai/suggestions/:id/reject', TransactionController.rejectSuggestion);
router.get('/ai/stats', TransactionController.aiStats);

// Supprimer une transaction
router.post('/:id/delete', TransactionController.delete);

module.exports = router;