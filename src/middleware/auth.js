/**
 * Middleware pour protéger les routes qui nécessitent une authentification
 */
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  next();
}

/**
 * Middleware pour rediriger les utilisateurs déjà connectés
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/transactions');
  }
  next();
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated
};