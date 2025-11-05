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

// ✅ Routeur Powens (fichier dédié)
const powensWebhookRouter = require('./routes/powensWebhook');

const PORT = process.env.PORT || 3000;
const app = express();

// ---------- Middlewares globaux ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // doit être AVANT les routes qui lisent req.body
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'votre-secret-a-changer',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // passe à true si derrière HTTPS (prod)
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// ---------- Routes API / Webhook ----------
app.use('/api', powensWebhookRouter); // => /api/powens/webhook

// ---------- Routes applicatives ----------
app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/transactions/import-csv', csvRoutes);
app.use('/', mainRoutes);
app.use('/', monteCarloRoutes);
app.use('/recurrences', recurrenceRoutes);
app.use('/optimisation', optimisationRoutes);
app.use('/classement', classementRoutes);

// ---------- 404 en dernier ----------
app.use((req, res) => {
  res.status(404).send('Page non trouvée');
});

// ---------- Démarrage ----------
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`🔐 Connexion: http://localhost:${PORT}/auth/login`);
  console.log(`✨ Inscription: http://localhost:${PORT}/auth/register`);
  console.log(`🏠 Maison: http://localhost:${PORT}/maison`);
});
