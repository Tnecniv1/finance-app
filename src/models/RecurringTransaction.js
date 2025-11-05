// src/models/RecurringTransaction.js
const supabase = require('../../config/supabase');

class RecurringTransaction {
  
  // ===============================
  // RÉCURRENCES VALIDÉES
  // ===============================
  
  /**
   * Récupère toutes les récurrences validées d'un utilisateur
   */
  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère une récurrence par ID
   */
  static async findById(id) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // CORRECTION: maybeSingle au lieu de single
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Crée une nouvelle récurrence validée
   */
  static async create(recurringData) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .insert([recurringData])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Met à jour une récurrence
   */
  static async update(id, updates) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Désactive une récurrence (soft delete)
   */
  static async deactivate(id) {
    return this.update(id, { active: false });
  }
  
  /**
   * Supprime définitivement une récurrence
   */
  static async delete(id) {
    const { error } = await supabase
      .from('recurring_transactions')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }
  
  
  // ===============================
  // DÉTECTIONS EN ATTENTE
  // ===============================
  
  /**
   * Récupère toutes les détections en attente pour un utilisateur
   */
  static async findDetectionsPending(userId) {
    const { data, error } = await supabase
      .from('detected_recurrences')
      .select('*')
      .eq('user_id', userId)
      .eq('statut', 'pending')
      .order('confiance', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Récupère une détection par ID
   */
  static async findDetectionById(id) {
    const { data, error } = await supabase
      .from('detected_recurrences')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // CORRECTION: maybeSingle au lieu de single
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Enregistre des détections automatiques
   */
  static async createDetections(detectionsArray) {
    const { data, error } = await supabase
      .from('detected_recurrences')
      .insert(detectionsArray)
      .select();
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Valide une détection (la transforme en récurrence validée)
   */
  static async validateDetection(detectionId, userModifications = {}) {
    // 1. Récupérer la détection
    const detection = await this.findDetectionById(detectionId);
    
    if (!detection) {
      throw new Error('Détection introuvable');
    }
    
    // 2. Créer la récurrence validée
    const recurringData = {
      user_id: detection.user_id,
      nom: userModifications.nom || detection.nom_detecte,
      nature: detection.nature,
      montant_moyen: userModifications.montant_moyen || detection.montant_moyen,
      montant_min: detection.montant_min,
      montant_max: detection.montant_max,
      variabilite_pct: this.calculateVariabilityPct(detection),
      frequence: userModifications.frequence || detection.frequence,
      jour_semaine: userModifications.jour_semaine || null,
      jour_mois: userModifications.jour_mois || detection.jour_reference,
      categorie_revenu_id: userModifications.categorie_revenu_id || detection.categorie_revenu_id,
      categorie_depense_id: userModifications.categorie_depense_id || detection.categorie_depense_id,
      date_debut: detection.date_premiere_occurrence,
      active: true,
      nb_occurrences: detection.nb_occurrences,
      derniere_occurrence: detection.date_derniere_occurrence
    };
    
    const newRecurring = await this.create(recurringData);
    
    // 3. Mettre à jour le statut de la détection
    const { error: updateError } = await supabase
      .from('detected_recurrences')
      .update({
        statut: 'validated',
        validated_at: new Date().toISOString(),
        recurring_transaction_id: newRecurring.id
      })
      .eq('id', detectionId);
    
    if (updateError) throw updateError;
    
    // 4. Créer les mappings avec les transactions
    await this.createMappingsFromDetection(detection.transaction_ids, newRecurring.id);
    
    return newRecurring;
  }
  
  /**
   * Rejette une détection
   */
  static async rejectDetection(detectionId) {
    const { error } = await supabase
      .from('detected_recurrences')
      .update({ statut: 'rejected' })
      .eq('id', detectionId);
    
    if (error) throw error;
    return true;
  }
  
  /**
   * Supprime toutes les anciennes détections pour un utilisateur
   * (utile avant de relancer une nouvelle détection)
   */
  static async clearOldDetections(userId) {
    const { error } = await supabase
      .from('detected_recurrences')
      .delete()
      .eq('user_id', userId)
      .eq('statut', 'pending');
    
    if (error) throw error;
    return true;
  }
  
  
  // ===============================
  // MAPPINGS TRANSACTIONS
  // ===============================
  
  /**
   * Crée les liens entre transactions et récurrence validée
   */
  static async createMappingsFromDetection(transactionIds, recurringId) {
    // transactionIds est un array JSONB d'UUIDs
    const mappings = transactionIds.map(txId => ({
      transaction_id: txId,
      recurring_transaction_id: recurringId,
      confidence: 1.0
    }));
    
    const { error } = await supabase
      .from('transaction_recurrence_mapping')
      .insert(mappings);
    
    if (error) {
      console.warn('Erreur lors de la création des mappings:', error);
      // Ne pas bloquer si erreur (peut-être des doublons)
    }
    
    return true;
  }
  
  /**
   * Récupère les transactions associées à une récurrence
   */
  static async getTransactionsByRecurringId(recurringId) {
    const { data, error } = await supabase
      .from('transaction_recurrence_mapping')
      .select('transaction_id')
      .eq('recurring_transaction_id', recurringId);
    
    if (error) throw error;
    return data.map(m => m.transaction_id);
  }
  
  
  // ===============================
  // UTILITAIRES
  // ===============================
  
  /**
   * Calcule le pourcentage de variabilité
   */
  static calculateVariabilityPct(detection) {
    if (!detection.montant_ecart_type || !detection.montant_moyen) {
      return 0;
    }
    
    const coeffVar = detection.montant_ecart_type / detection.montant_moyen;
    return Math.round(coeffVar * 100 * 100) / 100; // Arrondi à 2 décimales
  }
  
  /**
   * Vérifie si une récurrence doit se produire dans une période donnée
   */
  static shouldOccurInPeriod(recurring, dateDebut, dateFin) {
    const occurrences = [];
    
    // Vérifier si la récurrence est active dans cette période
    if (new Date(recurring.date_debut) > dateFin) {
      return occurrences;
    }
    
    if (recurring.date_fin && new Date(recurring.date_fin) < dateDebut) {
      return occurrences;
    }
    
    // Calculer les occurrences selon la fréquence
    let currentDate = new Date(dateDebut);
    
    while (currentDate <= dateFin) {
      let shouldAdd = false;
      
      switch (recurring.frequence) {
        case 'weekly':
          if (recurring.jour_semaine && currentDate.getDay() === (recurring.jour_semaine === 7 ? 0 : recurring.jour_semaine)) {
            shouldAdd = true;
          }
          break;
          
        case 'monthly':
          if (recurring.jour_mois && currentDate.getDate() === recurring.jour_mois) {
            shouldAdd = true;
          }
          break;
          
        case 'yearly':
          if (recurring.jour_annee) {
            const [month, day] = recurring.jour_annee.split('-').map(Number);
            if (currentDate.getMonth() + 1 === month && currentDate.getDate() === day) {
              shouldAdd = true;
            }
          }
          break;
      }
      
      if (shouldAdd && currentDate >= new Date(recurring.date_debut)) {
        occurrences.push(new Date(currentDate));
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return occurrences;
  }

  // Trouve une récurrence par ID
  static async findById(id) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  // Cherche un doublon
  static async findDuplicate(userId, description, amount) {
    const { data } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('pattern_description', description)
      .gte('amount', amount * 0.95)
      .lte('amount', amount * 1.05)
      .eq('status', 'validated')
      .single();
    
    return data;
  }

  // Crée une détection (status = 'pending')
  static async createDetection(data) {
    const { data: detection, error } = await supabase
      .from('recurring_transactions')
      .insert({
        ...data,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return detection;
  }

  // Valide une détection
  static async validateDetection(detectionId, modifications = {}) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .update({
        ...modifications,
        status: 'validated',
        active: true,
        validated_at: new Date().toISOString()
      })
      .eq('id', detectionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Rejette une détection
  static async rejectDetection(detectionId) {
    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        status: 'rejected',
        active: false
      })
      .eq('id', detectionId);
    
    if (error) throw error;
  }

  // Trouve les détections pending
  static async findDetectionsPending(userId) {
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('confidence_score', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }




}

module.exports = RecurringTransaction;