const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

router.get('/graph', TransactionController.graphView);

router.get('/pie', TransactionController.pieView);

router.get('/', TransactionController.index);

router.post('/:id/categorize', TransactionController.categorize);

router.post('/categorize-bulk', TransactionController.categorizeBulk);

// 🤖 Routes IA
router.post('/ai/generate-suggestions', TransactionController.generateSuggestions);
router.post('/ai/suggestions/:id/accept', TransactionController.acceptSuggestion);
router.post('/ai/suggestions/:id/reject', TransactionController.rejectSuggestion);
router.get('/ai/stats', TransactionController.aiStats);

// Supprimer une transaction
router.post('/:id/delete', TransactionController.delete);

module.exports = router;