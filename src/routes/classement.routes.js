const express = require('express');
const router = express.Router();
const ClassementController = require('../controllers/classementController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent l'authentification
router.use(requireAuth);

// Page principale du classement
router.get('/', ClassementController.afficherClassement);

module.exports = router;