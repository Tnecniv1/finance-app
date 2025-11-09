const express = require('express');
const router = express.Router();
const ProjetValidationController = require('../controllers/projetValidationController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

// Page de validation d'un projet
router.get('/valider/:id', ProjetValidationController.afficherValidation);

// Valider un projet (attribution badge)
router.post('/valider/:id', ProjetValidationController.validerProjet);

module.exports = router;