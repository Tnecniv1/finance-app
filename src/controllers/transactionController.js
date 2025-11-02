const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const CategorizationAI = require('../services/CategorizationAI');

class TransactionController {
  /**
   * Afficher la page des transactions avec filtres et suggestions IA
   */
  static async index(req, res) {
    try {
      const userId = req.session.userId;
      const pseudo = req.session.pseudo;

      // Récupérer les paramètres de filtrage
      const {
        type,
        categorie,
        sous_categorie,
        date_debut,
        date_fin,
        recherche,
        categorized
      } = req.query;

      // Construire les filtres
      const filters = {
        userId: userId,
        nature: type || null,
        categorieId: categorie || null,
        sousCategorieId: sous_categorie || null,
        dateDebut: date_debut || null,
        dateFin: date_fin || null,
        recherche: recherche || null,
        categorized: categorized || null
      };

      // Récupérer les transactions filtrées
      const transactions = await Transaction.findWithFilters(filters);

      // Récupérer les catégories pour les filtres
      const categories = await Category.getAllWithSubcategories();

      // Calculer le solde
      const balance = await Transaction.getBalance(userId);

      // Récupérer les suggestions IA en attente
      const suggestions = await CategorizationAI.getPendingSuggestions(userId, 5);

      // Récupérer les stats de l'IA
      const aiStats = await CategorizationAI.getStats(userId);

      // Messages
      const error = req.query.error || null;
      const success = req.query.success || null;

      // Calculer les stats pour le header
      const stats = {
        profit: balance.balance || 0,
        revenus: balance.totalIncome || 0,
        charges: balance.totalExpenses || 0
      };

      res.render('transactions/index', {
        transactions,
        categories,
        balance,
        suggestions,
        aiStats,
        pseudo,
        user: req.session.user || { prenom: req.session.pseudo },
        currentView: 'liste',
        stats: stats,
        error,
        success,
        filters: {
          type: type || '',
          categorie: categorie || '',
          sous_categorie: sous_categorie || '',
          date_debut: date_debut || '',
          date_fin: date_fin || '',
          recherche: recherche || '',
          categorized: categorized || ''
        }
      });
    } catch (error) {
      console.error('Erreur chargement transactions:', error);
      res.redirect('/?error=Erreur lors du chargement des transactions');
    }
  }

  /**
   * Supprimer une transaction
   */
  static async delete(req, res) {
    try {
      const userId = req.session.userId;
      const transactionId = req.params.id;

      await Transaction.delete(transactionId, userId);

      res.redirect('/transactions?success=Transaction supprimée');
    } catch (error) {
      console.error('Erreur suppression transaction:', error);
      res.redirect('/transactions?error=Erreur lors de la suppression');
    }
  }

  /**
   * Catégoriser une transaction (avec apprentissage IA)
   */
  static async categorize(req, res) {
    try {
      const userId = req.session.userId;
      const transactionId = req.params.id;
      const { sous_categorie_id, nature } = req.body;

      // Récupérer la transaction AVANT mise à jour
      const transaction = await Transaction.findById(transactionId, userId);
      if (!transaction) {
        return res.redirect('/transactions?error=Transaction introuvable');
      }

      console.log('📝 Transaction récupérée:', {
        id: transaction.id,
        objet: transaction.objet,
        montant: transaction.montant
      });

      // Mettre à jour la catégorie
      await Transaction.updateCategory(
        transactionId,
        userId,
        nature,
        sous_categorie_id
      );

      // Créer un objet transaction enrichi AVEC la nouvelle catégorie
      const enrichedTransaction = {
        ...transaction,
        nature: nature,
        sous_categorie_revenu_id: nature === 'revenu' ? sous_categorie_id : null,
        sous_categorie_depense_id: nature === 'depense' ? sous_categorie_id : null
      };

      console.log('🤖 Apprentissage IA avec:', {
        objet: enrichedTransaction.objet,
        nature: nature,
        sous_categorie_id: sous_categorie_id
      });

      // APPRENTISSAGE IA : Apprendre de cette catégorisation
      await CategorizationAI.learnFromTransaction(
        userId,
        enrichedTransaction,
        sous_categorie_id,
        nature
      );

      res.redirect('/transactions?success=Transaction catégorisée');
    } catch (error) {
      console.error('Erreur catégorisation:', error);
      res.redirect('/transactions?error=Erreur lors de la catégorisation');
    }
  }

