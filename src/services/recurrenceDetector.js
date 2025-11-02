// src/services/recurrenceDetector.js
const Transaction = require('../models/Transaction');
const RecurringTransaction = require('../models/RecurringTransaction');

/**
 * Service de détection automatique des récurrences
 */
class RecurrenceDetector {
  
  /**
   * Lance la détection complète pour un utilisateur
   */
  static async detectRecurrences(userId) {
    try {
      console.log(`🔍 Début de la détection pour user ${userId}`);
      
      // 1. Récupérer toutes les transactions de l'utilisateur
      const transactions = await Transaction.findByUserId(userId);
      
      if (transactions.length < 10) {
        return {
          success: false,
          message: 'Pas assez de transactions (minimum 10 requises)',
          detections: []
        };
      }
      
      console.log(`📊 ${transactions.length} transactions à analyser`);
      
      // 2. Grouper les transactions par description similaire
      const groups = this.groupTransactionsByDescription(transactions);
      console.log(`📦 ${Object.keys(groups).length} groupes créés`);
      
      // DEBUG: Afficher les groupes créés
      console.log('🔍 DEBUG - Groupes créés:');
      Object.entries(groups).forEach(([key, txs]) => {
        console.log(`  - "${key}": ${txs.length} transactions`);
        if (txs.length >= 3) {
          console.log(`    Exemples:`, txs.slice(0, 3).map(t => ({
            date: t.date,
            objet: t.objet,
            montant: t.montant
          })));
        }
      });
      
      // 3. Analyser chaque groupe pour détecter les récurrences
      const detections = [];
      
      for (const [key, txs] of Object.entries(groups)) {
        if (txs.length >= 3) { // Minimum 3 occurrences
          const recurrence = this.analyzeGroup(txs, key);
          
          if (recurrence) {
            detections.push(recurrence);
          }
        }
      }
      
      console.log(`✅ ${detections.length} récurrences détectées`);
      
      // 4. Nettoyer les anciennes détections en attente
      await RecurringTransaction.clearOldDetections(userId);
      
      // 5. Sauvegarder les nouvelles détections
      if (detections.length > 0) {
        const savedDetections = await RecurringTransaction.createDetections(
          detections.map(d => ({ ...d, user_id: userId }))
        );
        
        return {
          success: true,
          message: `${detections.length} récurrence(s) détectée(s)`,
          detections: savedDetections
        };
      }
      
      return {
        success: true,
        message: 'Aucune récurrence détectée',
        detections: []
      };
      
    } catch (error) {
      console.error('❌ Erreur détection:', error);
      throw error;
    }
  }
  
  
  /**
   * Groupe les transactions par description similaire
   */
  static groupTransactionsByDescription(transactions) {
    const groups = {};
    
    transactions.forEach(tx => {
      // Utiliser le champ "objet" au lieu de "description"
      const key = this.normalizeDescription(tx.objet);
      
      if (!groups[key]) {
        groups[key] = [];
      }
      
      groups[key].push(tx);
    });
    
    return groups;
  }
  
  
  /**
   * Normalise une description pour le regroupement
   */
  static normalizeDescription(description) {
    if (!description) return 'unknown';
    
    return description
      .toLowerCase()
      .trim()
      // Supprimer les numéros de référence
      .replace(/\d{4,}/g, '')
      // Supprimer les dates
      .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g, '')
      // Supprimer caractères spéciaux
      .replace(/[^\w\s]/g, '')
      // Supprimer espaces multiples
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  
  /**
   * Analyse un groupe de transactions pour détecter une récurrence
   */
  static analyzeGroup(transactions, key) {
    // Trier par date
    const sorted = [...transactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    // Calculer les intervalles entre transactions (en jours)
    const intervalles = [];
    for (let i = 1; i < sorted.length; i++) {
      const jours = this.daysBetween(sorted[i-1].date, sorted[i].date);
      intervalles.push(jours);
    }
    
    // Statistiques sur les intervalles
    const moyenneJours = this.mean(intervalles);
    const ecartTypeJours = this.stdDev(intervalles);
    const coefficientVariation = ecartTypeJours / moyenneJours;
    
    // Si trop irrégulier, ce n'est pas une récurrence
    if (coefficientVariation > 0.3) {
      return null;
    }
    
    // Détecter la fréquence
    const frequence = this.detectFrequency(moyenneJours);
    
    if (frequence === 'irregular') {
      return null;
    }
    
    // Statistiques sur les montants
    const montants = sorted.map(tx => parseFloat(tx.montant));
    const montantMoyen = this.mean(montants);
    const montantEcartType = this.stdDev(montants);
    const montantMin = Math.min(...montants);
    const montantMax = Math.max(...montants);
    
    // Calculer le jour de référence
    const jourReference = this.findMostCommonDay(sorted, frequence);
    
    // Niveau de confiance (1 - coefficient de variation)
    const confiance = Math.min(1, Math.max(0, 1 - coefficientVariation));
    
    // Nature (toutes les transactions du groupe doivent avoir la même nature)
    const nature = sorted[0].nature;
    
    // IDs des transactions (format JSONB pour UUID)
    const transactionIds = sorted.map(tx => tx.id);
    
    // Catégories (prendre la plus fréquente)
    const categorieRevenuId = nature === 'revenu' 
      ? this.findMostCommonValue(sorted.map(tx => tx.sous_categorie_revenu?.categorie_revenu_id).filter(Boolean))
      : null;
    
    const categorieDepenseId = nature === 'depense'
      ? this.findMostCommonValue(sorted.map(tx => tx.sous_categorie_depense?.categorie_depense_id).filter(Boolean))
      : null;
    
    return {
      nom_detecte: this.generateName(key, sorted[0]),
      nature,
      montant_moyen: Math.round(montantMoyen * 100) / 100,
      montant_ecart_type: Math.round(montantEcartType * 100) / 100,
      montant_min: Math.round(montantMin * 100) / 100,
      montant_max: Math.round(montantMax * 100) / 100,
      frequence,
      intervalle_jours_moyen: Math.round(moyenneJours * 10) / 10,
      intervalle_jours_ecart_type: Math.round(ecartTypeJours * 10) / 10,
      jour_reference: jourReference,
      confiance: Math.round(confiance * 100) / 100,
      coefficient_variation: Math.round(coefficientVariation * 10000) / 10000,
      transaction_ids: transactionIds,
      nb_occurrences: sorted.length,
      date_premiere_occurrence: sorted[0].date,
      date_derniere_occurrence: sorted[sorted.length - 1].date,
      categorie_revenu_id: categorieRevenuId,
      categorie_depense_id: categorieDepenseId
    };
  }
  
  
  /**
   * Génère un nom lisible pour la récurrence
   */
  static generateName(normalizedKey, firstTransaction) {
    // Si l'objet original est clair, l'utiliser
    if (firstTransaction.objet && firstTransaction.objet.length < 50) {
      return firstTransaction.objet.trim();
    }
    
    // Sinon, utiliser la clé normalisée
    return normalizedKey
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .substring(0, 50);
  }
  
  
  /**
   * Détecte la fréquence basée sur l'intervalle moyen en jours
   */
  static detectFrequency(joursEnMoyenne) {
    if (joursEnMoyenne >= 6 && joursEnMoyenne <= 8) {
      return 'weekly';
    }
    if (joursEnMoyenne >= 13 && joursEnMoyenne <= 16) {
      return 'biweekly';
    }
    if (joursEnMoyenne >= 28 && joursEnMoyenne <= 33) {
      return 'monthly';
    }
    if (joursEnMoyenne >= 88 && joursEnMoyenne <= 94) {
      return 'quarterly';
    }
    if (joursEnMoyenne >= 360 && joursEnMoyenne <= 370) {
      return 'yearly';
    }
    
    return 'irregular';
  }
  
  
  /**
   * Trouve le jour le plus fréquent selon la fréquence
   */
  static findMostCommonDay(transactions, frequence) {
    const days = transactions.map(tx => {
      const date = new Date(tx.date);
      
      if (frequence === 'weekly') {
        // Jour de la semaine (1-7, lundi = 1)
        const day = date.getDay();
        return day === 0 ? 7 : day;
      } else if (frequence === 'monthly') {
        // Jour du mois (1-31)
        return date.getDate();
      } else if (frequence === 'yearly') {
        // Jour de l'année (1-365)
        return this.getDayOfYear(date);
      }
      
      return null;
    }).filter(d => d !== null);
    
    return this.findMostCommonValue(days);
  }
  
  
  /**
   * Trouve la valeur la plus fréquente dans un array
   */
  static findMostCommonValue(arr) {
    if (arr.length === 0) return null;
    
    const counts = {};
    arr.forEach(val => {
      counts[val] = (counts[val] || 0) + 1;
    });
    
    let maxCount = 0;
    let mostCommon = arr[0];
    
    Object.entries(counts).forEach(([val, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = parseInt(val);
      }
    });
    
    return mostCommon;
  }
  
  
  // ===============================
  // FONCTIONS MATHÉMATIQUES
  // ===============================
  
  /**
   * Calcule la moyenne
   */
  static mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }
  
  /**
   * Calcule l'écart-type
   */
  static stdDev(arr) {
    if (arr.length === 0) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }
  
  /**
   * Calcule le nombre de jours entre deux dates
   */
  static daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  /**
   * Retourne le jour de l'année (1-365)
   */
  static getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }
}

module.exports = RecurrenceDetector;