// src/models/BudgetOptimise.js
const supabase = require('../../config/supabase');

class BudgetOptimise {
  
  // ===============================
  // CRÉATION ET RÉCUPÉRATION
  // ===============================
  
  /**
   * Crée un budget optimisé
   */
  static async create(sessionId, recurringTransactionId, data) {
    const { data: budget, error } = await supabase
      .from('budgets_optimises')
      .insert({
        session_id: sessionId,
        recurring_transaction_id: recurringTransactionId,
        montant_actuel: parseFloat(data.montant_actuel),
        montant_optimal: parseFloat(data.montant_optimal),
        category_type: data.category_type,
        category_id: data.category_id,
        sous_category_id: data.sous_category_id || null
      })
      .select()
      .single();
    
    if (error) throw error;
    return budget;
  }
  
  /**
   * Crée plusieurs budgets en une seule requête
   */
  static async createBatch(budgetsArray) {
    const { data, error } = await supabase
      .from('budgets_optimises')
      .insert(budgetsArray)
      .select();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Récupère un budget par ID
   */
  static async getById(budgetId) {
    const { data, error } = await supabase
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
          jour_annee,
          active
        )
      `)
      .eq('id', budgetId)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Récupère tous les budgets d'une session
   */
  static async getBySession(sessionId) {
    const { data, error } = await supabase
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
          jour_annee,
          active
        )
      `)
      .eq('session_id', sessionId)
      .order('category_type', { ascending: false })
      .order('montant_actuel', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les budgets d'une session par type (revenu/depense)
   */
  static async getBySessionAndType(sessionId, categoryType) {
    const { data, error } = await supabase
      .from('budgets_optimises')
      .select(`
        *,
        recurring_transactions (*)
      `)
      .eq('session_id', sessionId)
      .eq('category_type', categoryType)
      .order('montant_actuel', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les budgets d'une catégorie spécifique
   */
  static async getBySessionAndCategory(sessionId, categoryId, categoryType) {
    const { data, error } = await supabase
      .from('budgets_optimises')
      .select(`
        *,
        recurring_transactions (*)
      `)
      .eq('session_id', sessionId)
      .eq('category_id', categoryId)
      .eq('category_type', categoryType)
      .order('montant_actuel', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère les budgets avec détails complets (via vue)
   */
  static async getDetailsById(budgetId) {
    const { data, error } = await supabase
      .from('v_budgets_details')
      .select('*')
      .eq('id', budgetId)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  
  // ===============================
  // MISE À JOUR
  // ===============================
  
  /**
   * Met à jour un budget
   */
  static async update(budgetId, updates) {
    const { data, error } = await supabase
      .from('budgets_optimises')
      .update(updates)
      .eq('id', budgetId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Met à jour le montant optimal
   */
  static async updateMontantOptimal(budgetId, nouveauMontant) {
    return this.update(budgetId, {
      montant_optimal: parseFloat(nouveauMontant)
    });
  }
  
  /**
   * Met à jour plusieurs budgets en une fois
   */
  static async updateBatch(updates) {
    // updates = [{id: 1, montant_optimal: 100}, {id: 2, montant_optimal: 200}]
    const promises = updates.map(update => 
      this.update(update.id, { montant_optimal: parseFloat(update.montant_optimal) })
    );
    
    return Promise.all(promises);
  }
  
  
  // ===============================
  // SUPPRESSION
  // ===============================
  
  /**
   * Supprime un budget
   */
  static async delete(budgetId) {
    const { error } = await supabase
      .from('budgets_optimises')
      .delete()
      .eq('id', budgetId);
    
    if (error) throw error;
    return true;
  }
  
  /**
   * Supprime tous les budgets d'une session
   */
  static async deleteBySession(sessionId) {
    const { error } = await supabase
      .from('budgets_optimises')
      .delete()
      .eq('session_id', sessionId);
    
    if (error) throw error;
    return true;
  }
  
  
  // ===============================
  // CALCULS ET STATISTIQUES
  // ===============================
  
  /**
   * Calcule l'économie d'un budget
   */
  static calculateEconomie(budget) {
    return parseFloat(budget.montant_actuel) - parseFloat(budget.montant_optimal);
  }
  
  /**
   * Calcule le pourcentage de réduction
   */
  static calculateReductionPct(budget) {
    const economie = this.calculateEconomie(budget);
    if (budget.montant_actuel === 0) return 0;
    return (economie / parseFloat(budget.montant_actuel)) * 100;
  }
  
  /**
   * Calcule les totaux par type (revenus/dépenses)
   */
  static async getTotalsByType(sessionId) {
    const budgets = await this.getBySession(sessionId);
    
    const totaux = {
      revenus_actuels: 0,
      revenus_optimises: 0,
      depenses_actuelles: 0,
      depenses_optimisees: 0
    };
    
    budgets.forEach(budget => {
      if (budget.category_type === 'revenu') {
        totaux.revenus_actuels += parseFloat(budget.montant_actuel);
        totaux.revenus_optimises += parseFloat(budget.montant_optimal);
      } else {
        totaux.depenses_actuelles += parseFloat(budget.montant_actuel);
        totaux.depenses_optimisees += parseFloat(budget.montant_optimal);
      }
    });
    
    return totaux;
  }
  
  /**
   * Groupe les budgets par catégorie
   */
  static async groupByCategory(sessionId) {
    const budgets = await this.getBySession(sessionId);
    
    const grouped = {};
    
    budgets.forEach(budget => {
      const key = `${budget.category_type}_${budget.category_id}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          category_type: budget.category_type,
          category_id: budget.category_id,
          budgets: [],
          total_actuel: 0,
          total_optimal: 0,
          economie_totale: 0
        };
      }
      
      grouped[key].budgets.push(budget);
      grouped[key].total_actuel += parseFloat(budget.montant_actuel);
      grouped[key].total_optimal += parseFloat(budget.montant_optimal);
      grouped[key].economie_totale += this.calculateEconomie(budget);
    });
    
    return Object.values(grouped);
  }
  
  /**
   * Récupère les budgets avec les économies les plus importantes
   */
  static async getTopEconomies(sessionId, limit = 5) {
    const budgets = await this.getBySession(sessionId);
    
    return budgets
      .map(budget => ({
        ...budget,
        economie: this.calculateEconomie(budget),
        reduction_pct: this.calculateReductionPct(budget)
      }))
      .sort((a, b) => b.economie - a.economie)
      .slice(0, limit);
  }
  
  
  // ===============================
  // GÉNÉRATION DE TRANSACTIONS PLANIFIÉES
  // ===============================
  
  /**
   * Génère le calendrier des transactions pour un mois
   */
  static async genererCalendrier(sessionId, moisCible) {
    const budgets = await this.getBySession(sessionId);
    const transactions = [];
    
    const mois = new Date(moisCible);
    const premierJour = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const dernierJour = new Date(mois.getFullYear(), mois.getMonth() + 1, 0);
    
    budgets.forEach(budget => {
      const recurring = budget.recurring_transactions;
      
      if (!recurring || !recurring.active) return;
      
      // Calculer les occurrences selon la fréquence
      let occurrences = [];
      
      switch (recurring.frequence) {
        case 'weekly':
          occurrences = this.calculateWeeklyOccurrences(
            premierJour, 
            dernierJour, 
            recurring.jour_semaine
          );
          break;
          
        case 'monthly':
          if (recurring.jour_mois) {
            const jour = Math.min(recurring.jour_mois, dernierJour.getDate());
            occurrences = [new Date(mois.getFullYear(), mois.getMonth(), jour)];
          }
          break;
          
        case 'yearly':
          // Vérifier si c'est le bon mois
          if (recurring.jour_annee) {
            const [month, day] = recurring.jour_annee.split('-').map(Number);
            if (mois.getMonth() + 1 === month) {
              occurrences = [new Date(mois.getFullYear(), month - 1, day)];
            }
          }
          break;
      }
      
      // Ajouter les transactions au calendrier
      occurrences.forEach(date => {
        transactions.push({
          date: date,
          dateFormatted: date.toLocaleDateString('fr-FR', { 
            day: '2-digit', 
            month: '2-digit' 
          }),
          nom: recurring.nom,
          description: recurring.description,
          montant: parseFloat(budget.montant_optimal),
          type: budget.category_type,
          frequence: recurring.frequence,
          budget_id: budget.id
        });
      });
    });
    
    // Trier par date
    return transactions.sort((a, b) => a.date - b.date);
  }
  
  /**
   * Calcule les occurrences hebdomadaires dans une période
   */
  static calculateWeeklyOccurrences(dateDebut, dateFin, jourSemaine) {
    const occurrences = [];
    const currentDate = new Date(dateDebut);
    
    // Trouver le premier jour correspondant
    while (currentDate <= dateFin) {
      const dayOfWeek = currentDate.getDay();
      const targetDay = jourSemaine === 7 ? 0 : jourSemaine; // Dimanche = 0
      
      if (dayOfWeek === targetDay) {
        occurrences.push(new Date(currentDate));
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return occurrences;
  }
  
  
  // ===============================
  // VALIDATION ET VÉRIFICATION
  // ===============================
  
  /**
   * Vérifie si un budget existe déjà pour une recurring_transaction
   */
  static async exists(sessionId, recurringTransactionId) {
    const { data, error } = await supabase
      .from('budgets_optimises')
      .select('id')
      .eq('session_id', sessionId)
      .eq('recurring_transaction_id', recurringTransactionId)
      .maybeSingle();
    
    if (error) throw error;
    return data !== null;
  }
  
  /**
   * Vérifie qu'un montant optimal est valide
   */
  static validateMontantOptimal(montantOptimal, montantActuel) {
    const optimal = parseFloat(montantOptimal);
    const actuel = parseFloat(montantActuel);
    
    if (isNaN(optimal) || optimal < 0) {
      return { valid: false, message: 'Le montant optimal doit être positif' };
    }
    
    // Avertissement si augmentation
    if (optimal > actuel) {
      return { 
        valid: true, 
        warning: 'Le montant optimal est supérieur au montant actuel' 
      };
    }
    
    return { valid: true };
  }
}

module.exports = BudgetOptimise;