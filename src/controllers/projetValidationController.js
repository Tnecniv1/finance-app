const supabase = require('../../config/supabase');
const Projet = require('../models/Projet');
const Badge = require('../models/Badge');

class ProjetValidationController {
  
  /**
   * Afficher la page de validation d'un projet
   */
  static async afficherValidation(req, res) {
    try {
      const userId = req.session.userId;
      const projetId = req.params.id;
      
      // Récupérer le projet
      const projet = await Projet.findById(projetId);
      
      if (!projet || projet.user_id !== userId) {
        return res.redirect('/infos?error=Projet introuvable');
      }
      
      if (projet.statut !== 'actif') {
        return res.redirect('/infos?error=Ce projet est déjà complété ou archivé');
      }
      
      // Calculer le solde actuel
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });
      
      if (txError) throw txError;
      
      const solde = transactions.reduce((total, tx) => {
        const montant = parseFloat(tx.montant) || 0;
        return tx.nature === 'revenu' 
          ? total + Math.abs(montant)
          : total - Math.abs(montant);
      }, 0);
      
      // Vérifier si le projet peut être complété
      const canComplete = Projet.canBeCompleted(solde, projet.montant_objectif);
      
      // Récupérer les transactions potentielles de validation (dépenses importantes)
      const montantObjectif = parseFloat(projet.montant_objectif);
      const transactionsCandidates = transactions.filter(tx => {
        const montant = Math.abs(parseFloat(tx.montant) || 0);
        return tx.nature === 'depense' && montant >= (montantObjectif * 0.5);
      });
      
      res.render('projet-validation', {
        projet,
        solde,
        canComplete,
        transactionsCandidates,
        currentPage: 'infos',
        user: req.session.user
      });
      
    } catch (error) {
      console.error('Erreur afficherValidation:', error);
      res.status(500).send('Erreur lors du chargement de la validation');
    }
  }
  
  /**
   * Valider un projet et attribuer un badge
   */
  static async validerProjet(req, res) {
    try {
      const userId = req.session.userId;
      const projetId = req.params.id;
      const { transaction_id } = req.body;
      
      if (!transaction_id) {
        return res.redirect(`/projet/valider/${projetId}?error=Veuillez sélectionner une transaction`);
      }
      
      // Récupérer le projet
      const projet = await Projet.findById(projetId);
      
      if (!projet || projet.user_id !== userId) {
        return res.redirect('/infos?error=Projet introuvable');
      }
      
      if (projet.statut !== 'actif') {
        return res.redirect('/infos?error=Ce projet est déjà complété');
      }
      
      // Récupérer la transaction de validation
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction_id)
        .eq('user_id', userId)
        .single();
      
      if (txError || !transaction) {
        return res.redirect(`/projet/valider/${projetId}?error=Transaction invalide`);
      }
      
      // Calculer le solde AVANT la transaction de validation
      const { data: allTransactions, error: allTxError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });
      
      if (allTxError) throw allTxError;
      
      let soldeAvantAchat = 0;
      for (const tx of allTransactions) {
        if (tx.id === transaction_id) break;
        const montant = parseFloat(tx.montant) || 0;
        soldeAvantAchat += tx.nature === 'revenu' 
          ? Math.abs(montant)
          : -Math.abs(montant);
      }
      
      // Vérifier que le solde avant l'achat était >= objectif
      const montantObjectif = parseFloat(projet.montant_objectif);
      if (soldeAvantAchat < montantObjectif) {
        return res.redirect(`/projet/valider/${projetId}?error=Le solde avant cet achat (${soldeAvantAchat.toFixed(2)}€) était insuffisant pour atteindre l'objectif (${montantObjectif}€)`);
      }
      
      // Marquer le projet comme complété
      await Projet.markAsCompleted(projetId, userId, transaction_id);
      
      // Déterminer et attribuer le badge
      const badge = await Badge.findByMontant(montantObjectif);
      
      if (badge) {
        // Vérifier qu'il n'a pas déjà ce badge pour ce projet
        const hasBadge = await Badge.hasBadgeForProjet(userId, projetId);
        
        if (!hasBadge) {
          await Badge.attribuerBadge(userId, projetId, badge.id);
        }
      }
      
      res.redirect(`/infos?success=🎉 Projet complété ! Badge ${badge ? badge.emoji : '🏅'} obtenu !`);
      
    } catch (error) {
      console.error('Erreur validerProjet:', error);
      res.redirect(`/projet/valider/${req.params.id}?error=Erreur lors de la validation`);
    }
  }
}

module.exports = ProjetValidationController;