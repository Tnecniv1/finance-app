const axios = require('axios');
require('dotenv').config();

// Vérification des variables d'environnement
if (!process.env.BRIDGE_CLIENT_ID || !process.env.BRIDGE_CLIENT_SECRET) {
  throw new Error('❌ Les variables BRIDGE_CLIENT_ID et BRIDGE_CLIENT_SECRET doivent être définies dans .env');
}

const BRIDGE_ENV = process.env.BRIDGE_ENV || 'sandbox';
const BASE_URL = 'https://api.bridgeapi.io/v2';

// Créer une instance axios de base
const bridgeClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Bridge-Version': '2021-06-01'
  }
});

// Wrapper pour les méthodes Bridge
const Bridge = {
  // Créer une URL de connexion
  async createConnectUrl(redirectUri) {
    try {
      const response = await bridgeClient.post('/connect/items/add', {
        client_id: process.env.BRIDGE_CLIENT_ID,
        client_secret: process.env.BRIDGE_CLIENT_SECRET,
        redirect_uri: redirectUri
      });
      return response.data;
    } catch (error) {
      console.error('Erreur création URL Bridge:', error.response?.data || error.message);
      throw error;
    }
  },

  // Échanger le code contre un access token
  async authenticate(code) {
    try {
      const response = await bridgeClient.post('/connect/token/access', {
        client_id: process.env.BRIDGE_CLIENT_ID,
        client_secret: process.env.BRIDGE_CLIENT_SECRET,
        code: code
      });
      return response.data;
    } catch (error) {
      console.error('Erreur authentification:', error.response?.data || error.message);
      throw error;
    }
  },

  // Lister les items (connexions bancaires)
  async listItems(accessToken) {
    try {
      const response = await bridgeClient.get('/items', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data.resources || [];
    } catch (error) {
      console.error('Erreur listItems:', error.response?.data || error.message);
      throw error;
    }
  },

  // Lister les comptes
  async listAccounts(accessToken, itemId = null) {
    try {
      const url = itemId ? `/accounts?item_id=${itemId}` : '/accounts';
      const response = await bridgeClient.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data.resources || [];
    } catch (error) {
      console.error('Erreur listAccounts:', error.response?.data || error.message);
      throw error;
    }
  },

  // Lister les transactions
  async listTransactions(accessToken, accountId, since = null) {
    try {
      let url = `/accounts/${accountId}/transactions?limit=500`;
      if (since) {
        url += `&since=${since}`;
      }
      const response = await bridgeClient.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data.resources || [];
    } catch (error) {
      console.error('Erreur listTransactions:', error.response?.data || error.message);
      throw error;
    }
  },

  // Rafraîchir les données d'un item
  async refreshItem(accessToken, itemId) {
    try {
      const response = await bridgeClient.post(`/items/${itemId}/refresh`, {}, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Erreur refreshItem:', error.response?.data || error.message);
      throw error;
    }
  }
};

console.log('✅ Client Bridge initialisé en mode:', BRIDGE_ENV);
console.log('📝 Client ID:', process.env.BRIDGE_CLIENT_ID);

module.exports = Bridge;