// src/routes/powensCallback.js
const express = require('express');
const router = express.Router();
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration Powens
const POWENS_CLIENT_ID = process.env.POWENS_CLIENT_ID || '';
const POWENS_CLIENT_SECRET = process.env.POWENS_CLIENT_SECRET || '';
const POWENS_BASE_URL = process.env.POWENS_BASE_URL || 'https://finance-app-sandbox.biapi.pro';
const POWENS_ACCESS_TOKEN = process.env.POWENS_ACCESS_TOKEN || ''; // Token permanent pré-généré
const POWENS_USER_ID = process.env.POWENS_USER_ID || ''; // User ID permanent
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================================
 * HELPER : Requête HTTPS sans axios
 * ============================== */
function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ data: jsonData, status: res.statusCode });
                    } else {
                        const error = new Error(`HTTP ${res.statusCode}`);
                        error.response = { data: jsonData, status: res.statusCode };
                        reject(error);
                    }
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

/* ================================
 * CALLBACK WEBVIEW POWENS
 * Route appelée après la connexion via Webview
 * ============================== */
router.get('/powens/callback-debug', async (req, res) => {
    const { code, connection_id, error, error_description, state } = req.query;
    
    console.log('📥 Callback Powens reçu');
    console.log('  Code:', code ? code.substring(0, 20) + '...' : 'AUCUN');
    console.log('  Connection ID:', connection_id || 'AUCUN');
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

    // 2️⃣ CAS 1 : Connection réussie avec connection_id (flux utilisateur permanent)
    if (connection_id && !code) {
        console.log('✅ Connexion bancaire réussie avec connection_id:', connection_id);
        
        try {
            // Utiliser le token permanent pré-configuré
            if (!POWENS_ACCESS_TOKEN || !POWENS_USER_ID) {
                throw new Error('POWENS_ACCESS_TOKEN ou POWENS_USER_ID manquant dans les variables d\'environnement');
            }

            console.log('🔍 Récupération des informations avec le token permanent...');
            
            // Vérifier les informations utilisateur
            const userInfoResponse = await httpsRequest(
                `${POWENS_BASE_URL}/2.0/users/me`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${POWENS_ACCESS_TOKEN}`
                    }
                }
            );

            const userInfo = userInfoResponse.data;
            console.log('👤 User info:', JSON.stringify(userInfo, null, 2));

            // Récupérer les comptes bancaires
            console.log('🏦 Récupération des comptes bancaires...');
            
            const accountsResponse = await httpsRequest(
                `${POWENS_BASE_URL}/2.0/users/${POWENS_USER_ID}/accounts`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${POWENS_ACCESS_TOKEN}`
                    }
                }
            );

            const accounts = accountsResponse.data.accounts || [];
            console.log(`✅ ${accounts.length} compte(s) récupéré(s)`);

            // Afficher la page de succès
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
                        <p><strong>Connection ID :</strong> ${connection_id}</p>
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

                    <a href="/transactions">← Retour aux transactions</a>
                </body>
                </html>
            `);

        } catch (error) {
            console.error('❌ Erreur lors de la récupération des données:', error.response?.data || error.message);
            
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
                        <h1>❌ Erreur lors de la récupération des données</h1>
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
    }

    // 3️⃣ CAS 2 : Code reçu (flux OAuth classique)
    if (code) {
        console.log('🔄 Échange du code contre un access_token...');
        
        try {
            const tokenResponse = await httpsRequest(
                `${POWENS_BASE_URL}/2.0/auth/token/access`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: {
                        code: code,
                        client_id: POWENS_CLIENT_ID,
                        client_secret: POWENS_CLIENT_SECRET
                    }
                }
            );

            const { access_token } = tokenResponse.data;
            
            if (!access_token) {
                throw new Error('Aucun access_token reçu dans la réponse');
            }

            console.log('✅ Token reçu:', access_token.substring(0, 30) + '...');

            // Vérifier le type de token
            const userInfoResponse = await httpsRequest(
                `${POWENS_BASE_URL}/2.0/users/me`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${access_token}`
                    }
                }
            );

            const userInfo = userInfoResponse.data;
            console.log('👤 User info:', JSON.stringify(userInfo, null, 2));

            if (userInfo.platform !== 'userAccess') {
                console.error('❌ Token invalide: type =', userInfo.platform, '(attendu: userAccess)');
                throw new Error(`Token de type ${userInfo.platform} au lieu de userAccess. Vérifiez la configuration Webview.`);
            }

            console.log('✅ Token valide (userAccess) ✓');

            // Récupérer les comptes bancaires
            const accountsResponse = await httpsRequest(
                `${POWENS_BASE_URL}/2.0/users/${userInfo.id}/accounts`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${access_token}`
                    }
                }
            );

            const accounts = accountsResponse.data.accounts || [];
            console.log(`✅ ${accounts.length} compte(s) récupéré(s)`);

            // Afficher la page de succès (même template que pour connection_id)
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
    }

    // 4️⃣ CAS 3 : Ni code, ni connection_id
    console.error('❌ Aucun code ou connection_id reçu dans le callback');
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
});

module.exports = router;