  /**
   * Catégoriser plusieurs transactions en masse (avec apprentissage IA)
   */
  static async categorizeBulk(req, res) {
    try {
      const userId = req.session.userId;
      const { transaction_ids, sous_categorie_id, nature } = req.body;

      if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
        return res.redirect('/transactions?error=Aucune transaction sélectionnée');
      }

      if (!sous_categorie_id) {
        return res.redirect('/transactions?error=Veuillez sélectionner une catégorie');
      }

      // Catégoriser chaque transaction
      let success = 0;
      for (const transactionId of transaction_ids) {
        try {
          // Récupérer la transaction AVANT mise à jour
          const transaction = await Transaction.findById(transactionId, userId);
          if (!transaction) continue;

          // Mettre à jour la catégorie
          await Transaction.updateCategory(
            transactionId,
            userId,
            nature,
            sous_categorie_id
          );

          // Créer un objet enrichi avec la nouvelle catégorie
          const enrichedTransaction = {
            ...transaction,
            nature: nature,
            sous_categorie_revenu_id: nature === 'revenu' ? sous_categorie_id : null,
            sous_categorie_depense_id: nature === 'depense' ? sous_categorie_id : null
          };

          // APPRENTISSAGE IA
          await CategorizationAI.learnFromTransaction(
            userId,
            enrichedTransaction,
            sous_categorie_id,
            nature
          );

          success++;
        } catch (error) {
          console.error(`Erreur catégorisation transaction ${transactionId}:`, error);
        }
      }

      res.redirect(`/transactions?success=${success} transaction(s) catégorisée(s)`);
    } catch (error) {
      console.error('Erreur catégorisation en masse:', error);
      res.redirect('/transactions?error=Erreur lors de la catégorisation');
    }
  }

  /**
   * Générer des suggestions IA pour l'utilisateur
   */
  static async generateSuggestions(req, res) {
    try {
      const userId = req.session.userId;

      const result = await CategorizationAI.generateSuggestionsForUser(userId);

      res.redirect(`/transactions?success=${result.suggestionsCreated} suggestion(s) générée(s)`);
    } catch (error) {
      console.error('Erreur génération suggestions:', error);
      res.redirect('/transactions?error=Erreur lors de la génération');
    }
  }

  /**
   * Accepter une suggestion IA
   */
  static async acceptSuggestion(req, res) {
    try {
      const userId = req.session.userId;
      const suggestionId = req.params.id;

      // Accepter la suggestion
      const suggestion = await CategorizationAI.acceptSuggestion(userId, suggestionId);

      if (!suggestion) {
        return res.redirect('/transactions?error=Suggestion introuvable');
      }

      // Appliquer la catégorisation à la transaction
      await Transaction.updateCategory(
        suggestion.transaction_id,
        userId,
        suggestion.suggested_nature,
        suggestion.suggested_nature === 'revenu' 
          ? suggestion.suggested_sous_categorie_revenu_id 
          : suggestion.suggested_sous_categorie_depense_id
      );

      // Récupérer la transaction AVANT d'enrichir
      const transaction = await Transaction.findById(suggestion.transaction_id, userId);
      
      // Créer un objet enrichi
      const enrichedTransaction = {
        ...transaction,
        nature: suggestion.suggested_nature,
        sous_categorie_revenu_id: suggestion.suggested_nature === 'revenu' 
          ? suggestion.suggested_sous_categorie_revenu_id : null,
        sous_categorie_depense_id: suggestion.suggested_nature === 'depense' 
          ? suggestion.suggested_sous_categorie_depense_id : null
      };

      // Renforcer l'apprentissage (double la confiance)
      await CategorizationAI.learnFromTransaction(
        userId,
        enrichedTransaction,
        suggestion.suggested_nature === 'revenu' 
          ? suggestion.suggested_sous_categorie_revenu_id 
          : suggestion.suggested_sous_categorie_depense_id,
        suggestion.suggested_nature
      );

      res.redirect('/transactions?success=Suggestion appliquée');
    } catch (error) {
      console.error('Erreur acceptation suggestion:', error);
      res.redirect('/transactions?error=Erreur lors de l\'application');
    }
  }

  /**
   * Rejeter une suggestion IA
   */
  static async rejectSuggestion(req, res) {
    try {
      const userId = req.session.userId;
      const suggestionId = req.params.id;

      await CategorizationAI.rejectSuggestion(userId, suggestionId);

      res.redirect('/transactions?success=Suggestion rejetée');
    } catch (error) {
      console.error('Erreur rejet suggestion:', error);
      res.redirect('/transactions?error=Erreur lors du rejet');
    }
  }

  /**
   * Afficher les statistiques de l'IA
   */
  static async aiStats(req, res) {
    try {
      const userId = req.session.userId;
      const pseudo = req.session.pseudo;

      const stats = await CategorizationAI.getStats(userId);
      const suggestions = await CategorizationAI.getPendingSuggestions(userId, 50);

      res.render('transactions/ai-stats', {
        pseudo,
        stats,
        suggestions
      });
    } catch (error) {
      console.error('Erreur stats IA:', error);
      res.redirect('/transactions?error=Erreur lors du chargement des stats');
    }
  }

  /**
   * Afficher la vue graphique des transactions
   */
  static async graphView(req, res) {
    try {
      const userId = req.session.userId;
      const pseudo = req.session.pseudo;

      // Récupérer les paramètres de filtrage
      const {
        type,
        categorie,
        date_debut,
        date_fin
      } = req.query;

      // Construire les filtres
      const filters = {
        userId: userId,
        nature: type || null,
        categorieId: categorie || null,
        dateDebut: date_debut || null,
        dateFin: date_fin || null
      };

      // Récupérer les transactions filtrées
      const transactions = await Transaction.findWithFilters(filters);

      // Récupérer les catégories pour les filtres
      const categoriesData = await Category.getAllWithSubcategories();
      
      const categoriesRevenus = categoriesData.revenus || [];
      const categoriesDepenses = categoriesData.depenses || [];

      // Calculer les totaux
      let totalRevenus = 0;
      let totalDepenses = 0;

      transactions.forEach(t => {
        const montant = parseFloat(t.montant);
        if (t.nature === 'revenu') {
          totalRevenus += montant;
        } else {
          totalDepenses += Math.abs(montant);
        }
      });

      const solde = totalRevenus - totalDepenses;

      // Créer les stats pour le header
      const stats = {
        profit: solde,
        revenus: totalRevenus,
        charges: totalDepenses
      };

      res.render('transactions/graph', {
        transactions,
        categoriesRevenus,
        categoriesDepenses,
        totalRevenus,
        totalDepenses,
        solde,
        pseudo,
        user: req.session.user || { prenom: req.session.pseudo },
        currentView: 'evolution',
        stats: stats,
        filters: {
          type: type || '',
          categorie: categorie || '',
          date_debut: date_debut || '',
          date_fin: date_fin || '',
          sort: 'date_desc'
        }
      });
    } catch (error) {
      console.error('Erreur chargement graphique:', error);
      res.redirect('/transactions?error=Erreur lors du chargement du graphique');
    }
  }

  /**
   * Afficher la vue camembert des transactions
   */
  static async pieView(req, res) {
    try {
      const userId = req.session.userId;
      const pseudo = req.session.pseudo;

      // Récupérer toutes les transactions
      const filters = {
        userId: userId,
        nature: null,
        categorieId: null,
        dateDebut: null,
        dateFin: null
      };

      const transactions = await Transaction.findWithFilters(filters);

      // Récupérer les catégories
      const categoriesData = await Category.getAllWithSubcategories();
      
      const categoriesRevenus = categoriesData.revenus || [];
      const categoriesDepenses = categoriesData.depenses || [];

      // Calculer les totaux pour les stats
      let totalRevenus = 0;
      let totalDepenses = 0;

      transactions.forEach(t => {
        const montant = parseFloat(t.montant);
        if (t.nature === 'revenu') {
          totalRevenus += montant;
        } else {
          totalDepenses += Math.abs(montant);
        }
      });

      const solde = totalRevenus - totalDepenses;

      // Créer les stats pour le header
      const stats = {
        profit: solde,
        revenus: totalRevenus,
        charges: totalDepenses
      };

      res.render('transactions/pie', {
        transactions,
        categoriesRevenus,
        categoriesDepenses,
        pseudo,
        user: req.session.user || { prenom: req.session.pseudo },
        currentView: 'analyse',
        stats: stats
      });
    } catch (error) {
      console.error('Erreur chargement camemberts:', error);
      res.redirect('/transactions?error=Erreur lors du chargement des camemberts');
    }
  }
}

module.exports = TransactionController;