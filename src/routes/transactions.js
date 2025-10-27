const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');

// Appliquer le middleware d'authentification à toutes les routes
router.use(requireAuth);

// Routes des transactions
router.get('/', TransactionController.showTransactions);
router.post('/', TransactionController.createTransaction);
router.post('/:id/delete', TransactionController.deleteTransaction);

module.exports = router;