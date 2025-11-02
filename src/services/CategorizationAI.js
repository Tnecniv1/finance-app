const supabase = require('../../config/supabase');

class CategorizationAI {
  /**
   * Extraire les mots-clés d'une description de transaction
   */
  static extractKeywords(description) {
    if (!description) return [];

    // Nettoyer la description
    const cleaned = description
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ') // Supprimer caractères spéciaux
      .replace(/\s+/g, ' ')
      .trim();

    // Mots à ignorer (stop words)
    const stopWords = new Set([
      'CARTE', 'CB', 'VIR', 'VIREMENT', 'RETRAIT', 'DAB', 'PRLV',
      'SEPA', 'INST', 'DE', 'DU', 'LA', 'LE', 'LES', 'UN', 'UNE',
      'ET', 'OU', 'AVEC', 'POUR', 'PAR', 'SUR'
    ]);

    // Extraire les mots significatifs
    const words = cleaned.split(' ').filter(word => {
      return word.length >= 3 && !stopWords.has(word) && !/^\d+$/.test(word);
    });

    // Retourner les 3 premiers mots les plus longs
    return words
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
  }

  /**
   * Apprendre d'une transaction catégorisée
   */
  static async learnFromTransaction(userId, transaction, sousCategorieId, nature) {
    try {
      const keywords = this.extractKeywords(transaction.objet);
      
      if (keywords.length === 0) return;

      // Pour chaque mot-clé, créer ou mettre à jour le pattern
      for (const keyword of keywords) {
        await this.updatePattern(userId, keyword, sousCategorieId, nature);
      }
    } catch (error) {
      console.error('Erreur apprentissage:', error);
    }
  }

