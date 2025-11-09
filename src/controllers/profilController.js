const supabase = require('../../config/supabase');
const Projet = require('../models/Projet');
const Badge = require('../models/Badge');

class ProfilController {
  
  /**
   * Afficher le profil public d'un utilisateur
   */
  static async afficherProfil(req, res) {
    try {
      const userId = req.params.userId;
      const currentUserId = req.session.userId;
      
      // Récupérer les infos de l'utilisateur
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, nom, prenom, pseudo, created_at')
        .eq('id', userId)
        .single();
      
      if (userError || !user) {
        return res.status(404).send('Utilisateur introuvable');
      }
      
      // Vérifier si c'est le profil de l'utilisateur connecté
      const isOwnProfile = userId === currentUserId;
      
      // Récupérer le projet actif
      const projetActif = await Projet.findActiveByUserId(userId);
      
      // Récupérer les projets complétés
      const projetsCompletes = await Projet.findCompletedByUserId(userId);
      
      // Calculer le solde actuel
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('montant, nature')
        .eq('user_id', userId);
      
      if (txError) throw txError;
      
      const solde = transactions.reduce((total, tx) => {
        const montant = parseFloat(tx.montant) || 0;
        return tx.nature === 'revenu' 
          ? total + Math.abs(montant)
          : total - Math.abs(montant);
      }, 0);
      
      // Récupérer les badges de l'utilisateur
      const userBadges = await Badge.findUserBadges(userId);
      const badgeCounts = await Badge.countBadgesByLevel(userId);
      const allBadges = await Badge.findAll();
      
      // Préparer les données de visualisation pour le projet actif
      let visualisationData = null;
      if (projetActif) {
        const montantObjectif = parseFloat(projetActif.montant_objectif);
        const progression = Projet.calculateProgression(solde, montantObjectif);
        const totalPixels = 10000;
        const pourcentageAbsolu = Math.abs(progression);
        const pixelsColores = Math.round((pourcentageAbsolu / 100) * totalPixels);
        
        visualisationData = {
          projet: projetActif,
          solde: solde,
          montantObjectif: montantObjectif,
          progression: progression,
          totalPixels: totalPixels,
          pixelsColores: pixelsColores,
          estNegatif: solde < 0,
          pourcentageAffiche: Math.min(100, pourcentageAbsolu).toFixed(2)
        };
      }
      
      // Calculer l'ancienneté
      const anciennete = ProfilController.calculateAnciennete(user.created_at);
      
      res.render('profil-public', {
        profileUser: user,
        isOwnProfile,
        visualisation: visualisationData,
        projetsCompletes,
        userBadges,
        badgeCounts,
        allBadges,
        anciennete,
        currentPage: 'classement',
        user: req.session.user
      });
      
    } catch (error) {
      console.error('Erreur afficherProfil:', error);
      res.status(500).send('Erreur lors du chargement du profil');
    }
  }
  
  /**
   * Calculer l'ancienneté depuis la création du compte
   */
  static calculateAnciennete(createdAt) {
    const now = new Date();
    const creation = new Date(createdAt);
    const diffMs = now - creation;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) return `${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} mois`;
    }
    const years = Math.floor(diffDays / 365);
    return `${years} an${years > 1 ? 's' : ''}`;
  }
}

module.exports = ProfilController;