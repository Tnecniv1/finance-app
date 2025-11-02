// src/routes/recurrences.js
const express = require('express');
const router = express.Router();
const recurrenceController = require('../controllers/recurrenceController');
const { requireAuth } = require('../middleware/auth');

// ===============================
// ROUTES HTML (Pages)
// ===============================

/**
 * Page de validation des récurrences détectées
 * GET /recurrences/validate
 */
router.get('/validate', requireAuth, recurrenceController.showValidationPage);


// ===============================
// ROUTES API (JSON)
// ===============================

/**
 * Lance la détection automatique
 * POST /api/recurrences/detect
 */
router.post('/api/detect', requireAuth, recurrenceController.detectRecurrences);

/**
 * Récupère les détections en attente
 * GET /api/recurrences/detections
 */
router.get('/api/detections', requireAuth, recurrenceController.getPendingDetections);

/**
 * Valide une détection
 * POST /api/recurrences/detections/:detectionId/validate
 */
router.post('/api/detections/:detectionId/validate', requireAuth, recurrenceController.validateDetection);

/**
 * Rejette une détection
 * POST /api/recurrences/detections/:detectionId/reject
 */
router.post('/api/detections/:detectionId/reject', requireAuth, recurrenceController.rejectDetection);

/**
 * Récupère toutes les récurrences validées
 * GET /api/recurrences
 */
router.get('/api/list', requireAuth, recurrenceController.getRecurrences);

/**
 * Crée une récurrence manuellement
 * POST /api/recurrences
 */
router.post('/api/create', requireAuth, recurrenceController.createRecurrence);

/**
 * Met à jour une récurrence
 * PUT /api/recurrences/:id
 */
router.put('/api/:id', requireAuth, recurrenceController.updateRecurrence);

/**
 * Désactive une récurrence
 * DELETE /api/recurrences/:id
 */
router.delete('/api/:id', requireAuth, recurrenceController.deleteRecurrence);

module.exports = router;