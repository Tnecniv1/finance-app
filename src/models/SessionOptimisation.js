// src/models/SessionOptimisation.js
const supabase = require('../../config/supabase');

class SessionOptimisation {
  
  // ===============================
  // CRÉATION ET RÉCUPÉRATION
  // ===============================
  
  /**
   * Crée une nouvelle session d'optimisation
   */
  static async create(userId, data) {
    const { data: session, error } = await supabase
      .from('sessions_optimisation')
      .insert({
        user_id: userId,
        mois_cible: data.mois_cible,
        revenus_recurrents: data.revenus_recurrents || 0,
        revenus_optimises: data.revenus_recurrents || 0,
        depenses_recurrentes: data.depenses_recurrentes || 0,
        depenses_optimisees: data.depenses_optimisees || 0,
        solde_previsionnel: data.solde_previsionnel || 0,
        statut: 'en_cours'
      })
      .select()
      .single();
    
    if (error) throw error;
    return session;
  }
  
  /**
   * Récupère la session en cours d'un utilisateur
   */
  static async getCurrent(userId) {
    const { data, error } = await supabase
      .from('sessions_optimisation')
      .select('*')
      .eq('user_id', userId)
      .eq('statut', 'en_cours')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Récupère une session par ID
   */
  static async getById(sessionId) {
    const { data, error } = await supabase
      .from('sessions_optimisation')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Récupère une session avec tous ses détails (budgets + actions)
   */
  static async getByIdWithDetails(sessionId) {
    // Récupérer la session
    const session = await this.getById(sessionId);
    
    // Récupérer les budgets
    const { data: budgets, error: budgetsError } = await supabase
      .from('budgets_optimises')
      .select(`
        *,
        recurring_transactions (
          id,
          nom,
          description,
          nature,
          montant_moyen,
          frequence,
          jour_mois,
          jour_semaine,
          jour_annee
        )
      `)
      .eq('session_id', sessionId)
      .order('category_type', { ascending: false })
      .order('montant_actuel', { ascending: false });
    
    if (budgetsError) throw budgetsError;
    
    // Récupérer les actions
    const { data: actions, error: actionsError } = await supabase
      .from('actions_optimisation')
      .select('*')
      .eq('session_id', sessionId)
      .order('priorite', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (actionsError) throw actionsError;
    
    return {
      ...session,
      budgets: budgets || [],
      actions: actions || []
    };
  }
  
  /**
   * Récupère toutes les sessions d'un utilisateur
   */
  static async getAllByUser(userId, options = {}) {
    let query = supabase
      .from('sessions_optimisation')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    // Filtrer par statut si spécifié
    if (options.statut) {
      query = query.eq('statut', options.statut);
    }
    
    // Limiter le nombre de résultats si spécifié
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les sessions validées d'un utilisateur avec résumé
   */
  static async getValidatedSessions(userId, limit = 10) {
    const { data, error } = await supabase
      .from('v_sessions_resume')
      .select('*')
      .eq('user_id', userId)
      .eq('statut', 'validee')
      .order('mois_cible', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }
  
  
  // ===============================
  // MISE À JOUR
  // ===============================
  
  /**
   * Met à jour une session
   */
  static async update(sessionId, updates) {
    const { data, error } = await supabase
      .from('sessions_optimisation')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Met à jour les revenus optimisés
   */
  static async updateRevenus(sessionId, revenusOptimises) {
    return this.update(sessionId, {
      revenus_optimises: parseFloat(revenusOptimises)
    });
  }
  
  /**
   * Met à jour les dépenses optimisées (incrémental)
   */
  static async addDepensesOptimisees(sessionId, montant) {
    const session = await this.getById(sessionId);
    const newTotal = (parseFloat(session.depenses_optimisees) || 0) + parseFloat(montant);
    
    return this.update(sessionId, {
      depenses_optimisees: newTotal
    });
  }
  
  /**
   * Recalcule le solde prévisionnel
   */
  static async recalculateSolde(sessionId) {
    const session = await this.getById(sessionId);
    const solde = parseFloat(session.revenus_optimises || 0) - parseFloat(session.depenses_optimisees || 0);
    
    return this.update(sessionId, {
      solde_previsionnel: solde
    });
  }
  
  
  // ===============================
  // VALIDATION ET STATUTS
  // ===============================
  
  /**
   * Valide une session (la termine)
   */
  static async validate(sessionId) {
    // Recalculer le solde avant validation
    await this.recalculateSolde(sessionId);
    
    // Valider
    return this.update(sessionId, {
      statut: 'validee',
      validated_at: new Date().toISOString()
    });
  }
  
  /**
   * Archive une session
   */
  static async archive(sessionId) {
    return this.update(sessionId, {
      statut: 'archivee'
    });
  }
  
  /**
   * Annule une session en cours
   */
  static async cancel(sessionId) {
    const session = await this.getById(sessionId);
    
    if (session.statut !== 'en_cours') {
      throw new Error('Seules les sessions en cours peuvent être annulées');
    }
    
    // Supprimer tous les budgets et actions associés
    await supabase
      .from('budgets_optimises')
      .delete()
      .eq('session_id', sessionId);
    
    await supabase
      .from('actions_optimisation')
      .delete()
      .eq('session_id', sessionId);
    
    // Supprimer la session
    const { error } = await supabase
      .from('sessions_optimisation')
      .delete()
      .eq('id', sessionId);
    
    if (error) throw error;
    return true;
  }
  
  
  // ===============================
  // STATISTIQUES
  // ===============================
  
  /**
   * Calcule les statistiques d'une session
   */
  static async getStatistics(sessionId) {
    const session = await this.getByIdWithDetails(sessionId);
    
    // Économies totales
    const economieTotale = session.budgets.reduce((sum, b) => {
      return sum + (parseFloat(b.montant_actuel) - parseFloat(b.montant_optimal));
    }, 0);
    
    // Nombre d'actions par statut
    const actionsStats = session.actions.reduce((acc, a) => {
      acc[a.statut] = (acc[a.statut] || 0) + 1;
      return acc;
    }, {});
    
    // Économies par catégorie
    const economiesParCategorie = {};
    session.budgets.forEach(b => {
      const key = b.category_type;
      if (!economiesParCategorie[key]) {
        economiesParCategorie[key] = 0;
      }
      economiesParCategorie[key] += parseFloat(b.montant_actuel) - parseFloat(b.montant_optimal);
    });
    
    return {
      economieTotale,
      actionsStats,
      economiesParCategorie,
      nombreBudgets: session.budgets.length,
      nombreActions: session.actions.length,
      tauxOptimisation: session.depenses_recurrentes > 0 
        ? ((session.depenses_recurrentes - session.depenses_optimisees) / session.depenses_recurrentes * 100)
        : 0
    };
  }
  
  
  // ===============================
  // UTILITAIRES
  // ===============================
  
  /**
   * Vérifie si un utilisateur a déjà une session en cours
   */
  static async hasActiveSession(userId) {
    const session = await this.getCurrent(userId);
    return session !== null;
  }
  
  /**
   * Génère le mois cible (mois prochain par défaut)
   */
  static getNextMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Formate un mois cible en texte lisible
   */
  static formatMoisCible(moisCible) {
    const date = new Date(moisCible);
    return date.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    });
  }
  
  /**
   * Vérifie si une session peut être modifiée
   */
  static async canBeModified(sessionId) {
    const session = await this.getById(sessionId);
    return session.statut === 'en_cours';
  }
  
  /**
   * Clone une session validée pour un nouveau mois
   */
  static async cloneForNewMonth(sessionId, nouveauMoisCible) {
    const oldSession = await this.getByIdWithDetails(sessionId);
    
    // Créer la nouvelle session
    const newSession = await this.create(oldSession.user_id, {
      mois_cible: nouveauMoisCible,
      revenus_recurrents: oldSession.revenus_optimises,
      depenses_recurrentes: oldSession.depenses_optimisees
    });
    
    // Copier les budgets
    const budgetsToInsert = oldSession.budgets.map(b => ({
      session_id: newSession.id,
      recurring_transaction_id: b.recurring_transaction_id,
      montant_actuel: b.montant_optimal, // L'optimal devient l'actuel
      montant_optimal: b.montant_optimal,
      category_type: b.category_type,
      category_id: b.category_id,
      sous_category_id: b.sous_category_id
    }));
    
    if (budgetsToInsert.length > 0) {
      const { error: budgetsError } = await supabase
        .from('budgets_optimises')
        .insert(budgetsToInsert);
      
      if (budgetsError) throw budgetsError;
    }
    
    // Copier les actions non terminées
    const actionsToInsert = oldSession.actions
      .filter(a => a.statut !== 'fait')
      .map(a => ({
        session_id: newSession.id,
        budget_optimise_id: null, // À réassocier manuellement si besoin
        description: a.description,
        economie_mensuelle: a.economie_mensuelle,
        priorite: a.priorite,
        statut: 'todo'
      }));
    
    if (actionsToInsert.length > 0) {
      const { error: actionsError } = await supabase
        .from('actions_optimisation')
        .insert(actionsToInsert);
      
      if (actionsError) throw actionsError;
    }
    
    return newSession;
  }
}

module.exports = SessionOptimisation;