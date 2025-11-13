// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

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
const infosRoutes = require('./routes/infos'); 
const projetValidationRoutes = require('./routes/projetValidation.routes');
const profilRoutes = require('./routes/profil.routes');

const PORT = process.env.PORT || 3000;
const app = express();

const powensSyncRoute = require('./routes/powensSync');


// --- Trust proxy (pour cookies secure derrière Render/Proxy) ---
app.set('trust proxy', 1);

// --- Vues & statiques ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Sessions ---
const isProd = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'votre-secret-a-changer',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,          // true uniquement en HTTPS
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// --- Routes API / Webhooks ---
app.use('/api', powensWebhookRouter); // => /api/powens/webhook

// --- Routes applicatives ---
app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/transactions/import-csv', csvRoutes);
app.use('/recurrences', recurrenceRoutes);
app.use('/optimisation', optimisationRoutes);
app.use('/infos', infosRoutes);
app.use('/classement', classementRoutes);
app.use('/', mainRoutes);
app.use('/projet', projetValidationRoutes);
app.use('/profil', profilRoutes);

app.use("/api", powensSyncRoute);
app.use(powensCallbackRoutes);

// NB: ton routeur Monte Carlo expose déjà /api/projection ; le monter à la racine convient
app.use('/', monteCarloRoutes);

// Debug callback
app.get('/powens/callback-debug', (req, res) => {
  res.status(200).send(`code=${req.query.code || 'absent'}`);
});

// 404
app.use((req, res) => {
  res.status(404).send('Page non trouvée');
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});
