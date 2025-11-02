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
        // transaction_ids est un array JSONB d'UUIDs
        const transactionIds = detection.transaction_ids;
        
        // Récupérer les transactions correspondantes
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
    const userModifications = req.body; // Nom, montant, fréquence modifiés par l'user
    
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
    
    res.json({
      success: true,
      recurrences
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
    
    res.render('recurrences/validate', {
      user: req.session.user,
      detections: detectionsWithTransactions,
      validated,
      currentPage: 'recurrences'
    });
    
  } catch (error) {
    console.error('Erreur affichage page validation:', error);
    res.status(500).send('Erreur lors du chargement de la page');
  }
};