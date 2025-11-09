const express = require('express');
const router = express.Router();
const InfosController = require('../controllers/infosController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

// Page Infos
router.get('/', InfosController.afficherInfos);

// Mise à jour profil
router.post('/update-profile', InfosController.updateProfile);

// CRUD Projets
router.post('/projet/create', InfosController.createProjet);
router.post('/projet/set-active/:id', InfosController.setActiveProjet);
router.post('/projet/update/:id', InfosController.updateProjet);
router.post('/projet/delete/:id', InfosController.deleteProjet);

module.exports = router;