  /**
   * Mettre à jour ou créer un pattern
   */
  static async updatePattern(userId, keyword, sousCategorieId, nature) {
    try {
      // Chercher si le pattern existe déjà
      const { data: existing, error: searchError } = await supabase
        .from('categorization_patterns')
        .select('*')
        .eq('user_id', userId)
        .eq('keyword', keyword)
        .eq('nature', nature)
        .single();

      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }

      if (existing) {
        // Mettre à jour le pattern existant
        const newCount = existing.occurrence_count + 1;
        const newConfidence = Math.min(0.95, 0.50 + (newCount * 0.05)); // Max 95%

        const updates = {
          occurrence_count: newCount,
          confidence_score: newConfidence,
          last_seen_at: new Date().toISOString()
        };

        // Mettre à jour la catégorie si elle change
        if (nature === 'revenu') {
          updates.sous_categorie_revenu_id = sousCategorieId;
        } else {
          updates.sous_categorie_depense_id = sousCategorieId;
        }

        await supabase
          .from('categorization_patterns')
          .update(updates)
          .eq('id', existing.id);
      } else {
        // Créer un nouveau pattern
        const newPattern = {
          user_id: userId,
          keyword: keyword,
          nature: nature,
          confidence_score: 0.50, // Confiance initiale de 50%
          occurrence_count: 1,
          last_seen_at: new Date().toISOString()
        };

        if (nature === 'revenu') {
          newPattern.sous_categorie_revenu_id = sousCategorieId;
        } else {
          newPattern.sous_categorie_depense_id = sousCategorieId;
        }

        await supabase
          .from('categorization_patterns')
          .insert([newPattern]);
      }
    } catch (error) {
      console.error('Erreur mise à jour pattern:', error);
    }
  }

  /**
   * Suggérer une catégorie pour une transaction
   */
  static async suggestCategory(userId, transaction) {
    try {
      const keywords = this.extractKeywords(transaction.objet);
      
      if (keywords.length === 0) return null;

      // Chercher des patterns correspondants
      const { data: patterns, error } = await supabase
        .from('categorization_patterns')
        .select('*')
        .eq('user_id', userId)
        .in('keyword', keywords)
        .order('confidence_score', { ascending: false })
        .order('occurrence_count', { ascending: false })
        .limit(5);

      if (error) throw error;
      if (!patterns || patterns.length === 0) return null;

      // Prendre le pattern avec le meilleur score
      const bestPattern = patterns[0];

      // Seuil de confiance minimum pour suggérer
      if (bestPattern.confidence_score < 0.50) return null;

      return {
        nature: bestPattern.nature,
        sous_categorie_revenu_id: bestPattern.sous_categorie_revenu_id,
        sous_categorie_depense_id: bestPattern.sous_categorie_depense_id,
        confidence_score: bestPattern.confidence_score,
        matched_keyword: bestPattern.keyword,
        suggestion_method: 'pattern_matching'
      };
    } catch (error) {
      console.error('Erreur suggestion:', error);
      return null;
    }
  }

  /**
   * Créer une suggestion pour une transaction
   */
  static async createSuggestion(userId, transactionId, suggestion) {
    try {
      const suggestionData = {
        user_id: userId,
        transaction_id: transactionId,
        suggested_nature: suggestion.nature,
        confidence_score: suggestion.confidence_score,
        matched_keyword: suggestion.matched_keyword,
        suggestion_method: suggestion.suggestion_method,
        status: 'pending'
      };

      if (suggestion.nature === 'revenu') {
        suggestionData.suggested_sous_categorie_revenu_id = suggestion.sous_categorie_revenu_id;
      } else {
        suggestionData.suggested_sous_categorie_depense_id = suggestion.sous_categorie_depense_id;
      }

      const { data, error } = await supabase
        .from('categorization_suggestions')
        .insert([suggestionData])
        .select()
        .single();

      if (error) {
        // Si erreur de doublon, ignorer silencieusement
        if (error.code === '23505') {
          console.log(`⚠️ Suggestion déjà existante pour transaction ${transactionId} - ignorée`);
          return null;
        }
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Erreur création suggestion:', error);
      return null;
    }
  }

  /**
   * Accepter une suggestion
   */
  static async acceptSuggestion(userId, suggestionId) {
    try {
      const { data: suggestion, error: fetchError } = await supabase
        .from('categorization_suggestions')
        .select('*')
        .eq('id', suggestionId)
        .eq('user_id', userId)
        .single();

      if (fetchError) throw fetchError;

      // Mettre à jour le statut
      await supabase
        .from('categorization_suggestions')
        .update({
          status: 'accepted',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', suggestionId);

      return suggestion;
    } catch (error) {
      console.error('Erreur acceptation suggestion:', error);
      return null;
    }
  }

  /**
   * Rejeter une suggestion
   */
  static async rejectSuggestion(userId, suggestionId) {
    try {
      await supabase
        .from('categorization_suggestions')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', suggestionId)
        .eq('user_id', userId);

      return true;
    } catch (error) {
      console.error('Erreur rejet suggestion:', error);
      return false;
    }
  }

  /**
   * Générer des suggestions pour les transactions non catégorisées
   */
  static async generateSuggestionsForUser(userId) {
    try {
      console.log('🚀 Début génération suggestions pour user:', userId);

      // 🆕 ÉTAPE 1 : Supprimer TOUTES les suggestions existantes (pas seulement pending)
      console.log('🧹 Suppression de TOUTES les anciennes suggestions...');
      const { error: deleteError, count: deletedCount } = await supabase
        .from('categorization_suggestions')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('❌ Erreur suppression:', deleteError);
      } else {
        console.log(`✅ ${deletedCount || 0} suggestions supprimées`);
      }

      // Attendre un peu pour laisser la base se synchroniser
      await new Promise(resolve => setTimeout(resolve, 500));

      // ÉTAPE 2 : Récupérer les transactions non catégorisées
      console.log('📊 Récupération des transactions non catégorisées...');
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .is('sous_categorie_revenu_id', null)
        .is('sous_categorie_depense_id', null)
        .order('date', { ascending: false })
        .limit(100);

      if (txError) {
        console.error('❌ Erreur récupération transactions:', txError);
        throw txError;
      }

      console.log(`📦 ${transactions.length} transactions non catégorisées trouvées`);

      let suggestionsCreated = 0;
      let suggestionsSkipped = 0;

      // ÉTAPE 3 : Générer les nouvelles suggestions
      for (const transaction of transactions) {
        try {
          const suggestion = await this.suggestCategory(userId, transaction);
          
          if (suggestion && suggestion.confidence_score >= 0.60) {
            const created = await this.createSuggestion(userId, transaction.id, suggestion);
            if (created) {
              suggestionsCreated++;
            } else {
              suggestionsSkipped++;
            }
          }
        } catch (error) {
          console.error(`❌ Erreur suggestion pour transaction ${transaction.id}:`, error);
        }
      }

      console.log(`✅ Génération terminée: ${suggestionsCreated} créées, ${suggestionsSkipped} ignorées`);

      return { suggestionsCreated };
    } catch (error) {
      console.error('❌ Erreur génération suggestions:', error);
      return { suggestionsCreated: 0 };
    }
  }

  /**
   * Récupérer les suggestions en attente
   */
  static async getPendingSuggestions(userId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('categorization_suggestions')
        .select(`
          *,
          transaction:transactions(id, objet, montant, nature, date),
          suggested_sous_categorie_revenu:sous_categories_revenus(id, nom),
          suggested_sous_categorie_depense:sous_categories_depenses(id, nom)
        `)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('confidence_score', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Erreur récupération suggestions:', error);
      return [];
    }
  }

  /**
   * Statistiques de l'IA
   */
  static async getStats(userId) {
    try {
      const [patternsResult, suggestionsResult] = await Promise.all([
        supabase
          .from('categorization_patterns')
          .select('confidence_score, occurrence_count')
          .eq('user_id', userId),
        supabase
          .from('categorization_suggestions')
          .select('status')
          .eq('user_id', userId)
      ]);

      const patterns = patternsResult.data || [];
      const suggestions = suggestionsResult.data || [];

      const totalPatterns = patterns.length;
      const avgConfidence = patterns.length > 0
        ? patterns.reduce((sum, p) => sum + parseFloat(p.confidence_score), 0) / patterns.length
        : 0;
      
      const totalOccurrences = patterns.reduce((sum, p) => sum + p.occurrence_count, 0);

      const accepted = suggestions.filter(s => s.status === 'accepted').length;
      const rejected = suggestions.filter(s => s.status === 'rejected').length;
      const pending = suggestions.filter(s => s.status === 'pending').length;
      
      const acceptanceRate = (accepted + rejected) > 0
        ? (accepted / (accepted + rejected)) * 100
        : 0;

      return {
        patterns: {
          total: totalPatterns,
          avgConfidence: avgConfidence.toFixed(2),
          totalOccurrences
        },
        suggestions: {
          accepted,
          rejected,
          pending,
          acceptanceRate: acceptanceRate.toFixed(1)
        }
      };
    } catch (error) {
      console.error('Erreur stats IA:', error);
      return null;
    }
  }
}

module.exports = CategorizationAI;