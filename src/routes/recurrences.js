// src/routes/recurrences.js
const express = require('express');
const router = express.Router();

const controller = require('../controllers/recurrencesController');

// --- Résolution robuste du middleware d'auth ---
function resolveEnsureAuthenticated() {
  const mod = require('../middleware/auth'); // peut être une fonction, un objet, ou { default: fn }
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.ensureAuthenticated === 'function') return mod.ensureAuthenticated;
  if (mod && typeof mod.default === 'function') return mod.default;
  if (mod && mod.default && typeof mod.default.ensureAuthenticated === 'function') return mod.default.ensureAuthenticated;

  // Fallback: middleware no-op (évite le crash; à remplacer si tu veux forcer l’auth)
  console.warn('[recurrences routes] ensureAuthenticated introuvable — middleware neutralisé (no-op).');
  return (req, _res, next) => next();
}

const ensureAuthenticated = resolveEnsureAuthenticated();

// --- Routes pages & API ---
router.get('/', ensureAuthenticated, controller.showManagePage);
router.get('/all', ensureAuthenticated, controller.getAll);

// CRUD récurrences
router.post('/', ensureAuthenticated, controller.create);
router.post('/:id/delete', ensureAuthenticated, controller.remove);

// Mapping (associer/dissocier)
router.get('/:id/candidates', ensureAuthenticated, controller.listCandidates);
router.get('/:id/mappings', ensureAuthenticated, controller.listMappings);
router.post('/:id/map', ensureAuthenticated, controller.mapTransaction);
router.delete('/map/:mapId', ensureAuthenticated, controller.unmapTransaction);

module.exports = router;
