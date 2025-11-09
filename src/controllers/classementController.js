const supabase = require('../../config/supabase');
const Badge = require('../models/Badge');

class ClassementController {
  
  /**
   * Affiche le classement des utilisateurs par solde de trésorerie avec badges
   */
  static async afficherClassement(req, res) {
    try {
      console.log('📊 Affichage du classement demandé');
      const userId = req.session.userId;
      console.log('👤 User ID:', userId);
      
      // Récupérer tous les utilisateurs
      console.log('🔍 Récupération des utilisateurs...');
      const { data: utilisateurs, error: userError } = await supabase
        .from('users')
        .select('id, nom, prenom, pseudo, created_at');
      
      if (userError) {
        console.error('❌ Erreur Supabase users:', userError);
        throw userError;
      }
      
      console.log(`✅ ${utilisateurs?.length || 0} utilisateurs récupérés`);
      
      // Pour chaque utilisateur, calculer son solde
      console.log('💰 Calcul des soldes...');
      const utilisateursAvecSolde = await Promise.all(
        utilisateurs.map(async (user) => {
          // Récupérer toutes les transactions de l'utilisateur
          const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('montant, nature')
            .eq('user_id', user.id);
          
          if (txError) {
            console.error(`❌ Erreur transactions pour user ${user.id}:`, txError);
            return { ...user, solde: 0 };
          }
          
          // Calculer le solde : revenus - dépenses (en valeur absolue)
          const solde = transactions.reduce((total, tx) => {
            const montant = parseFloat(tx.montant) || 0;
            return tx.nature === 'revenu' 
              ? total + Math.abs(montant)
              : total - Math.abs(montant);
          }, 0);
          
          return { ...user, solde };
        })
      );
      
      console.log('✅ Soldes calculés pour tous les utilisateurs');
      
      // Récupérer les statistiques de badges pour tous les utilisateurs
      const userIds = utilisateursAvecSolde.map(u => u.id);
      const badgeStats = await Badge.getBadgeStatsForRanking(userIds);
      
      console.log('✅ Statistiques de badges récupérées');
      
      // Trier par solde décroissant
      utilisateursAvecSolde.sort((a, b) => b.solde - a.solde);
      
      // Enrichir avec le rang, badges et formater
      const classement = utilisateursAvecSolde.map((user, index) => ({
        rang: index + 1,
        id: user.id,
        nom: user.nom || 'Anonyme',
        prenom: user.prenom || '',
        pseudo: user.pseudo || '',
        initiales: `${(user.prenom || 'A')[0]}${(user.nom || 'N')[0]}`.toUpperCase(),
        solde: user.solde,
        isCurrentUser: user.id === userId,
        anciennete: ClassementController.calculateAnciennete(user.created_at),
        badges: badgeStats[user.id] || {}
      }));
      
      console.log('📋 Classement généré:', classement.length, 'entrées');
      
      // Séparer le podium (top 3) et le reste
      const podium = classement.slice(0, 3);
      const autres = classement.slice(3);
      
      console.log('🏆 Podium:', podium.length, '| Autres:', autres.length);
      
      // Trouver la position de l'utilisateur actuel
      const positionUtilisateur = classement.find(u => u.isCurrentUser);
      
      console.log('🔍 Position utilisateur:', positionUtilisateur?.rang || 'non trouvé');
      
      // Statistiques
      const stats = {
        totalUtilisateurs: classement.length,
        soldeMoyen: classement.length > 0 
          ? classement.reduce((sum, u) => sum + u.solde, 0) / classement.length 
          : 0,
        soldeMedian: ClassementController.calculateMedian(classement.map(u => u.solde)),
        soldeMax: classement[0]?.solde || 0,
        soldeMin: classement[classement.length - 1]?.solde || 0
      };
      
      console.log('📊 Stats calculées:', stats);
      console.log('🎨 Rendu de la vue classement');
      
      res.render('classement/index', {
        podium,
        autres,
        positionUtilisateur,
        stats,
        currentPage: 'classement',
        user: req.session.user
      });
      
    } catch (error) {
      console.error('❌ Erreur afficherClassement:', error);
      console.error('Stack:', error.stack);
      res.status(500).send(`Erreur lors de l'affichage du classement: ${error.message}`);
    }
  }
  
  /**
   * Calcule l'ancienneté depuis la création du compte
   */
  static calculateAnciennete(createdAt) {
    const now = new Date();
    const creation = new Date(createdAt);
    const diffMs = now - creation;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) return `${diffDays}j`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}m`;
    return `${Math.floor(diffDays / 365)}a`;
  }
  
  /**
   * Calcule la médiane d'un tableau de nombres
   */
  static calculateMedian(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
  
  /**
   * Formater les badges pour l'affichage
   */
  static formatBadges(badges) {
    if (!badges || Object.keys(badges).length === 0) return '';
    
    const parts = [];
    // Trier par niveau (du plus haut au plus bas)
    const niveaux = Object.keys(badges).sort((a, b) => b - a);
    
    niveaux.forEach(niveau => {
      const count = badges[niveau];
      if (count > 0) {
        // Mapper le niveau à l'emoji
        const emojis = {
          1: '🐜', 2: '🐌', 3: '🐈', 4: '🦎', 5: '🐅',
          6: '🦚', 7: '🦍', 8: '🐋', 9: '🦄', 10: '🐉'
        };
        const emoji = emojis[niveau] || '🏅';
        parts.push(`${emoji} ×${count}`);
      }
    });
    
    return parts.join(' ');
  }
}

module.exports = ClassementController;