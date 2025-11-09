const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const MaisonController = require('../controllers/maisonController');

// Redirection de la racine vers /maison
router.get('/', requireAuth, (req, res) => {
    res.redirect('/maison');
});

// Page Maison (avec visualisation de progression)
router.get('/maison', requireAuth, MaisonController.afficherMaison);

// Page Optimiser (vide pour le moment)
router.get('/optimiser', requireAuth, (req, res) => {
    res.render('transactions/optimiser', {
        user: req.session.user
    });
});

// Page Progression - Redirige vers les vues existantes
router.get('/progression', requireAuth, (req, res) => {
    // Par défaut, redirige vers la vue liste
    res.redirect('/transactions');
});

module.exports = router;