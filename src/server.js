// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

// Import des middlewares de sécurité
const { 
  securityMiddleware, 
  authLimiter, 
  powensApiLimiter, 
  webhookLimiter 
} = require('./middleware/security');

// Import des routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const csvRoutes = require('./routes/csv');
const mainRoutes = require('./routes/main');
const monteCarloRoutes = require('./routes/monteCarlo');
const recurrenceRoutes = require('./routes/recurrences');
const optimisationRoutes = require('./routes/optimisation');
const classementRoutes = require('./routes/classement.routes');
const powensWebhookRouter = require('./routes/powensWebhook');
const powensCallbackRoutes = require('./routes/powensCallback');
const powensSyncRoute = require('./routes/powensSync');
const infosRoutes = require('./routes/infos'); 
const projetValidationRoutes = require('./routes/projetValidation.routes');
const profilRoutes = require('./routes/profil.routes');

const PORT = process.env.PORT || 3000;
const app = express();

// ========================================
// CONFIGURATION DE BASE
// ========================================

// Trust proxy (pour cookies secure derrière Render/Proxy)
app.set('trust proxy', 1);

// Vues & statiques
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========================================
// MIDDLEWARE DE SÉCURITÉ
// ⚠️ IMPORTANT : À appliquer AVANT les autres middlewares
// ========================================
securityMiddleware(app);

// ========================================
// MIDDLEWARE DE PARSING
// ========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// SESSIONS
// ========================================
const isProd = process.env.NODE_ENV === 'production';

app.use(session({
  secret: process.env.SESSION_SECRET || 'votre-secret-a-changer-URGENT',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,          // true uniquement en HTTPS
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 heures
  },
}));

// ========================================
// ROUTES PUBLIQUES (sans authentification)
// ========================================

// Pages légales
app.get('/politique-confidentialite', (req, res) => {
  res.render('legal/politique-confidentialite', {
    companyName: 'Vincent Le Barbey',
    companyEmail: process.env.CONTACT_EMAIL || 'contact@finance-app.com',
    companyAddress: process.env.COMPANY_ADDRESS || '[Votre adresse]',
    siret: process.env.SIRET || '[Votre SIRET]',
    lastUpdate: '13 novembre 2025'
  });
});

app.get('/cgu', (req, res) => {
  res.render('legal/cgu', {
    companyName: 'Vincent Le Barbey',
    companyEmail: process.env.CONTACT_EMAIL || 'contact@finance-app.com',
    lastUpdate: '13 novembre 2025'
  });
});

// Route d'accueil
app.use('/', mainRoutes);

// ========================================
// ROUTES D'AUTHENTIFICATION (avec rate limiting)
// ========================================
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth', authRoutes);

// ========================================
// ROUTES API POWENS (avec rate limiting spécifique)
// ========================================

// Webhooks Powens (rate limit strict)
app.use('/api/powens/webhook', webhookLimiter, powensWebhookRouter);

// Synchronisation Powens (rate limit API)
app.use('/api/powens/sync', powensApiLimiter, powensSyncRoute);

// Autres routes API Powens
app.use('/api', powensWebhookRouter);
app.use('/api', powensSyncRoute);

// Callback Powens (pas de rate limit, géré par Powens)
app.use(powensCallbackRoutes);

// ========================================
// ROUTES APPLICATIVES (nécessitent authentification)
// ========================================
app.use('/transactions', transactionRoutes);
app.use('/transactions/import-csv', csvRoutes);
app.use('/recurrences', recurrenceRoutes);
app.use('/optimisation', optimisationRoutes);
app.use('/infos', infosRoutes);
app.use('/classement', classementRoutes);
app.use('/projet', projetValidationRoutes);
app.use('/profil', profilRoutes);

// Routes Monte Carlo (API)
app.use('/', monteCarloRoutes);

// ========================================
// ROUTES DE DEBUG (à supprimer en production)
// ========================================
if (process.env.NODE_ENV !== 'production') {
  app.get('/powens/callback-debug', (req, res) => {
    res.status(200).send(`
      <h1>Debug Callback Powens</h1>
      <p>Code: ${req.query.code || 'absent'}</p>
      <p>Connection ID: ${req.query.connection_id || 'absent'}</p>
      <p>State: ${req.query.state || 'absent'}</p>
      <p>Error: ${req.query.error || 'absent'}</p>
    `);
  });
}

// ========================================
// GESTION DES ERREURS
// ========================================

// 404 - Page non trouvée
app.use((req, res) => {
  res.status(404).render('errors/404', {
    url: req.url
  });
});

// 500 - Erreur serveur
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.message);
  console.error(err.stack);
  
  res.status(500).render('errors/500', {
    error: process.env.NODE_ENV === 'production' 
      ? 'Une erreur est survenue' 
      : err.message
  });
});

// ========================================
// DÉMARRAGE DU SERVEUR
// ========================================
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              🚀 Finance App - Serveur démarré              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`📍 URL locale : http://localhost:${PORT}`);
  console.log(`🌍 Environnement : ${isProd ? 'PRODUCTION' : 'DÉVELOPPEMENT'}`);
  console.log(`🔒 Sécurité : ${isProd ? 'ACTIVÉE (HTTPS + Rate Limiting)' : 'Mode développement'}`);
  console.log(`📊 Routes disponibles :`);
  console.log(`   - /auth/login`);
  console.log(`   - /auth/register`);
  console.log(`   - /transactions`);
  console.log(`   - /politique-confidentialite`);
  console.log(`   - /cgu`);
  console.log(`   - /api/powens/webhook`);
  console.log(`   - /api/powens/sync`);
  console.log('════════════════════════════════════════════════════════════');
});