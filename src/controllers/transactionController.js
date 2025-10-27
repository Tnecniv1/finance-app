const Transaction = require('../models/Transaction');
const Category = require('../models/Category');

class TransactionController {
  /**
   * Afficher la page principale des transactions
   */
  static async showTransactions(req, res) {
    try {
      const userId = req.session.userId;
      
      // Récupérer les transactions
      const transactions = await Transaction.findByUserId(userId);
      
      // Récupérer les catégories et sous-catégories
      const categories = await Category.getAllOrganized();
      
      // Calculer le solde
      const balance = await Transaction.getBalance(userId);

      res.render('transactions/index', {
        transactions,
        categories,
        balance,
        pseudo: req.session.pseudo,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Erreur:', error);
      res.render('transactions/index', {
        transactions: [],
        categories: { revenus: [], depenses: [] },
        balance: { totalIncome: 0, totalExpenses: 0, balance: 0 },
        pseudo: req.session.pseudo,
        error: 'Erreur lors du chargement des transactions',
        success: null
      });
    }
  }

  /**
   * Créer une nouvelle transaction
   */
  static async createTransaction(req, res) {
    try {
      const userId = req.session.userId;
      const { objet, montant, nature, date, sous_categorie_id } = req.body;

      // Validations
      if (!objet || !montant || !nature || !date) {
        return res.redirect('/transactions?error=Tous les champs sont requis');
      }

      const parsedAmount = parseFloat(montant);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.redirect('/transactions?error=Le montant doit être un nombre positif');
      }

      // Déterminer quelle sous-catégorie utiliser
      const transactionData = {
        user_id: userId,
        objet,
        montant: parsedAmount,
        nature,
        date,
        sous_categorie_revenu_id: nature === 'revenu' ? (sous_categorie_id || null) : null,
        sous_categorie_depense_id: nature === 'depense' ? (sous_categorie_id || null) : null
      };

      // Créer la transaction
      await Transaction.create(transactionData);

      res.redirect('/transactions?success=Transaction ajoutée avec succès');
    } catch (error) {
      console.error('Erreur création transaction:', error);
      res.redirect('/transactions?error=Erreur lors de la création de la transaction');
    }
  }

  /**
   * Supprimer une transaction
   */
  static async deleteTransaction(req, res) {
    try {
      const userId = req.session.userId;
      const { id } = req.params;

      await Transaction.delete(id, userId);

      res.redirect('/transactions?success=Transaction supprimée');
    } catch (error) {
      console.error('Erreur suppression:', error);
      res.redirect('/transactions?error=Erreur lors de la suppression');
    }
  }
}

module.exports = TransactionController;