// src/middleware/security.js
// Middleware de sécurité pour la production

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/* ================================
 * RATE LIMITING
 * Protection contre les attaques par force brute et DDoS
 * ============================== */

// Rate limiter général (toutes les routes)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requêtes par IP
    message: 'Trop de requêtes depuis cette adresse IP, veuillez réessayer dans 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter strict pour l'authentification
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 5 tentatives de connexion
    message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    skipSuccessfulRequests: true, // Ne compte que les échecs
});

// Rate limiter pour les webhooks Powens
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // Max 60 webhooks par minute
    message: 'Limite de webhooks dépassée',
});

// Rate limiter pour l'API Powens
const powensApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Max 30 requêtes API par minute
    message: 'Limite d\'API dépassée, veuillez patienter',
});

/* ================================
 * HELMET - Sécurité des headers HTTP
 * ============================== */

const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Pour les styles inline EJS
            scriptSrc: ["'self'", "'unsafe-inline'"], // Pour les scripts inline
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://xqjwpexfboiwkcvtymad.supabase.co"], // Supabase
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", "https://webview.powens.com"], // Powens Webview
        },
    },
    hsts: {
        maxAge: 31536000, // 1 an
        includeSubDomains: true,
        preload: true,
    },
});

/* ================================
 * VALIDATION DES ENTRÉES
 * ============================== */

const sanitizeInput = (req, res, next) => {
    // Nettoyer les entrées pour prévenir les injections
    const sanitize = (obj) => {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                // Supprimer les caractères dangereux
                obj[key] = obj[key]
                    .replace(/[<>]/g, '') // Supprimer < et >
                    .trim();
            } else if (typeof obj[key] === 'object') {
                sanitize(obj[key]);
            }
        }
    };

    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);

    next();
};

/* ================================
 * PROTECTION DES LOGS
 * Ne jamais logger les secrets
 * ============================== */

const secureLogger = (req, res, next) => {
    // Créer une copie sécurisée de req pour les logs
    const secureReq = {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
    };

    // Ne jamais logger les mots de passe, tokens, secrets
    if (req.body) {
        const secureBody = { ...req.body };
        if (secureBody.password) secureBody.password = '[REDACTED]';
        if (secureBody.token) secureBody.token = '[REDACTED]';
        if (secureBody.secret) secureBody.secret = '[REDACTED]';
        secureReq.body = secureBody;
    }

    req.secureLog = secureReq;
    next();
};

/* ================================
 * CORS - Configuration explicite
 * ============================== */

const corsConfig = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://finance-app-ap7p.onrender.com'] 
        : ['http://localhost:3000', 'http://localhost:5000'],
    credentials: true,
    optionsSuccessStatus: 200,
};

/* ================================
 * MIDDLEWARE DE SÉCURITÉ GLOBAL
 * ============================== */

const securityMiddleware = (app) => {
    // 1. Helmet (sécurité headers)
    app.use(helmetConfig);

    // 2. CORS
    const cors = require('cors');
    app.use(cors(corsConfig));

    // 3. Validation des entrées
    app.use(sanitizeInput);

    // 4. Logger sécurisé
    app.use(secureLogger);

    // 5. Rate limiting général
    app.use(generalLimiter);

    // 6. Désactiver le header X-Powered-By
    app.disable('x-powered-by');

    // 7. Protection contre le clickjacking
    app.use((req, res, next) => {
        res.setHeader('X-Frame-Options', 'DENY');
        next();
    });

    console.log('✅ Middleware de sécurité activé');
};

/* ================================
 * EXPORTS
 * ============================== */

module.exports = {
    securityMiddleware,
    authLimiter,
    webhookLimiter,
    powensApiLimiter,
    generalLimiter,
};