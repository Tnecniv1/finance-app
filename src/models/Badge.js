const supabase = require('../../config/supabase');

class Badge {
  
  /**
   * Récupérer tous les badges (10 niveaux)
   */
  static async findAll() {
    try {
      const { data, error } = await supabase
        .from('badge')
        .select('*')
        .order('niveau', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur récupération badges:', error);
      throw error;
    }
  }
  
  /**
   * Déterminer le badge correspondant à un montant
   */
  static async findByMontant(montant) {
    try {
      const montantNum = parseFloat(montant);
      
      const { data, error } = await supabase
        .from('badge')
        .select('*')
        .lte('montant_min', montantNum)
        .or(`montant_max.is.null,montant_max.gte.${montantNum}`)
        .order('niveau', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('Erreur findByMontant:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer un badge par ID
   */
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('badge')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur findById badge:', error);
      throw error;
    }
  }
  
  /**
   * Attribuer un badge à un utilisateur pour un projet
   */
  static async attribuerBadge(userId, projetId, badgeId) {
    try {
      const { data, error } = await supabase
        .from('user_badges')
        .insert([{
          user_id: userId,
          projet_id: projetId,
          badge_id: badgeId
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur attribution badge:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer tous les badges d'un utilisateur
   */
  static async findUserBadges(userId) {
    try {
      const { data, error } = await supabase
        .from('user_badges')
        .select(`
          *,
          badge (*),
          projet (nom, montant_objectif, date_completion)
        `)
        .eq('user_id', userId)
        .order('obtained_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur récupération badges utilisateur:', error);
      throw error;
    }
  }
  
  /**
   * Compter les badges par niveau pour un utilisateur
   */
  static async countBadgesByLevel(userId) {
    try {
      const userBadges = await this.findUserBadges(userId);
      
      // Compter par niveau
      const counts = {};
      userBadges.forEach(ub => {
        const niveau = ub.badge.niveau;
        counts[niveau] = (counts[niveau] || 0) + 1;
      });
      
      return counts;
    } catch (error) {
      console.error('Erreur countBadgesByLevel:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer les statistiques de badges pour le classement
   */
  static async getBadgeStatsForRanking(userIds) {
    try {
      const { data, error } = await supabase
        .from('user_badges')
        .select(`
          user_id,
          badge (niveau, emoji)
        `)
        .in('user_id', userIds);
      
      if (error) throw error;
      
      // Grouper par utilisateur
      const stats = {};
      (data || []).forEach(ub => {
        if (!stats[ub.user_id]) {
          stats[ub.user_id] = {};
        }
        const niveau = ub.badge.niveau;
        stats[ub.user_id][niveau] = (stats[ub.user_id][niveau] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      console.error('Erreur getBadgeStatsForRanking:', error);
      throw error;
    }
  }
  
  /**
   * Vérifier si un utilisateur a déjà un badge pour un projet
   */
  static async hasBadgeForProjet(userId, projetId) {
    try {
      const { data, error } = await supabase
        .from('user_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('projet_id', projetId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Erreur hasBadgeForProjet:', error);
      throw error;
    }
  }
}

module.exports = Badge;