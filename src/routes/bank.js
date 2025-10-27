const express = require('express');
const router = express.Router();
const BankController = require('../controllers/bankController');
const { requireAuth } = require('../middleware/auth');

// Appliquer le middleware d'authentification à toutes les routes
router.use(requireAuth);

// Initier la connexion bancaire (génère l'URL et redirige)
router.get('/initiate', BankController.initiateConnection);

// Afficher la page de connexion bancaire
router.get('/connect', BankController.showConnectBank);

// Callback après connexion Bridge
router.get('/callback', BankController.handleBridgeCallback);

// Synchroniser une connexion
router.post('/:connectionId/sync', BankController.syncConnection);

// Supprimer une connexion
router.post('/:connectionId/delete', BankController.deleteConnection);

module.exports = router;