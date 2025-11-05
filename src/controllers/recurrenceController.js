// src/controllers/recurrenceController.js
const RecurrenceDetector = require('../services/recurrenceDetector');
const RecurringTransaction = require('../models/RecurringTransaction');
const Transaction = require('../models/Transaction');

/**
 * Lance la détection automatique des récurrences
 */
exports.detectRecurrences = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    console.log(`🔍 Lancement de la détection pour user ${userId}`);
    
    const result = await RecurrenceDetector.detectRecurrences(userId);
    
    res.json(result);
    
  } catch (error) {
    console.error('Erreur détection récurrences:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la détection des récurrences'
    });
  }
};


/**
 * Récupère toutes les détections en attente de validation
 */
exports.getPendingDetections = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const detections = await RecurringTransaction.findDetectionsPending(userId);
    
    // Pour chaque détection, récupérer le détail des transactions
    const detectionsWithTransactions = await Promise.all(
      detections.map(async (detection) => {
        const transactionIds = detection.transaction_ids;
        const transactions = await Transaction.findByIds(transactionIds);
        
        return {
          ...detection,
          transactions: transactions || []
        };
      })
    );
    
    res.json({
      success: true,
      detections: detectionsWithTransactions
    });
    
  } catch (error) {
    console.error('Erreur récupération détections:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des détections'
    });
  }
};


/**
 * Valide une détection (la transforme en récurrence active)
 */
exports.validateDetection = async (req, res) => {
  try {
    const { detectionId } = req.params;
    const userModifications = req.body;
    
    const recurring = await RecurringTransaction.validateDetection(
      parseInt(detectionId),
      userModifications
    );
    
    res.json({
      success: true,
      message: 'Récurrence validée avec succès',
      recurring
    });
    
  } catch (error) {
    console.error('Erreur validation détection:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la validation'
    });
  }
};


/**
 * Rejette une détection (ne sera pas utilisée)
 */
exports.rejectDetection = async (req, res) => {
  try {
    const { detectionId } = req.params;
    
    await RecurringTransaction.rejectDetection(parseInt(detectionId));
    
    res.json({
      success: true,
      message: 'Détection rejetée'
    });
    
  } catch (error) {
    console.error('Erreur rejet détection:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du rejet'
    });
  }
};


/**
 * Récupère toutes les récurrences validées de l'utilisateur
 */
exports.getRecurrences = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const recurrences = await RecurringTransaction.findByUserId(userId);
    
    // Pour chaque récurrence, récupérer les transactions associées
    const recurrencesWithTransactions = await Promise.all(
      recurrences.map(async (recurrence) => {
        const transactionIds = recurrence.transaction_ids || [];
        const transactions = await Transaction.findByIds(transactionIds);
        
        return {
          ...recurrence,
          transactions: transactions || []
        };
      })
    );
    
    res.json({
      success: true,
      recurrences: recurrencesWithTransactions
    });
    
  } catch (error) {
    console.error('Erreur récupération récurrences:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des récurrences'
    });
  }
};


/**
 * Crée une nouvelle récurrence manuellement
 */
exports.createRecurrence = async (req, res) => {
  try {
    const userId = req.session.userId;
    const recurringData = {
      ...req.body,
      user_id: userId,
      active: true
    };
    
    const recurring = await RecurringTransaction.create(recurringData);
    
    res.json({
      success: true,
      message: 'Récurrence créée avec succès',
      recurring
    });
    
  } catch (error) {
    console.error('Erreur création récurrence:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création'
    });
  }
};


/**
 * NOUVEAU : Crée une récurrence à partir d'une sélection de transactions
 */
exports.createRecurrenceFromTransactions = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { transaction_ids, custom_data } = req.body;
    
    if (!transaction_ids || transaction_ids.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Au moins 2 transactions sont requises'
      });
    }
    
    const result = await RecurrenceDetector.createManualRecurrence(
      userId,
      transaction_ids,
      custom_data || {}
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Erreur création récurrence depuis transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de la création'
    });
  }
};


/**
 * Met à jour une récurrence
 */
exports.updateRecurrence = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const recurring = await RecurringTransaction.update(parseInt(id), updates);
    
    res.json({
      success: true,
      message: 'Récurrence mise à jour',
      recurring
    });
    
  } catch (error) {
    console.error('Erreur mise à jour récurrence:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour'
    });
  }
};


/**
 * Désactive une récurrence
 */
exports.deleteRecurrence = async (req, res) => {
  try {
    const { id } = req.params;
    
    await RecurringTransaction.deactivate(parseInt(id));
    
    res.json({
      success: true,
      message: 'Récurrence désactivée'
    });
    
  } catch (error) {
    console.error('Erreur suppression récurrence:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression'
    });
  }
};


/**
 * NOUVEAU : Ajoute une transaction à une récurrence existante
 */
