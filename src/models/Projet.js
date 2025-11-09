const supabase = require('../../config/supabase');

class Projet {
  /**
   * Créer un nouveau projet
   */
  static async create({ userId, nom, montantObjectif, description = null }) {
    try {
      // Si c'est le premier projet, le rendre actif automatiquement
      const { data: existingProjects } = await supabase
        .from('projet')
        .select('id')
        .eq('user_id', userId)
        .eq('statut', 'actif');
      
      const estActif = !existingProjects || existingProjects.length === 0;
      
      const { data, error } = await supabase
        .from('projet')
        .insert([{
          user_id: userId,
          nom,
          montant_objectif: montantObjectif,
          description,
          est_actif: estActif,
          statut: 'actif'
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur création projet:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer tous les projets d'un utilisateur
   */
  static async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('projet')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur récupération projets:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer le projet actif d'un utilisateur
   */
  static async findActiveByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('projet')
        .select('*')
        .eq('user_id', userId)
        .eq('est_actif', true)
        .eq('statut', 'actif')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('Erreur récupération projet actif:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer les projets complétés d'un utilisateur
   */
  static async findCompletedByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('projet')
        .select('*')
        .eq('user_id', userId)
        .eq('statut', 'complete')
        .order('date_completion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur récupération projets complétés:', error);
      throw error;
    }
  }
  
  /**
   * Récupérer un projet par ID
   */
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('projet')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur récupération projet:', error);
      throw error;
    }
  }
  
  /**
   * Définir un projet comme actif (et désactiver les autres)
   */
  static async setActive(projetId, userId) {
    try {
      // Désactiver tous les projets actifs de l'utilisateur
      await supabase
        .from('projet')
        .update({ est_actif: false })
        .eq('user_id', userId)
        .eq('statut', 'actif');
      
      // Activer le projet sélectionné
      const { data, error } = await supabase
        .from('projet')
        .update({ est_actif: true })
        .eq('id', projetId)
        .eq('user_id', userId)
        .eq('statut', 'actif')
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur activation projet:', error);
      throw error;
    }
  }
  
  /**
   * Mettre à jour un projet
   */
  static async update(id, userId, updates) {
    try {
      const { data, error } = await supabase
        .from('projet')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur mise à jour projet:', error);
      throw error;
    }
  }
  
  /**
   * Marquer un projet comme complété
   */
  static async markAsCompleted(projetId, userId, transactionId) {
    try {
      const { data, error } = await supabase
        .from('projet')
        .update({
          statut: 'complete',
          est_actif: false,
          date_completion: new Date().toISOString(),
          transaction_validation_id: transactionId
        })
        .eq('id', projetId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur marquage projet complété:', error);
      throw error;
    }
  }
  
  /**
   * Supprimer un projet
   */
  static async delete(id, userId) {
    try {
      const { error } = await supabase
        .from('projet')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Erreur suppression projet:', error);
      throw error;
    }
  }
  
  /**
   * Calculer la progression d'un projet
   */
  static calculateProgression(soldeActuel, montantObjectif) {
    if (montantObjectif <= 0) return 0;
    const progression = (soldeActuel / montantObjectif) * 100;
    return Math.max(-100, Math.min(100, progression));
  }
  
  /**
   * Vérifier si un projet peut être marqué comme complété
   */
  static canBeCompleted(soldeActuel, montantObjectif) {
    return soldeActuel >= montantObjectif;
  }
}

module.exports = Projet;