const axios = require('axios');
require('dotenv').config();

console.log('🧪 Test des credentials Bridge\n');
console.log('Client ID:', process.env.BRIDGE_CLIENT_ID);
console.log('Client Secret:', process.env.BRIDGE_CLIENT_SECRET ? '✓ Présent' : '✗ Absent');
console.log('Environment:', process.env.BRIDGE_ENV);
console.log('\n---\n');

const BASE_URL = 'https://api.bridgeapi.io/v2';

async function testBridge() {
  try {
    console.log('📡 Tentative d\'appel à Bridge API...\n');
    
    const response = await axios.post(`${BASE_URL}/connect/items/add`, {
      client_id: process.env.BRIDGE_CLIENT_ID,
      client_secret: process.env.BRIDGE_CLIENT_SECRET,
      redirect_uri: 'http://localhost:3000/bank/callback'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Bridge-Version': '2021-06-01'
      }
    });
    
    console.log('✅ Succès !');
    console.log('Redirect URL:', response.data.redirect_url);
    
  } catch (error) {
    console.error('❌ Erreur:', error.response?.status, error.response?.statusText);
    console.error('Message:', error.response?.data?.message);
    console.error('Type:', error.response?.data?.type);
    console.error('\nDétails complets:', JSON.stringify(error.response?.data, null, 2));
    
    if (error.response?.status === 401) {
      console.error('\n⚠️  Erreur 401 - Credentials invalides');
      console.error('Vérifiez que vos credentials Bridge sont corrects dans le dashboard Bridge.');
    }
  }
}

testBridge();