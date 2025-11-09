const User = require('../models/User');

class AuthController {
  /**
   * Afficher la page d'inscription
   */
  static showRegister(req, res) {
    res.render('auth/register', { error: null });
  }

  /**
   * Traiter l'inscription
   */
  static async register(req, res) {
    try {
      const { nom, prenom, pseudo, date_de_naissance, situation_professionnelle, adresse_mail, ville, password, confirmPassword } = req.body;

      // Validations
      if (!nom || !prenom || !pseudo || !adresse_mail || !password) {
        return res.render('auth/register', { 
          error: 'Les champs obligatoires sont : nom, prénom, pseudo, email et mot de passe' 
        });
      }

      if (password !== confirmPassword) {
        return res.render('auth/register', { 
          error: 'Les mots de passe ne correspondent pas' 
        });
      }

      if (password.length < 6) {
        return res.render('auth/register', { 
          error: 'Le mot de passe doit contenir au moins 6 caractères' 
        });
      }

      // Créer l'utilisateur
      const user = await User.create({
        nom,
        prenom,
        pseudo,
        date_de_naissance: date_de_naissance || null,
        situation_professionnelle: situation_professionnelle || null,
        adresse_mail,
        ville: ville || null,
        password
      });

      // Connexion automatique
      req.session.userId = user.id;
      req.session.pseudo = user.pseudo;

      res.redirect('/'); // ← Modifié : redirige vers la page Maison
    } catch (error) {
      console.error('Erreur inscription:', error);
      res.render('auth/register', { 
        error: error.message || 'Erreur lors de l\'inscription'
      });
    }
  }

  /**
   * Afficher la page de connexion
   */
  static showLogin(req, res) {
    res.render('auth/login', { error: null });
  }

  /**
   * Traiter la connexion
   */
  static async login(req, res) {
    try {
      const { identifier, password } = req.body;

      if (!identifier || !password) {
        return res.render('auth/login', { 
          error: 'Tous les champs sont requis' 
        });
      }

      // Chercher l'utilisateur (par pseudo ou email)
      let user = await User.findByPseudo(identifier);
      if (!user) {
        user = await User.findByEmail(identifier);
      }

      if (!user) {
        return res.render('auth/login', { 
          error: 'Identifiants incorrects' 
        });
      }

      // Vérifier le mot de passe
      const isValid = await User.verifyPassword(password, user.mot_de_passe);

      if (!isValid) {
        return res.render('auth/login', { 
          error: 'Identifiants incorrects' 
        });
      }

      // Créer la session
      req.session.userId = user.id;
      req.session.pseudo = user.pseudo;

      res.redirect('/'); // ← Modifié : redirige vers la page Maison
    } catch (error) {
      console.error('Erreur connexion:', error);
      res.render('auth/login', { 
        error: 'Erreur lors de la connexion' 
      });
    }
  }

  /**
   * Déconnexion
   */
  static logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Erreur lors de la déconnexion:', err);
      }
      res.redirect('/auth/login');
    });
  }
}

module.exports = AuthController;