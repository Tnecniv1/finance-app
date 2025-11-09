const User = require('../models/User');
const Projet = require('../models/Projet');
const Badge = require('../models/Badge');
const supabase = require('../../config/supabase');

class InfosController {
  
  /**
   * Afficher la page Infos avec profil utilisateur, projets et badges
   */
  static async afficherInfos(req, res) {
    try {
      const userId = req.session.userId;
      
      // Récupérer les infos de l'utilisateur
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (userError) throw userError;
      
      // Récupérer tous les projets de l'utilisateur (actifs et complétés)
      const projets = await Projet.findByUserId(userId);
      
      // Séparer projets actifs et complétés
      const projetsActifs = projets.filter(p => p.statut === 'actif');
      const projetsCompletes = projets.filter(p => p.statut === 'complete');
      
      // Récupérer les badges de l'utilisateur
      const userBadges = await Badge.findUserBadges(userId);
      
      // Compter les badges par niveau
      const badgeCounts = await Badge.countBadgesByLevel(userId);
      
      // Récupérer tous les niveaux de badges pour l'affichage
      const allBadges = await Badge.findAll();
      
      res.render('infos', {
        user,
        projetsActifs,
        projetsCompletes,
        userBadges,
        badgeCounts,
        allBadges,
        currentPage: 'infos',
        success: req.query.success || null,
        error: req.query.error || null
      });
      
    } catch (error) {
      console.error('Erreur afficherInfos:', error);
      res.status(500).send('Erreur lors du chargement des informations');
    }
  }
  
  /**
   * Mettre à jour le profil utilisateur
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.session.userId;
      const { nom, prenom, pseudo, date_de_naissance, situation_professionnelle, ville } = req.body;
      
      // Validation basique
      if (!nom || !prenom || !pseudo) {
        return res.redirect('/infos?error=Les champs nom, prénom et pseudo sont obligatoires');
      }
      
      // Vérifier si le pseudo est déjà pris par un autre utilisateur
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('pseudo', pseudo)
        .neq('id', userId)
        .single();
      
      if (existingUser) {
        return res.redirect('/infos?error=Ce pseudo est déjà utilisé');
      }
      
      // Mettre à jour l'utilisateur
      const { error } = await supabase
        .from('users')
        .update({
          nom,
          prenom,
          pseudo,
          date_de_naissance: date_de_naissance || null,
          situation_professionnelle: situation_professionnelle || null,
          ville: ville || null
        })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Mettre à jour la session
      req.session.pseudo = pseudo;
      
      res.redirect('/infos?success=Profil mis à jour avec succès');
      
    } catch (error) {
      console.error('Erreur updateProfile:', error);
      res.redirect('/infos?error=Erreur lors de la mise à jour du profil');
    }
  }
  
  /**
   * Créer un nouveau projet
   */
  static async createProjet(req, res) {
    try {
      const userId = req.session.userId;
      const { nom, montant_objectif, description } = req.body;
      
      // Validation
      if (!nom || !montant_objectif) {
        return res.redirect('/infos?error=Le nom et le montant du projet sont obligatoires');
      }
      
      const montant = parseFloat(montant_objectif);
      if (isNaN(montant) || montant <= 0) {
        return res.redirect('/infos?error=Le montant doit être un nombre positif');
      }
      
      // Créer le projet
      await Projet.create({
        userId,
        nom,
        montantObjectif: montant,
        description: description || null
      });
      
      res.redirect('/infos?success=Projet créé avec succès');
      
    } catch (error) {
      console.error('Erreur createProjet:', error);
      res.redirect('/infos?error=Erreur lors de la création du projet');
    }
  }
  
  /**
   * Définir un projet comme actif
   */
  static async setActiveProjet(req, res) {
    try {
      const userId = req.session.userId;
      const projetId = req.params.id;
      
      // Vérifier que le projet appartient à l'utilisateur et est actif (pas complété)
      const projet = await Projet.findById(projetId);
      if (!projet || projet.user_id !== userId) {
        return res.redirect('/infos?error=Projet introuvable');
      }
      
      if (projet.statut !== 'actif') {
        return res.redirect('/infos?error=Impossible d\'activer un projet complété ou archivé');
      }
      
      // Activer le projet
      await Projet.setActive(projetId, userId);
      
      res.redirect('/infos?success=Projet activé avec succès');
      
    } catch (error) {
      console.error('Erreur setActiveProjet:', error);
      res.redirect('/infos?error=Erreur lors de l\'activation du projet');
    }
  }
  
  /**
   * Mettre à jour un projet
   */
  static async updateProjet(req, res) {
    try {
      const userId = req.session.userId;
      const projetId = req.params.id;
      const { nom, montant_objectif, description } = req.body;
      
      // Validation
      if (!nom || !montant_objectif) {
        return res.redirect('/infos?error=Le nom et le montant sont obligatoires');
      }
      
      const montant = parseFloat(montant_objectif);
      if (isNaN(montant) || montant <= 0) {
        return res.redirect('/infos?error=Le montant doit être un nombre positif');
      }
      
      // Mettre à jour le projet
      await Projet.update(projetId, userId, {
        nom,
        montant_objectif: montant,
        description: description || null
      });
      
      res.redirect('/infos?success=Projet mis à jour avec succès');
      
    } catch (error) {
      console.error('Erreur updateProjet:', error);
      res.redirect('/infos?error=Erreur lors de la mise à jour du projet');
    }
  }
  
  /**
   * Supprimer un projet
   */
  static async deleteProjet(req, res) {
    try {
      const userId = req.session.userId;
      const projetId = req.params.id;
      
      // Vérifier que le projet appartient à l'utilisateur
      const projet = await Projet.findById(projetId);
      if (!projet || projet.user_id !== userId) {
        return res.redirect('/infos?error=Projet introuvable');
      }
      
      // Supprimer le projet
      await Projet.delete(projetId, userId);
      
      res.redirect('/infos?success=Projet supprimé avec succès');
      
    } catch (error) {
      console.error('Erreur deleteProjet:', error);
      res.redirect('/infos?error=Erreur lors de la suppression du projet');
    }
  }
}

module.exports = InfosController;