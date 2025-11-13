// src/routes/powensCallback.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration Powens
const POWENS_CLIENT_ID = process.env.POWENS_CLIENT_ID || '';
const POWENS_CLIENT_SECRET = process.env.POWENS_CLIENT_SECRET || '';
const POWENS_BASE_URL = process.env.POWENS_BASE_URL || 'https://finance-app-sandbox.biapi.pro';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================================
 * CALLBACK WEBVIEW POWENS
 * Route appelée après la connexion via Webview
 * ============================== */
router.get('/powens/callback-debug', async (req, res) => {
    const { code, error, error_description, state } = req.query;
    
    console.log('📥 Callback Powens reçu');
    console.log('  Code:', code ? code.substring(0, 20) + '...' : 'AUCUN');
    console.log('  Error:', error || 'AUCUN');
    console.log('  State:', state || 'AUCUN');

    // 1️⃣ Gestion des erreurs Powens
    if (error) {
        console.error('❌ Erreur Powens:', error, '-', error_description);
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Erreur Powens</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    .error { background: #fee; border: 2px solid #c33; padding: 20px; border-radius: 8px; }
                    h1 { color: #c33; }
                    a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Erreur lors de la connexion bancaire</h1>
                    <p><strong>Code d'erreur :</strong> ${error}</p>
                    <p><strong>Description :</strong> ${error_description || 'Aucune description'}</p>
                </div>
                <a href="/transactions">← Retour aux transactions</a>
            </body>
            </html>
        `);
    }

    // 2️⃣ Vérification du code
    if (!code) {
        console.error('❌ Aucun code reçu dans le callback');
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Erreur - Code manquant</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    .error { background: #fee; border: 2px solid #c33; padding: 20px; border-radius: 8px; }
                    h1 { color: #c33; }
                    a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Code d'autorisation manquant</h1>
                    <p>Le callback Powens n'a pas renvoyé de code d'autorisation.</p>
                    <p>Vérifiez la configuration de votre Webview dans le dashboard Powens.</p>
                </div>
                <a href="/transactions">← Retour aux transactions</a>
            </body>
            </html>
        `);
    }

    // 3️⃣ Échanger le code contre un access_token
    try {
        console.log('🔄 Échange du code contre un access_token...');
        
        const tokenResponse = await axios.post(
            `${POWENS_BASE_URL}/2.0/auth/token/access`,
            {
                code: code,
                client_id: POWENS_CLIENT_ID,
                client_secret: POWENS_CLIENT_SECRET
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const { access_token } = tokenResponse.data;
        
        if (!access_token) {
            throw new Error('Aucun access_token reçu dans la réponse');
        }

        console.log('✅ Token reçu:', access_token.substring(0, 30) + '...');

        // 4️⃣ Vérifier le type de token (doit être userAccess)
        console.log('🔍 Vérification du type de token...');
        
        const userInfoResponse = await axios.get(
            `${POWENS_BASE_URL}/2.0/users/me`,
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            }
        );

        const userInfo = userInfoResponse.data;
        console.log('👤 User info:', JSON.stringify(userInfo, null, 2));

        // Vérification critique : le token DOIT être de type userAccess
        if (userInfo.platform !== 'userAccess') {
            console.error('❌ Token invalide: type =', userInfo.platform, '(attendu: userAccess)');
            throw new Error(`Token de type ${userInfo.platform} au lieu de userAccess. Vérifiez la configuration Webview.`);
        }

        console.log('✅ Token valide (userAccess) ✓');

        // 5️⃣ Récupérer les comptes bancaires
        console.log('🏦 Récupération des comptes bancaires...');
        
        const accountsResponse = await axios.get(
            `${POWENS_BASE_URL}/2.0/users/${userInfo.id}/accounts`,
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            }
        );

        const accounts = accountsResponse.data.accounts || [];
        console.log(`✅ ${accounts.length} compte(s) récupéré(s)`);

        // 6️⃣ Stocker le token en session (temporaire pour test)
        // ⚠️ En production, vous devriez le stocker en base de données
        req.session.powensToken = access_token;
        req.session.powensUserId = userInfo.id;
        
        // Optionnel : Stocker dans Supabase
        if (req.session.userId) {
            try {
                await supabase
                    .from('users')
                    .update({
                        powens_user_id: userInfo.id,
                        powens_token: access_token,
                        powens_connected_at: new Date().toISOString()
                    })
                    .eq('id', req.session.userId);
                
                console.log('✅ Token stocké dans Supabase pour user:', req.session.userId);
            } catch (dbError) {
                console.warn('⚠️ Impossible de stocker le token en base:', dbError.message);
            }
        }

        // 7️⃣ Afficher le résultat (page de succès)
        return res.send(`
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Connexion réussie ✅</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        max-width: 900px; 
                        margin: 50px auto; 
                        padding: 20px; 
                        background: #f5f5f5;
                    }
                    .success { 
                        background: #d4edda; 
                        border: 2px solid #28a745; 
                        padding: 30px; 
                        border-radius: 8px; 
                        margin-bottom: 20px;
                    }
                    h1 { color: #28a745; margin-top: 0; }
                    .info { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 8px; 
                        margin: 20px 0;
                        border-left: 4px solid #007bff;
                    }
                    .info h2 { margin-top: 0; color: #007bff; }
                    .account {
                        background: #f8f9fa;
                        padding: 15px;
                        margin: 10px 0;
                        border-radius: 4px;
                        border-left: 4px solid #17a2b8;
                    }
                    .account strong { color: #17a2b8; }
                    pre { 
                        background: #f8f9fa; 
                        padding: 15px; 
                        border-radius: 4px; 
                        overflow-x: auto;
                        font-size: 12px;
                    }
                    a { 
                        display: inline-block; 
                        margin-top: 20px; 
                        padding: 12px 24px; 
                        background: #007bff; 
                        color: white; 
                        text-decoration: none; 
                        border-radius: 4px; 
                        font-weight: bold;
                    }
                    a:hover { background: #0056b3; }
                    .badge { 
                        display: inline-block; 
                        padding: 4px 8px; 
                        background: #28a745; 
                        color: white; 
                        border-radius: 4px; 
                        font-size: 12px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div class="success">
                    <h1>✅ Connexion bancaire réussie !</h1>
                    <p>Votre banque a été connectée avec succès via Powens.</p>
                </div>

                <div class="info">
                    <h2>📊 Informations de connexion</h2>
                    <p><strong>User ID Powens :</strong> ${userInfo.id}</p>
                    <p><strong>Type de token :</strong> <span class="badge">${userInfo.platform}</span></p>
                    <p><strong>Nombre de comptes :</strong> ${accounts.length}</p>
                </div>

                ${accounts.length > 0 ? `
                <div class="info">
                    <h2>🏦 Vos comptes bancaires</h2>
                    ${accounts.map(acc => `
                        <div class="account">
                            <strong>${acc.name || 'Compte sans nom'}</strong><br>
                            Type: ${acc.type || 'N/A'}<br>
                            Solde: ${acc.balance != null ? acc.balance.toFixed(2) + ' €' : 'N/A'}<br>
                            IBAN: ${acc.iban || 'Non disponible'}
                        </div>
                    `).join('')}
                </div>
                ` : ''}

                <div class="info">
                    <h2>🔍 Données brutes (debug)</h2>
                    <pre>${JSON.stringify({ userInfo, accounts }, null, 2)}</pre>
                </div>

                <a href="/transactions">← Retour aux transactions</a>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('❌ Erreur lors de l\'échange du token:', error.response?.data || error.message);
        
        return res.status(500).send(`
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Erreur serveur</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    .error { background: #fee; border: 2px solid #c33; padding: 20px; border-radius: 8px; }
                    h1 { color: #c33; }
                    pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; }
                    a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Erreur lors de l'échange du token</h1>
                    <p><strong>Message :</strong> ${error.message}</p>
                    ${error.response?.data ? `
                        <p><strong>Détails de l'erreur :</strong></p>
                        <pre>${JSON.stringify(error.response.data, null, 2)}</pre>
                    ` : ''}
                </div>
                <a href="/transactions">← Retour aux transactions</a>
            </body>
            </html>
        `);
    }
});

module.exports = router;