exports.addTransactionToRecurrence = async (req, res) => {
  try {
    const { recurringId } = req.params;
    const { transaction_id } = req.body;
    
    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        error: 'ID de transaction requis'
      });
    }
    
    const result = await RecurrenceDetector.addTransactionToRecurrence(
      parseInt(recurringId),
      transaction_id
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Erreur ajout transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors de l\'ajout'
    });
  }
};


/**
 * NOUVEAU : Retire une transaction d'une récurrence
 */
exports.removeTransactionFromRecurrence = async (req, res) => {
  try {
    const { recurringId, transactionId } = req.params;
    
    const result = await RecurrenceDetector.removeTransactionFromRecurrence(
      parseInt(recurringId),
      transactionId
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Erreur retrait transaction:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erreur lors du retrait'
    });
  }
};


/**
 * NOUVEAU : Récupère les transactions candidates pour une récurrence
 * (transactions similaires non encore associées)
 */
exports.getSuggestedTransactions = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { recurringId } = req.params;
    
    // Récupérer la récurrence
    const recurring = await RecurringTransaction.findById(parseInt(recurringId));
    
    if (!recurring || recurring.user_id !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Récurrence non trouvée'
      });
    }
    
    // Récupérer toutes les transactions de l'utilisateur
    const allTransactions = await Transaction.findByUserId(userId);
    
    // Filtrer pour trouver les transactions similaires non encore associées
    const existingIds = recurring.transaction_ids || [];
    const isRevenue = recurring.is_revenue;
    const targetAmount = parseFloat(recurring.amount);
    
    const suggestions = allTransactions.filter(t => {
      // Ne pas inclure les transactions déjà associées
      if (existingIds.includes(t.id)) {
        return false;
      }
      
      // Vérifier le type (revenu/dépense)
      const tIsRevenue = parseFloat(t.montant) > 0;
      if (tIsRevenue !== isRevenue) {
        return false;
      }
      
      // Vérifier le montant (tolérance de ±10%)
      const tAmount = Math.abs(parseFloat(t.montant));
      const diff = Math.abs(tAmount - targetAmount);
      const tolerance = targetAmount * 0.1;
      
      return diff <= tolerance;
    });
    
    // Trier par date décroissante
    suggestions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({
      success: true,
      suggestions: suggestions.slice(0, 20) // Limiter à 20 suggestions
    });
    
  } catch (error) {
    console.error('Erreur récupération suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des suggestions'
    });
  }
};


/**
 * Page de validation des récurrences (rendu HTML)
 */
exports.showValidationPage = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Récupérer les détections en attente
    const detections = await RecurringTransaction.findDetectionsPending(userId);
    
    // Récupérer les récurrences déjà validées
    const validated = await RecurringTransaction.findByUserId(userId);
    
    // Pour chaque détection, récupérer les transactions
    const detectionsWithTransactions = await Promise.all(
      detections.map(async (detection) => {
        const transactionIds = detection.transaction_ids;
        const transactions = await Transaction.findByIds(transactionIds);
        
        return {
          ...detection,
          transactions: transactions || []
        };
      })
    );
    
    // Pour chaque récurrence validée, récupérer les transactions
    const validatedWithTransactions = await Promise.all(
      validated.map(async (recurrence) => {
        const transactionIds = recurrence.transaction_ids || [];
        const transactions = await Transaction.findByIds(transactionIds);
        
        return {
          ...recurrence,
          transactions: transactions || []
        };
      })
    );
    
    res.render('recurrences/validate', {
      user: req.session.user,
      detections: detectionsWithTransactions,
      validated: validatedWithTransactions,
      currentPage: 'recurrences'
    });
    
  } catch (error) {
    console.error('Erreur affichage page validation:', error);
    res.status(500).send('Erreur lors du chargement de la page');
  }
};


/**
 * NOUVEAU : Page de gestion manuelle des récurrences
 */
exports.showManagePage = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Récupérer toutes les récurrences
    const recurrences = await RecurringTransaction.findByUserId(userId);
    
    // Récupérer toutes les transactions
    const allTransactions = await Transaction.findByUserId(userId);
    
    // Pour chaque récurrence, récupérer les transactions associées
    const recurrencesWithTransactions = await Promise.all(
      recurrences.map(async (recurrence) => {
        const transactionIds = recurrence.transaction_ids || [];
        const transactions = await Transaction.findByIds(transactionIds);
        
        return {
          ...recurrence,
          transactions: transactions || []
        };
      })
    );
    
    res.render('recurrences/manage', {
      user: req.session.user,
      recurrences: recurrencesWithTransactions,
      allTransactions,
      currentPage: 'recurrences'
    });
    
  } catch (error) {
    console.error('Erreur affichage page gestion:', error);
    res.status(500).send('Erreur lors du chargement de la page');
  }
};