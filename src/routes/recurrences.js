// src/routes/recurrences.js
const express = require('express');
const router = express.Router();
const recurrenceController = require('../controllers/recurrenceController');
const { requireAuth } = require('../middleware/auth');

// ==========================================
// ROUTES DE DÉTECTION AUTOMATIQUE
// ==========================================

/**
 * POST /recurrences/detect
 * Lance la détection automatique des récurrences
 */
router.post('/detect', requireAuth, recurrenceController.detectRecurrences);

/**
 * GET /recurrences/pending
 * Récupère les détections en attente de validation
 */
router.get('/pending', requireAuth, recurrenceController.getPendingDetections);

/**
 * POST /recurrences/validate/:detectionId
 * Valide une détection (la transforme en récurrence active)
 */
router.post('/validate/:detectionId', requireAuth, recurrenceController.validateDetection);

/**
 * POST /recurrences/reject/:detectionId
 * Rejette une détection
 */
router.post('/reject/:detectionId', requireAuth, recurrenceController.rejectDetection);


// ==========================================
// ROUTES DE GESTION DES RÉCURRENCES
// ==========================================

/**
 * GET /recurrences
 * Récupère toutes les récurrences validées de l'utilisateur
 */
router.get('/', requireAuth, recurrenceController.getRecurrences);

/**
 * POST /recurrences
 * Crée une nouvelle récurrence manuellement
 */
router.post('/', requireAuth, recurrenceController.createRecurrence);

/**
 * PUT /recurrences/:id
 * Met à jour une récurrence
 */
router.put('/:id', requireAuth, recurrenceController.updateRecurrence);

/**
 * DELETE /recurrences/:id
 * Désactive une récurrence
 */
router.delete('/:id', requireAuth, recurrenceController.deleteRecurrence);


// ==========================================
// NOUVELLES ROUTES - GESTION MANUELLE
// ==========================================

/**
 * POST /recurrences/create-from-transactions
 * Crée une récurrence à partir d'une sélection de transactions
 * 
 * Body: {
 *   transaction_ids: ["uuid1", "uuid2", ...],
 *   custom_data: {
 *     pattern_description: "Nom personnalisé",
 *     frequency: "monthly",
 *     amount: 2500.00
 *   }
 * }
 */
router.post('/create-from-transactions', requireAuth, 
  recurrenceController.createRecurrenceFromTransactions);

/**
 * POST /recurrences/:recurringId/add-transaction
 * Ajoute une transaction à une récurrence existante
 * 
 * Body: {
 *   transaction_id: "uuid"
 * }
 */
router.post('/:recurringId/add-transaction', requireAuth, 
  recurrenceController.addTransactionToRecurrence);

/**
 * DELETE /recurrences/:recurringId/transactions/:transactionId
 * Retire une transaction d'une récurrence
 */
router.delete('/:recurringId/transactions/:transactionId', requireAuth, 
  recurrenceController.removeTransactionFromRecurrence);

/**
 * GET /recurrences/:recurringId/suggested-transactions
 * Récupère les transactions candidates pour une récurrence
 * (transactions similaires non encore associées)
 */
router.get('/:recurringId/suggested-transactions', requireAuth, 
  recurrenceController.getSuggestedTransactions);


// ==========================================
// ROUTES DE PAGES (RENDU HTML)
// ==========================================

/**
 * GET /recurrences/validate
 * Page de validation des détections
 */
router.get('/validate', requireAuth, recurrenceController.showValidationPage);

/**
 * GET /recurrences/manage
 * Page de gestion manuelle des récurrences
 */
router.get('/manage', requireAuth, recurrenceController.showManagePage);

module.exports = router;