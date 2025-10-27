const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Vérification des variables d'environnement
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('❌ Les variables SUPABASE_URL et SUPABASE_KEY doivent être définies dans .env');
}

// Création du client Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('✅ Client Supabase initialisé');

module.exports = supabase;