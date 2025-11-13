// test-powens-correct-flow.js
// Script suivant le flux officiel Powens pour obtenir un token userAccess

const https = require('https');

/* ================================
 * CONFIGURATION
 * Remplacez ces valeurs par vos credentials Powens
 * ============================== */
const POWENS_CLIENT_ID = '43072861';
const POWENS_CLIENT_SECRET = 'VcdmXeeInDynJhicOxIHds4DyjgEWLVO'; // ⚠️ À remplacer
const POWENS_BASE_URL = 'finance-app-sandbox.biapi.pro';
const REDIRECT_URI = 'https://finance-app-ap7p.onrender.com/powens/callback-debug';

/* ================================
 * HELPER : Requête HTTPS
 * ============================== */
function httpsRequest(hostname, path, options = {}) {
    return new Promise((resolve, reject) => {
        const reqOptions = {
            hostname: hostname,
            port: 443,
            path: path,
            method: options.method || 'GET',
            headers: options.headers || {},
            auth: options.auth || null
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = data ? JSON.parse(data) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ 
                            data: jsonData, 
                            status: res.statusCode,
                            headers: res.headers 
                        });
                    } else {
                        const error = new Error(`HTTP ${res.statusCode}: ${jsonData.description || 'Unknown error'}`);
                        error.response = { data: jsonData, status: res.statusCode };
                        reject(error);
                    }
                } catch (e) {
                    reject(new Error('Invalid JSON response: ' + data));
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
 * ÉTAPE 1 : Créer un utilisateur permanent
 * ============================== */
async function createPermanentUser() {
    console.log('\n📝 ÉTAPE 1 : Création d\'un utilisateur permanent...\n');

    try {
        const auth = `${POWENS_CLIENT_ID}:${POWENS_CLIENT_SECRET}`;
        const authBase64 = Buffer.from(auth).toString('base64');

        const response = await httpsRequest(
            POWENS_BASE_URL,
            '/2.0/auth/init',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${authBase64}`
                },
                body: {}
            }
        );

        const authToken = response.data.auth_token;
        
        console.log('✅ Utilisateur créé avec succès !');
        console.log('   Auth Token (permanent):', authToken ? authToken.substring(0, 30) + '...' : 'N/A');
        
        return authToken;

    } catch (error) {
        console.error('❌ Erreur lors de la création de l\'utilisateur:');
        console.error('   Message:', error.message);
        if (error.response) {
            console.error('   Détails:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

/* ================================
 * ÉTAPE 2 : Convertir le token permanent en code temporaire
 * C'EST LA PARTIE MANQUANTE !
 * ============================== */
async function convertTokenToCode(permanentToken) {
    console.log('\n🔑 ÉTAPE 2 : Conversion du token permanent en code temporaire...\n');

    try {
        const response = await httpsRequest(
            POWENS_BASE_URL,
            '/2.0/auth/token/code',
            {
                method: 'GET', // ← Changé de POST à GET
                headers: {
                    'Authorization': `Bearer ${permanentToken}`
                }
            }
        );

        const temporaryCode = response.data.code;
        
        console.log('✅ Code temporaire généré !');
        console.log('   Code (valide 30 min):', temporaryCode ? temporaryCode.substring(0, 30) + '...' : 'N/A');
        console.log('   ℹ️  Ce code est à utiliser dans l\'URL de la Webview.');
        
        return temporaryCode;

    } catch (error) {
        console.error('❌ Erreur lors de la conversion du token:');
        console.error('   Message:', error.message);
        if (error.response) {
            console.error('   Détails:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

/* ================================
 * ÉTAPE 3 : Générer l'URL de la Webview
 * ============================== */
function generateWebviewURL(temporaryCode) {
    console.log('\n🌐 ÉTAPE 3 : Génération de l\'URL de la Webview...\n');

    const webviewURL = `https://webview.powens.com/fr/connect?` +
        `domain=${POWENS_BASE_URL}&` +
        `client_id=${POWENS_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `code=${temporaryCode}&` +
        `state=TEST_PERMANENT_USER`;

    console.log('✅ URL de la Webview générée :');
    console.log('\n' + webviewURL + '\n');
    
    return webviewURL;
}

/* ================================
 * FONCTION PRINCIPALE
 * ============================== */
async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  POWENS - FLUX CORRECT pour token userAccess                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Vérification des credentials
    if (POWENS_CLIENT_SECRET === 'VOTRE_CLIENT_SECRET_ICI') {
        console.error('\n❌ ERREUR : Vous devez remplacer POWENS_CLIENT_SECRET dans le script !');
        console.error('   Ouvrez le fichier et modifiez la ligne 12.\n');
        process.exit(1);
    }

    try {
        // Étape 1 : Créer un utilisateur permanent
        const permanentToken = await createPermanentUser();

        // Étape 2 : Convertir le token en code temporaire (LA CLEF !)
        const temporaryCode = await convertTokenToCode(permanentToken);

        // Étape 3 : Générer l'URL de la Webview
        const webviewURL = generateWebviewURL(temporaryCode);

        // Instructions finales
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║  PROCHAINES ÉTAPES                                             ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        
        console.log('📋 ÉTAPE 4 : Ouvrez cette URL dans votre navigateur :\n');
        console.log(webviewURL + '\n');
        
        console.log('🏦 ÉTAPE 5 : Connectez-vous à une banque de test :');
        console.log('   - Choisissez "Connecteur de test"');
        console.log('   - Login : test_good');
        console.log('   - Password : test_good\n');
        
        console.log('✅ ÉTAPE 6 : Après la connexion, vous serez redirigé vers :');
        console.log('   ' + REDIRECT_URI);
        console.log('   La page devrait afficher "platform: userAccess" 🎉\n');

        console.log('💾 ÉTAPE 7 : Sauvegardez le token permanent pour votre app :');
        console.log('   POWENS_ACCESS_TOKEN=' + permanentToken);
        console.log('   (À ajouter dans les variables d\'environnement Render)\n');

        console.log('⚠️  NOTE : Le code temporaire expire dans 30 minutes.');
        console.log('   Si besoin, relancez ce script pour générer un nouveau code.\n');

    } catch (error) {
        console.error('\n╔════════════════════════════════════════════════════════════════╗');
        console.error('║  ÉCHEC DU SCRIPT                                               ║');
        console.error('╚════════════════════════════════════════════════════════════════╝\n');
        console.error('Le script a échoué. Vérifiez vos credentials Powens.');
        console.error('Erreur:', error.message, '\n');
        process.exit(1);
    }
}

// Lancer le script
main();