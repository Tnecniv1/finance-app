const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Redirection de la racine vers /maison
router.get('/', requireAuth, (req, res) => {
    res.redirect('/maison');
});

// Page Maison (avec 3 blocs : Optimiser, Progression, Classement)
router.get('/maison', requireAuth, (req, res) => {
    res.render('transactions/maison', {
        user: req.session.user
    });
});

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

// Page Classement (vide pour le moment)
router.get('/classement', requireAuth, (req, res) => {
    res.render('transactions/classement', {
        user: req.session.user
    });
});

// Page Infos (vide pour le moment)
router.get('/infos', requireAuth, (req, res) => {
    res.render('transactions/infos', {
        user: req.session.user
    });
});

module.exports = router;