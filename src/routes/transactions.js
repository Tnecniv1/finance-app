const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

// Afficher les transactions avec filtres
router.get('/', TransactionController.index);

// Catégoriser une transaction
router.post('/:id/categorize', TransactionController.categorize);

// Catégoriser plusieurs transactions en masse
router.post('/categorize-bulk', TransactionController.categorizeBulk);

// Supprimer une transaction
router.post('/:id/delete', TransactionController.delete);

module.exports = router;