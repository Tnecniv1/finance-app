const express = require('express');
const router = express.Router();
const ProfilController = require('../controllers/profilController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

// Afficher le profil public d'un utilisateur
router.get('/:userId', ProfilController.afficherProfil);

module.exports = router;