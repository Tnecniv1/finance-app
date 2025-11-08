// config/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * ⚠️ Ce fichier ne doit être importé que côté serveur.
 */
if (typeof window !== 'undefined') {
  throw new Error('❌ config/supabase.js ne doit pas être importé côté client.');
}

const URL  = process.env.SUPABASE_URL;
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY; // ✅ Service Role Key (serveur)
const ANON = process.env.SUPABASE_KEY;              // (fallback) anon key

if (!URL) throw new Error('❌ SUPABASE_URL manquant dans .env');

let keyInUse = null;
let mode = null;

if (SRK && SRK.trim() !== '') {
  keyInUse = SRK;
  mode = 'service_role';
} else if (ANON && ANON.trim() !== '') {
  keyInUse = ANON;
  mode = 'anon';
  console.warn('⚠️ Service Role Key absente — utilisation de l’ANON KEY. Les politiques RLS doivent l’autoriser.');
} else {
  throw new Error('❌ Fournissez SUPABASE_SERVICE_ROLE_KEY (recommandé) ou SUPABASE_KEY dans .env');
}

const supabase = createClient(URL, keyInUse, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { headers: { 'x-application-name': 'fidess-server' } },
});

console.log(`✅ Client Supabase initialisé (${mode === 'service_role' ? 'Service Role' : 'Anon'})`);

module.exports = supabase;
