// src/services/recurrenceDetector.js
const Transaction = require('../models/Transaction');
const RecurringTransaction = require('../models/RecurringTransaction');

/**
 * Service de détection des transactions récurrentes
 * Amélioration pour détecter les salaires et autres récurrences évidentes
 */
class RecurrenceDetector {
  
  /**
   * Détecte automatiquement les récurrences dans les transactions de l'utilisateur
   */
  static async detectRecurrences(userId) {
    try {
      console.log(`🔍 Début détection récurrences pour user ${userId}`);
      
      // 1. Récupérer TOUTES les transactions de l'utilisateur
      const allTransactions = await Transaction.findByUserId(userId);
      
      if (!allTransactions || allTransactions.length < 3) {
        return {
          success: true,
          message: 'Pas assez de transactions pour détecter des récurrences',
          detected: 0,
          detections: []
        };
      }
      
      console.log(`📊 ${allTransactions.length} transactions à analyser`);
      
      // 2. Grouper les transactions par similarité (objet/montant)
      const groups = this.groupSimilarTransactions(allTransactions);
      
      console.log(`📦 ${groups.length} groupes de transactions similaires`);
      
      // 3. Analyser chaque groupe pour détecter la récurrence
      const detections = [];
      
      for (const group of groups) {
        // Il faut au minimum 2 occurrences pour une récurrence
        if (group.transactions.length >= 2) {
          const recurrence = this.analyzeRecurrencePattern(group);
          
          if (recurrence) {
            // Vérifier si cette détection n'existe pas déjà
            const exists = await RecurringTransaction.findDuplicate(
              userId,
              recurrence.pattern_description,
              recurrence.amount
            );
            
            if (!exists) {
              detections.push(recurrence);
            }
          }
        }
      }
      
      console.log(`✅ ${detections.length} récurrences détectées`);
      
      // 4. Sauvegarder les détections en base
      const saved = [];
      for (const detection of detections) {
        try {
          const recurring = await RecurringTransaction.createDetection({
            user_id: userId,
            ...detection
          });
          saved.push(recurring);
        } catch (error) {
          console.error('Erreur sauvegarde détection:', error);
        }
      }
      
      return {
        success: true,
        detected: saved.length,
        detections: saved,
        message: `${saved.length} nouvelle(s) récurrence(s) détectée(s)`
      };
      
    } catch (error) {
      console.error('Erreur détection récurrences:', error);
      throw error;
    }
  }
  
  
  /**
   * Groupe les transactions similaires (même objet/montant approximatif)
   */
  static groupSimilarTransactions(transactions) {
    const groups = [];
    
    for (const transaction of transactions) {
      // Chercher un groupe existant compatible
      let foundGroup = false;
      
      for (const group of groups) {
        if (this.areSimilarTransactions(transaction, group.transactions[0])) {
          group.transactions.push(transaction);
          foundGroup = true;
          break;
        }
      }
      
      // Si aucun groupe trouvé, en créer un nouveau
      if (!foundGroup) {
        groups.push({
          transactions: [transaction],
          pattern_key: this.generatePatternKey(transaction)
        });
      }
    }
    
    // Trier les transactions dans chaque groupe par date
    groups.forEach(group => {
      group.transactions.sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
    });
    
    return groups;
  }
  
  
  /**
   * Vérifie si deux transactions sont similaires
   */
  static areSimilarTransactions(t1, t2) {
    // 1. Vérifier le type (revenu/dépense)
    const type1 = parseFloat(t1.montant) > 0 ? 'revenu' : 'depense';
    const type2 = parseFloat(t2.montant) > 0 ? 'revenu' : 'depense';
    
    if (type1 !== type2) {
      return false;
    }
    
    // 2. Comparer les montants (tolérance de ±5%)
    const amount1 = Math.abs(parseFloat(t1.montant));
    const amount2 = Math.abs(parseFloat(t2.montant));
    const tolerance = 0.05; // 5%
    
    const amountDiff = Math.abs(amount1 - amount2);
    const avgAmount = (amount1 + amount2) / 2;
    
    if (amountDiff > avgAmount * tolerance) {
      return false;
    }
    
    // 3. Comparer les objets (similarité textuelle)
    const similarity = this.calculateTextSimilarity(
      this.normalizeText(t1.objet),
      this.normalizeText(t2.objet)
    );
    
    // Seuil de similarité : 70%
    return similarity >= 0.7;
  }
  
  
  /**
   * Normalise un texte pour la comparaison
   */
  static normalizeText(text) {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .replace(/[0-9]+/g, '') // Supprimer les chiffres (dates, numéros)
      .replace(/\s+/g, ' ')    // Normaliser les espaces
      .trim();
  }
  
  
  /**
   * Calcule la similarité entre deux textes (algorithme de Levenshtein simplifié)
   */
  static calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Découper en mots
    const words1 = new Set(text1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(text2.split(' ').filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    // Calculer l'intersection
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    
    // Coefficient de Jaccard
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }
  
  
  /**
   * Génère une clé unique pour un pattern de transaction
   */
  static generatePatternKey(transaction) {
    const type = parseFloat(transaction.montant) > 0 ? 'R' : 'D';
    const amount = Math.abs(parseFloat(transaction.montant)).toFixed(0);
    const text = this.normalizeText(transaction.objet).substring(0, 20);
    
    return `${type}_${amount}_${text}`;
  }
  
  
  /**
   * Analyse un groupe de transactions pour détecter le pattern de récurrence
   */
  static analyzeRecurrencePattern(group) {
    const transactions = group.transactions;
    
    if (transactions.length < 2) {
      return null;
    }
    
    // Calculer les intervalles entre les transactions
    const intervals = [];
    for (let i = 1; i < transactions.length; i++) {
      const date1 = new Date(transactions[i - 1].date);
      const date2 = new Date(transactions[i].date);
      const diffDays = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }
    
    // Déterminer la fréquence
    const frequency = this.determineFrequency(intervals);
    
    if (!frequency) {
      return null; // Pas de pattern régulier détecté
    }
    
    // Calculer le montant moyen
    const amounts = transactions.map(t => Math.abs(parseFloat(t.montant)));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    
    // Déterminer le type
    const isRevenue = parseFloat(transactions[0].montant) > 0;
    
    // Générer une description
    const description = this.generateDescription(transactions[0], frequency);
    
    // Calculer le score de confiance
    const confidence = this.calculateConfidence(intervals, transactions.length);
    
    return {
      pattern_description: description,
      amount: avgAmount,
      frequency: frequency.code,
      frequency_label: frequency.label,
      next_expected_date: this.calculateNextDate(
        transactions[transactions.length - 1].date,
        frequency.code
      ),
      transaction_ids: transactions.map(t => t.id),
      confidence_score: confidence,
      is_revenue: isRevenue,
      detected_occurrences: transactions.length
    };
  }
  
  
  /**
   * Détermine la fréquence de récurrence basée sur les intervalles
   */
  static determineFrequency(intervals) {
    if (intervals.length === 0) return null;
    
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = this.calculateStdDev(intervals, avgInterval);
    
    // Si l'écart-type est trop élevé (>20% de la moyenne), pas de pattern régulier
    if (stdDev > avgInterval * 0.2) {
      return null;
    }
    
    // Détection des fréquences courantes
    const frequencies = [
      { code: 'weekly', label: 'Hebdomadaire', target: 7, tolerance: 2 },
      { code: 'biweekly', label: 'Bi-mensuel', target: 14, tolerance: 3 },
      { code: 'monthly', label: 'Mensuel', target: 30, tolerance: 5 },
      { code: 'bimonthly', label: 'Bimestriel', target: 60, tolerance: 10 },
      { code: 'quarterly', label: 'Trimestriel', target: 90, tolerance: 15 },
      { code: 'yearly', label: 'Annuel', target: 365, tolerance: 30 }
    ];
    
    for (const freq of frequencies) {
      if (Math.abs(avgInterval - freq.target) <= freq.tolerance) {
        return freq;
      }
    }
    
    return null; // Fréquence non standard
  }
  
  
  /**
   * Calcule l'écart-type
   */
  static calculateStdDev(values, mean) {
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }
  
  
  /**
   * Génère une description lisible de la récurrence
   */
  static generateDescription(transaction, frequency) {
    // Extraire les mots-clés importants
    const text = this.normalizeText(transaction.objet);
    const words = text.split(' ').filter(w => w.length > 3);
    
    // Prendre les 3 premiers mots significatifs
    const keywords = words.slice(0, 3).join(' ');
    
    return keywords || 'Transaction récurrente';
  }
  
  
  /**
   * Calcule le score de confiance de la détection (0-100)
   */
  static calculateConfidence(intervals, occurrences) {
    // Base : plus il y a d'occurrences, plus on est confiant
    let confidence = Math.min(occurrences * 15, 60);
    
    // Régularité des intervalles
    if (intervals.length > 0) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const stdDev = this.calculateStdDev(intervals, avgInterval);
      const regularity = Math.max(0, 100 - (stdDev / avgInterval * 100));
      
      confidence += regularity * 0.4;
    }
    
    return Math.round(Math.min(confidence, 100));
  }
  
  
  /**
   * Calcule la prochaine date attendue
   */
  static calculateNextDate(lastDate, frequency) {
    const date = new Date(lastDate);
    
    const daysToAdd = {
      'weekly': 7,
      'biweekly': 14,
      'monthly': 30,
      'bimonthly': 60,
      'quarterly': 90,
      'yearly': 365
    };
    
    const days = daysToAdd[frequency] || 30;
    date.setDate(date.getDate() + days);
    
    return date.toISOString().split('T')[0];
  }
  
  
  /**
   * Ajoute manuellement une transaction à une récurrence existante
   */
  static async addTransactionToRecurrence(recurringId, transactionId) {
    try {
      const recurring = await RecurringTransaction.findById(recurringId);
      
      if (!recurring) {
        throw new Error('Récurrence non trouvée');
      }
      
      // Récupérer les IDs existants
      const existingIds = recurring.transaction_ids || [];
      
      // Vérifier que la transaction n'est pas déjà associée
      if (existingIds.includes(transactionId)) {
        return {
          success: false,
          message: 'Transaction déjà associée à cette récurrence'
        };
      }
      
      // Ajouter la nouvelle transaction
      const updatedIds = [...existingIds, transactionId];
      
      // Mettre à jour
      await RecurringTransaction.update(recurringId, {
        transaction_ids: updatedIds
      });
      
      return {
        success: true,
        message: 'Transaction ajoutée à la récurrence'
      };
      
    } catch (error) {
      console.error('Erreur ajout transaction à récurrence:', error);
      throw error;
    }
  }
  
  
  /**
   * Retire une transaction d'une récurrence
   */
  static async removeTransactionFromRecurrence(recurringId, transactionId) {
    try {
      const recurring = await RecurringTransaction.findById(recurringId);
      
      if (!recurring) {
        throw new Error('Récurrence non trouvée');
      }
      
      // Récupérer les IDs existants
      const existingIds = recurring.transaction_ids || [];
      
      // Filtrer pour retirer la transaction
      const updatedIds = existingIds.filter(id => id !== transactionId);
      
      // Si plus de transactions, désactiver la récurrence
      if (updatedIds.length === 0) {
        await RecurringTransaction.deactivate(recurringId);
        return {
          success: true,
          message: 'Récurrence désactivée (plus de transactions associées)'
        };
      }
      
      // Sinon, mettre à jour
      await RecurringTransaction.update(recurringId, {
        transaction_ids: updatedIds
      });
      
      return {
        success: true,
        message: 'Transaction retirée de la récurrence'
      };
      
    } catch (error) {
      console.error('Erreur retrait transaction de récurrence:', error);
      throw error;
    }
  }
  
  
  /**
   * Crée une récurrence manuellement à partir d'une sélection de transactions
   */
  static async createManualRecurrence(userId, transactionIds, customData = {}) {
    try {
      // Récupérer les transactions sélectionnées
      const transactions = await Transaction.findByIds(transactionIds);
      
      if (!transactions || transactions.length < 2) {
        throw new Error('Au moins 2 transactions sont requises');
      }
      
      // Trier par date
      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculer le montant moyen
      const amounts = transactions.map(t => Math.abs(parseFloat(t.montant)));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      
      // Calculer les intervalles
      const intervals = [];
      for (let i = 1; i < transactions.length; i++) {
        const date1 = new Date(transactions[i - 1].date);
        const date2 = new Date(transactions[i].date);
        const diffDays = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
        intervals.push(diffDays);
      }
      
      // Déterminer la fréquence
      const frequency = this.determineFrequency(intervals) || {
        code: 'monthly',
        label: 'Mensuel'
      };
      
      // Type
      const isRevenue = parseFloat(transactions[0].montant) > 0;
      
      // Description par défaut ou personnalisée
      const description = customData.pattern_description || 
                         this.generateDescription(transactions[0], frequency);
      
      // Créer la récurrence
      const recurring = await RecurringTransaction.create({
        user_id: userId,
        pattern_description: description,
        amount: customData.amount || avgAmount,
        frequency: customData.frequency || frequency.code,
        frequency_label: frequency.label,
        next_expected_date: this.calculateNextDate(
          transactions[transactions.length - 1].date,
          customData.frequency || frequency.code
        ),
        transaction_ids: transactionIds,
        confidence_score: 100, // Confiance maximale car créé manuellement
        is_revenue: isRevenue,
        active: true,
        status: 'validated' // Directement validé car créé manuellement
      });
      
      return {
        success: true,
        message: 'Récurrence créée avec succès',
        recurring
      };
      
    } catch (error) {
      console.error('Erreur création récurrence manuelle:', error);
      throw error;
    }
  }
}

module.exports = RecurrenceDetector;