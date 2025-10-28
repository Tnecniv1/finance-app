const Transaction = require('../models/Transaction');
const Category = require('../models/Category');

class TransactionController {
  /**
   * Afficher la page des transactions avec filtres
   */
  static async index(req, res) {
    try {
      const userId = req.session.userId;
      const pseudo = req.session.pseudo;

      // Récupérer les paramètres de filtrage
      const {
        type,           // 'revenu', 'depense', ou vide (tous)
        categorie,      // ID de la catégorie
        sous_categorie, // ID de la sous-catégorie
        date_debut,     // Format YYYY-MM-DD
        date_fin,       // Format YYYY-MM-DD
        recherche       // Texte libre dans la description
      } = req.query;

      // Construire les filtres
      const filters = {
        userId: userId,
        nature: type || null,
        categorieId: categorie || null,
        sousCategorieId: sous_categorie || null,
        dateDebut: date_debut || null,
        dateFin: date_fin || null,
        recherche: recherche || null
      };

      // Récupérer les transactions filtrées
      const transactions = await Transaction.findWithFilters(filters);

      // Récupérer les catégories pour les filtres
      const categories = await Category.getAllWithSubcategories();

      // Calculer le solde
      const balance = await Transaction.getBalance(userId);

      // Messages
      const error = req.query.error || null;
      const success = req.query.success || null;

      res.render('transactions/index', {
        transactions,
        categories,
        balance,
        pseudo,
        error,
        success,
        filters: {
          type: type || '',
          categorie: categorie || '',
          sous_categorie: sous_categorie || '',
          date_debut: date_debut || '',
          date_fin: date_fin || '',
          recherche: recherche || ''
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
   * Catégoriser une transaction
   */
  static async categorize(req, res) {
    try {
      const userId = req.session.userId;
      const transactionId = req.params.id;
      const { sous_categorie_id, nature } = req.body;

      // Vérifier que la transaction appartient à l'utilisateur
      const transaction = await Transaction.findById(transactionId, userId);
      if (!transaction) {
        return res.redirect('/transactions?error=Transaction introuvable');
      }

      // Mettre à jour la catégorie
      await Transaction.updateCategory(
        transactionId,
        userId,
        nature,
        sous_categorie_id
      );

      res.redirect('/transactions?success=Transaction catégorisée');
    } catch (error) {
      console.error('Erreur catégorisation:', error);
      res.redirect('/transactions?error=Erreur lors de la catégorisation');
    }
  }

  /**
   * Catégoriser plusieurs transactions en masse
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
          await Transaction.updateCategory(
            transactionId,
            userId,
            nature,
            sous_categorie_id
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
}

module.exports = TransactionController;