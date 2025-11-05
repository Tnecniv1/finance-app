// src/models/ActionOptimisation.js
const supabase = require('../../config/supabase');

class ActionOptimisation {
  
  // ===============================
  // CRÉATION ET RÉCUPÉRATION
  // ===============================
  
  /**
   * Crée une nouvelle action d'optimisation
   */
  static async create(sessionId, data) {
    const { data: action, error } = await supabase
      .from('actions_optimisation')
      .insert({
        session_id: sessionId,
        budget_optimise_id: data.budget_optimise_id || null,
        description: data.description,
        economie_mensuelle: parseFloat(data.economie_mensuelle) || 0,
        priorite: data.priorite || 2,
        statut: 'todo',
        date_limite: data.date_limite || null
      })
      .select()
      .single();
    
    if (error) throw error;
    return action;
  }
  
  /**
   * Crée plusieurs actions en une seule requête
   */
  static async createBatch(actionsArray) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .insert(actionsArray)
      .select();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Récupère une action par ID
   */
  static async getById(actionId) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .select(`
        *,
        budgets_optimises (
          *,
          recurring_transactions (
            nom,
            description,
            montant_moyen
          )
        )
      `)
      .eq('id', actionId)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Récupère toutes les actions d'une session
   */
  static async getBySession(sessionId, options = {}) {
    let query = supabase
      .from('actions_optimisation')
      .select(`
        *,
        budgets_optimises (
          *,
          recurring_transactions (nom, description)
        )
      `)
      .eq('session_id', sessionId);
    
    // Filtrer par statut si spécifié
    if (options.statut) {
      query = query.eq('statut', options.statut);
    }
    
    // Filtrer par priorité si spécifié
    if (options.priorite) {
      query = query.eq('priorite', options.priorite);
    }
    
    // Tri
    const orderBy = options.orderBy || 'priorite';
    const ascending = options.ascending !== false;
    query = query.order(orderBy, { ascending });
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les actions en attente (todo + en_cours)
   */
  static async getPending(sessionId) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .select(`
        *,
        budgets_optimises (
          *,
          recurring_transactions (nom, description)
        )
      `)
      .eq('session_id', sessionId)
      .in('statut', ['todo', 'en_cours'])
      .order('priorite', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les actions réalisées
   */
  static async getCompleted(sessionId) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .select('*')
      .eq('session_id', sessionId)
      .eq('statut', 'fait')
      .order('date_realisation', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les actions liées à un budget spécifique
   */
  static async getByBudget(budgetOptimiseId) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .select('*')
      .eq('budget_optimise_id', budgetOptimiseId)
      .order('priorite', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  
  // ===============================
  // MISE À JOUR
  // ===============================
  
  /**
   * Met à jour une action
   */
  static async update(actionId, updates) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .update(updates)
      .eq('id', actionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Change le statut d'une action
   */
  static async updateStatut(actionId, nouveauStatut) {
    const updates = { statut: nouveauStatut };
    
    // Si marquée comme "fait", enregistrer la date
    if (nouveauStatut === 'fait') {
      updates.date_realisation = new Date().toISOString();
    }
    
    return this.update(actionId, updates);
  }
  
  /**
   * Marque une action comme faite
   */
  static async markAsCompleted(actionId) {
    return this.updateStatut(actionId, 'fait');
  }
  
  /**
   * Marque une action comme en cours
   */
  static async markAsInProgress(actionId) {
    return this.updateStatut(actionId, 'en_cours');
  }
  
  /**
   * Marque une action comme abandonnée
   */
  static async markAsAbandoned(actionId) {
    return this.updateStatut(actionId, 'abandonnee');
  }
  
  /**
   * Change la priorité d'une action
   */
  static async updatePriorite(actionId, nouvellePriorite) {
    if (![1, 2, 3].includes(nouvellePriorite)) {
      throw new Error('La priorité doit être 1, 2 ou 3');
    }
    
    return this.update(actionId, { priorite: nouvellePriorite });
  }
  
  /**
   * Met à jour la date limite
   */
  static async updateDateLimite(actionId, dateLimite) {
    return this.update(actionId, { date_limite: dateLimite });
  }
  
  /**
   * Met à jour l'économie mensuelle
   */
  static async updateEconomie(actionId, economie) {
    return this.update(actionId, { 
      economie_mensuelle: parseFloat(economie) 
    });
  }
  
  
  // ===============================
  // SUPPRESSION
  // ===============================
  
  /**
   * Supprime une action
   */
  static async delete(actionId) {
    const { error } = await supabase
      .from('actions_optimisation')
      .delete()
      .eq('id', actionId);
    
    if (error) throw error;
    return true;
  }
  
  /**
   * Supprime toutes les actions d'une session
   */
  static async deleteBySession(sessionId) {
    const { error } = await supabase
      .from('actions_optimisation')
      .delete()
      .eq('session_id', sessionId);
    
    if (error) throw error;
    return true;
  }
  
  
  // ===============================
  // STATISTIQUES
  // ===============================
  
  /**
   * Calcule les statistiques des actions d'une session
   */
  static async getStatistics(sessionId) {
    const actions = await this.getBySession(sessionId);
    
    const stats = {
      total: actions.length,
      todo: 0,
      en_cours: 0,
      fait: 0,
      abandonnee: 0,
      economie_totale: 0,
      economie_realisee: 0,
      par_priorite: {
        haute: 0,
        moyenne: 0,
        basse: 0
      }
    };
    
    actions.forEach(action => {
      // Comptage par statut
      stats[action.statut] = (stats[action.statut] || 0) + 1;
      
      // Économies
      const economie = parseFloat(action.economie_mensuelle) || 0;
      stats.economie_totale += economie;
      
      if (action.statut === 'fait') {
        stats.economie_realisee += economie;
      }
      
      // Comptage par priorité
      if (action.priorite === 1) stats.par_priorite.haute++;
      else if (action.priorite === 2) stats.par_priorite.moyenne++;
      else if (action.priorite === 3) stats.par_priorite.basse++;
    });
    
    // Taux de complétion
    stats.taux_completion = stats.total > 0 
      ? Math.round((stats.fait / stats.total) * 100) 
      : 0;
    
    return stats;
  }
  
  /**
   * Récupère les actions avec les plus grosses économies
   */
  static async getTopEconomies(sessionId, limit = 5) {
    const { data, error } = await supabase
      .from('actions_optimisation')
      .select(`
        *,
        budgets_optimises (
          *,
          recurring_transactions (nom)
        )
      `)
      .eq('session_id', sessionId)
      .order('economie_mensuelle', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les actions urgentes (date limite proche)
   */
  static async getUrgent(sessionId, joursAvance = 7) {
    const dateLimite = new Date();
    dateLimite.setDate(dateLimite.getDate() + joursAvance);
    
    const { data, error } = await supabase
      .from('actions_optimisation')
      .select('*')
      .eq('session_id', sessionId)
      .in('statut', ['todo', 'en_cours'])
      .lte('date_limite', dateLimite.toISOString().split('T')[0])
      .order('date_limite', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  
  // ===============================
  // HELPERS
  // ===============================
  
  /**
   * Obtient le label de priorité
   */
  static getPrioriteLabel(priorite) {
    const labels = {
      1: 'Haute',
      2: 'Moyenne',
      3: 'Basse'
    };
    return labels[priorite] || 'Non définie';
  }
  
  /**
   * Obtient l'emoji de priorité
   */
  static getPrioriteEmoji(priorite) {
    const emojis = {
      1: '🔴',
      2: '🟡',
      3: '🟢'
    };
    return emojis[priorite] || '⚪';
  }
  
  /**
   * Obtient le label de statut
   */
  static getStatutLabel(statut) {
    const labels = {
      'todo': 'À faire',
      'en_cours': 'En cours',
      'fait': 'Terminé',
      'abandonnee': 'Abandonné'
    };
    return labels[statut] || statut;
  }
  
  /**
   * Obtient l'emoji de statut
   */
  static getStatutEmoji(statut) {
    const emojis = {
      'todo': '⬜',
      'en_cours': '🔄',
      'fait': '✅',
      'abandonnee': '❌'
    };
    return emojis[statut] || '⬜';
  }
  
  /**
   * Vérifie si une action est en retard
   */
  static isOverdue(action) {
    if (!action.date_limite || action.statut === 'fait' || action.statut === 'abandonnee') {
      return false;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(action.date_limite);
    
    return deadline < today;
  }
  
  /**
   * Calcule le nombre de jours restants
   */
  static getDaysRemaining(action) {
    if (!action.date_limite) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(action.date_limite);
    
    const diff = deadline - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
  
  /**
   * Formate l'économie en texte lisible
   */
  static formatEconomie(economie) {
    const montant = parseFloat(economie);
    if (isNaN(montant)) return '0€';
    
    return `${montant.toFixed(2)}€/mois`;
  }
  
  /**
   * Génère une description automatique pour une action courante
   */
  static generateDescription(type, nomRecurrence) {
    const templates = {
      'resilier': `Résilier ${nomRecurrence}`,
      'negocier': `Renégocier ${nomRecurrence}`,
      'changer': `Changer de fournisseur pour ${nomRecurrence}`,
      'reduire': `Réduire la dépense ${nomRecurrence}`,
      'comparer': `Comparer les offres pour ${nomRecurrence}`,
      'optimiser': `Optimiser ${nomRecurrence}`
    };
    
    return templates[type] || `Action pour ${nomRecurrence}`;
  }
  
  /**
   * Suggère une priorité en fonction de l'économie
   */
  static suggestPriorite(economie) {
    const montant = parseFloat(economie);
    
    if (montant >= 50) return 1; // Haute
    if (montant >= 20) return 2; // Moyenne
    return 3; // Basse
  }
  
  /**
   * Suggère une date limite en fonction de la priorité
   */
  static suggestDateLimite(priorite) {
    const today = new Date();
    let jours = 30; // Par défaut : 1 mois
    
    if (priorite === 1) jours = 7;  // 1 semaine pour haute priorité
    if (priorite === 2) jours = 14; // 2 semaines pour moyenne
    if (priorite === 3) jours = 30; // 1 mois pour basse
    
    today.setDate(today.getDate() + jours);
    return today.toISOString().split('T')[0];
  }
}

module.exports = ActionOptimisation;