const supabase = require('../../config/supabase');
const Projet = require('../models/Projet');

class MaisonController {
  
  /**
   * Afficher la page Maison avec projet actif et visualisation
   */
  static async afficherMaison(req, res) {
    try {
      const userId = req.session.userId;
      
      // Récupérer le projet actif de l'utilisateur
      const projetActif = await Projet.findActiveByUserId(userId);
      
      // Calculer le solde total de l'utilisateur
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('montant, nature')
        .eq('user_id', userId);
      
      if (txError) throw txError;
      
      // Calculer le solde : revenus - dépenses (en valeur absolue)
      const solde = transactions.reduce((total, tx) => {
        const montant = parseFloat(tx.montant) || 0;
        return tx.nature === 'revenu' 
          ? total + Math.abs(montant)
          : total - Math.abs(montant);
      }, 0);
      
      // Préparer les données pour la visualisation
      let visualisationData = null;
      
      if (projetActif) {
        const montantObjectif = parseFloat(projetActif.montant_objectif);
        const progression = Projet.calculateProgression(solde, montantObjectif);
        
        // Calculer le nombre de pixels (sur une grille de 100x100 = 10000 pixels)
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
      
      res.render('transactions/maison', {
        user: req.session.user,
        visualisation: visualisationData,
        currentPage: 'maison'
      });
      
    } catch (error) {
      console.error('Erreur afficherMaison:', error);
      res.status(500).send('Erreur lors du chargement de la page Maison');
    }
  }
}

module.exports = MaisonController;