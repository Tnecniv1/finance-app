const Bridge = require('../../config/bridge');
const BankConnection = require('../models/BankConnection');

class BankController {
  /**
   * Afficher la page de connexion bancaire
   */
  static async showConnectBank(req, res) {
    try {
      const userId = req.session.userId;
      
      // Récupérer les connexions bancaires existantes
      const connections = await BankConnection.findByUserId(userId);

      res.render('transactions/connect-bank', {
        connections,
        pseudo: req.session.pseudo,
        bridgeClientId: process.env.BRIDGE_CLIENT_ID,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Erreur affichage page:', error);
      res.render('transactions/connect-bank', {
        connections: [],
        pseudo: req.session.pseudo,
        bridgeClientId: process.env.BRIDGE_CLIENT_ID,
        error: 'Erreur lors du chargement',
        success: null
      });
    }
  }


  /**
   * Initier la connexion bancaire (générer l'URL et rediriger)
   */
  static async initiateConnection(req, res) {
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/bank/callback`;
      
      console.log('🔗 Création de l\'URL de connexion Bridge');
      console.log('   Redirect URI:', redirectUri);

      // Créer l'URL de connexion Bridge
      const connectData = await Bridge.createConnectUrl(redirectUri);
      
      console.log('✅ URL générée:', connectData.redirect_url);

      // Rediriger l'utilisateur vers Bridge
      res.redirect(connectData.redirect_url);
    } catch (error) {
      console.error('❌ Erreur génération URL Bridge:', error.message);
      if (error.response) {
        console.error('   Détails:', error.response.data);
      }
      res.redirect('/bank/connect?error=Erreur lors de la connexion à Bridge');
    }
  }



  /**
   * Callback après connexion réussie via Bridge
   */
  static async handleBridgeCallback(req, res) {
    try {
      const userId = req.session.userId;
      const { code } = req.query;

      if (!code) {
        return res.redirect('/bank/connect?error=Code manquant');
      }

      console.log('🔑 Code reçu de Bridge:', code);

      // Échanger le code contre un access token
      const authData = await Bridge.authenticate(code);
      const accessToken = authData.access_token;

      console.log('✅ Access token obtenu');

      // Stocker l'access token dans la session (temporaire - à améliorer pour la prod)
      req.session.bridgeAccessToken = accessToken;

      // Récupérer les items (connexions bancaires)
      const items = await Bridge.listItems(accessToken);
      
      console.log(`📋 ${items.length} item(s) trouvé(s)`);

      if (!items || items.length === 0) {
        return res.redirect('/bank/connect?error=Aucune banque connectée');
      }

      // Traiter chaque item (généralement un seul lors de la première connexion)
      for (const item of items) {
        const bridgeItemId = item.id.toString();

        // Vérifier si la connexion existe déjà
        let connection = await BankConnection.findByBridgeItemId(bridgeItemId);

        if (!connection) {
          // Créer une nouvelle connexion
          connection = await BankConnection.create(
            userId,
            bridgeItemId,
            item.bank_name || 'Banque inconnue'
          );
          console.log(`✅ Connexion bancaire créée: ${item.bank_name}`);
        } else {
          console.log(`ℹ️ Connexion bancaire existe déjà: ${item.bank_name}`);
        }

        // Récupérer les comptes bancaires de cet item
        const accounts = await Bridge.listAccounts(accessToken, item.id);
        console.log(`💳 ${accounts.length} compte(s) trouvé(s)`);

        // Sauvegarder les comptes
        const savedAccounts = await BankConnection.saveAccounts(connection.id, accounts);

        // Pour chaque compte, récupérer les transactions des 90 derniers jours
        const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];
        
        for (const account of savedAccounts) {
          try {
            console.log(`📊 Récupération des transactions pour: ${account.name}`);
            
            const transactions = await Bridge.listTransactions(
              accessToken,
              parseInt(account.bridge_account_id),
              sinceDate
            );

            console.log(`   → ${transactions.length} transaction(s) trouvée(s)`);

            // Sauvegarder les transactions
            if (transactions && transactions.length > 0) {
              await BankConnection.saveTransactions(account.id, transactions);
              console.log(`   ✅ Transactions sauvegardées`);
            }
          } catch (txError) {
            console.error(`   ❌ Erreur récupération transactions pour compte ${account.name}:`, txError.message);
          }
        }
      }

      res.redirect('/bank/connect?success=Banque connectée et transactions importées avec succès');
    } catch (error) {
      console.error('❌ Erreur callback Bridge:', error.message);
      if (error.response) {
        console.error('Détails:', error.response.data);
      }
      res.redirect('/bank/connect?error=Erreur lors de la connexion à votre banque');
    }
  }

  /**
   * Synchroniser les transactions d'une connexion bancaire
   */
  static async syncConnection(req, res) {
    try {
      const userId = req.session.userId;
      const { connectionId } = req.params;

      console.log(`🔄 Synchronisation demandée pour connexion ${connectionId}`);

      // Vérifier que la connexion appartient bien à l'utilisateur
      const connections = await BankConnection.findByUserId(userId);
      const connection = connections.find(c => c.id === connectionId);

      if (!connection) {
        return res.redirect('/bank/connect?error=Connexion non trouvée');
      }

      // Récupérer l'access token de la session
      const accessToken = req.session.bridgeAccessToken;

      if (!accessToken) {
        return res.redirect('/bank/connect?error=Session expirée, veuillez reconnecter votre banque');
      }

      // Rafraîchir l'item Bridge
      try {
        await Bridge.refreshItem(accessToken, parseInt(connection.bridge_item_id));
        console.log('✅ Item rafraîchi sur Bridge');
      } catch (refreshError) {
        console.error('⚠️ Erreur rafraîchissement item:', refreshError.message);
      }

      // Récupérer les comptes mis à jour
      const accounts = await Bridge.listAccounts(accessToken, parseInt(connection.bridge_item_id));
      
      // Mettre à jour les soldes des comptes
      await BankConnection.saveAccounts(connectionId, accounts);

      // Récupérer les nouvelles transactions (30 derniers jours)
      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      for (const account of accounts) {
        try {
          const transactions = await Bridge.listTransactions(
            accessToken,
            account.id,
            sinceDate
          );

          if (transactions && transactions.length > 0) {
            // Trouver l'ID du compte sauvegardé
            const savedAccount = connection.bank_accounts.find(
              ba => ba.bridge_account_id === account.id.toString()
            );
            
            if (savedAccount) {
              await BankConnection.saveTransactions(savedAccount.id, transactions);
            }
          }
        } catch (txError) {
          console.error(`Erreur sync transactions:`, txError.message);
        }
      }

      await BankConnection.updateStatus(connectionId, 'active');
      
      console.log('✅ Synchronisation terminée');
      res.redirect('/bank/connect?success=Synchronisation effectuée avec succès');
    } catch (error) {
      console.error('❌ Erreur synchronisation:', error.message);
      res.redirect('/bank/connect?error=Erreur lors de la synchronisation');
    }
  }

  /**
   * Supprimer une connexion bancaire
   */
  static async deleteConnection(req, res) {
    try {
      const userId = req.session.userId;
      const { connectionId } = req.params;

      console.log(`🗑️ Suppression de la connexion ${connectionId}`);

      await BankConnection.delete(connectionId, userId);

      console.log('✅ Connexion supprimée');
      res.redirect('/bank/connect?success=Connexion bancaire supprimée');
    } catch (error) {
      console.error('❌ Erreur suppression:', error.message);
      res.redirect('/bank/connect?error=Erreur lors de la suppression');
    }
  }

  /**
   * Générer l'URL de connexion Bridge (pour usage API)
   */
  static async generateBridgeUrl(req, res) {
    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/bank/callback`;
      
      console.log('🔗 Génération URL Bridge avec redirect:', redirectUri);

      // Créer un lien de connexion Bridge
      const connectData = await Bridge.createConnectUrl(redirectUri);

      res.json({ 
        success: true, 
        url: connectData.redirect_url 
      });
    } catch (error) {
      console.error('❌ Erreur génération URL:', error.message);
      if (error.response) {
        console.error('Détails:', error.response.data);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Erreur lors de la génération du lien de connexion' 
      });
    }
  }
}

module.exports = BankController;