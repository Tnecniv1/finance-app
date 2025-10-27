const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');

const csvRoutes = require('./routes/csv');

const app = express();
const PORT = process.env.PORT || 3000;


// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration de session
app.use(session({
  secret: process.env.SESSION_SECRET || 'votre-secret-a-changer',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Mettre à true si HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 heures
  }
}));

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/transactions');
  } else {
    res.redirect('/auth/login');
  }
});

app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/transactions/import-csv', csvRoutes);

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).send('Page non trouvée');
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Connexion: http://localhost:${PORT}/auth/login`);
  console.log(`✨ Inscription: http://localhost:${PORT}/auth/register`);
  console.log(`🏦 Banques: http://localhost:${PORT}/bank/connect`);
});