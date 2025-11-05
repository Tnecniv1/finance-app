// src/routes/optimisation.js
const express = require('express');
const router = express.Router();
const OptimisationController = require('../controllers/optimisationController');
const { requireAuth } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(requireAuth);

// ===============================
// DÉMARRAGE
// ===============================

// Page de dashboard (tableau de bord comparatif)
router.get('/start', OptimisationController.start);

// Démarrer une nouvelle optimisation
router.get('/nouveau', OptimisationController.nouveauBudget);

// Initialiser une nouvelle session
router.post('/init', OptimisationController.initSession);

// Annuler la session en cours
router.post('/cancel', OptimisationController.cancelSession);


// ===============================
// ÉTAPE 1 : REVENUS
// ===============================

router.get('/etape1', OptimisationController.etape1Revenus);
router.post('/etape1', OptimisationController.saveRevenus);


// ===============================
// ÉTAPE 2 : DÉPENSES
// ===============================

// Afficher une catégorie spécifique (ou rediriger vers la première)
router.get('/etape2/:categoryId?', OptimisationController.etape2Depenses);

// Sauvegarder une catégorie
router.post('/etape2/:categoryId', OptimisationController.saveDepense);


// ===============================
// ÉTAPE 3 : RÉCAPITULATIF
// ===============================

router.get('/etape3', OptimisationController.etape3Recapitulatif);
router.post('/etape3/validate', OptimisationController.validateOptimisation);


// ===============================
// RECTANGLE IMPRIMABLE
// ===============================

router.get('/rectangle/:sessionId', OptimisationController.genererRectangle);


// ===============================
// GESTION DES ACTIONS
// ===============================

// Formulaire d'ajout d'action
router.get('/action/add', OptimisationController.addActionForm);

// Créer une action
router.post('/action/add', OptimisationController.addAction);

// Changer le statut d'une action (AJAX)
router.post('/action/:id/toggle', OptimisationController.toggleAction);

// Supprimer une action (AJAX)
router.delete('/action/:id', OptimisationController.deleteAction);


// ===============================
// HISTORIQUE
// ===============================

router.get('/historique', OptimisationController.historique);


module.exports = router;