const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { redirectIfAuthenticated } = require('../middleware/auth');

// Routes d'inscription
router.get('/register', redirectIfAuthenticated, AuthController.showRegister);
router.post('/register', redirectIfAuthenticated, AuthController.register);

// Routes de connexion
router.get('/login', redirectIfAuthenticated, AuthController.showLogin);
router.post('/login', redirectIfAuthenticated, AuthController.login);

// Route de déconnexion
router.get('/logout', AuthController.logout);

module.exports = router;