// public/js/recurrence-manager.js

/**
 * Gestionnaire de récurrences côté client
 */
class RecurrenceManager {
  constructor() {
    this.selectedTransactions = new Set();
  }

  /**
   * Initialise les event listeners
   */
  init() {
    // Bouton de détection automatique
    document.getElementById('detectRecurrencesBtn')?.addEventListener('click', () => {
      this.detectRecurrences();
    });

    // Bouton de création manuelle
    document.getElementById('createManualRecurrenceBtn')?.addEventListener('click', () => {
      this.showCreateModal();
    });

    // Sélection de transactions
    document.querySelectorAll('.transaction-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.toggleTransactionSelection(e.target.value, e.target.checked);
      });
    });
  }

  /**
   * Lance la détection automatique
   */
  async detectRecurrences() {
    try {
      const btn = document.getElementById('detectRecurrencesBtn');
      btn.disabled = true;
      btn.textContent = '🔄 Détection en cours...';

      const response = await fetch('/recurrences/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification(
          `✅ ${result.detected} récurrence(s) détectée(s)`,
          'success'
        );
        
        // Recharger la page après 1 seconde
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        this.showNotification(
          `❌ ${result.error || 'Erreur lors de la détection'}`,
          'error'
        );
      }

    } catch (error) {
      console.error('Erreur détection:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    } finally {
      const btn = document.getElementById('detectRecurrencesBtn');
      btn.disabled = false;
      btn.textContent = '🔍 Détecter les récurrences';
    }
  }

  /**
   * Toggle la sélection d'une transaction
   */
  toggleTransactionSelection(transactionId, isSelected) {
    if (isSelected) {
      this.selectedTransactions.add(transactionId);
    } else {
      this.selectedTransactions.delete(transactionId);
    }

    // Mettre à jour le compteur
    this.updateSelectionCounter();
  }

  /**
   * Met à jour le compteur de transactions sélectionnées
   */
  updateSelectionCounter() {
    const counter = document.getElementById('selectedCount');
    if (counter) {
      counter.textContent = this.selectedTransactions.size;
    }

    // Activer/désactiver le bouton de création
    const createBtn = document.getElementById('createRecurrenceFromSelectionBtn');
    if (createBtn) {
      createBtn.disabled = this.selectedTransactions.size < 2;
    }
  }

  /**
   * Affiche le modal de création de récurrence
   */
  showCreateModal() {
    if (this.selectedTransactions.size < 2) {
      this.showNotification(
        '⚠️ Sélectionnez au moins 2 transactions',
        'warning'
      );
      return;
    }

    const modal = document.getElementById('createRecurrenceModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  /**
   * Ferme le modal
   */
  closeCreateModal() {
    const modal = document.getElementById('createRecurrenceModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Crée une récurrence depuis les transactions sélectionnées
   */
  async createRecurrenceFromSelection() {
    const form = document.getElementById('createRecurrenceForm');
    const formData = new FormData(form);

    const data = {
      transaction_ids: Array.from(this.selectedTransactions),
      custom_data: {
        pattern_description: formData.get('pattern_description'),
        frequency: formData.get('frequency'),
        amount: parseFloat(formData.get('amount') || 0)
      }
    };

    try {
      const response = await fetch('/recurrences/create-from-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('✅ Récurrence créée avec succès', 'success');
        this.closeCreateModal();
        
        // Réinitialiser la sélection
        this.selectedTransactions.clear();
        document.querySelectorAll('.transaction-checkbox').forEach(cb => {
          cb.checked = false;
        });
        
        // Recharger après 1 seconde
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        this.showNotification(
          `❌ ${result.error || 'Erreur lors de la création'}`,
          'error'
        );
      }

    } catch (error) {
      console.error('Erreur création:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    }
  }

  /**
   * Ajoute une transaction à une récurrence
   */
  async addTransactionToRecurrence(recurringId, transactionId) {
    if (!confirm('Ajouter cette transaction à la récurrence ?')) {
      return;
    }

    try {
      const response = await fetch(`/recurrences/${recurringId}/add-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transaction_id: transactionId })
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('✅ Transaction ajoutée', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.showNotification(
          `❌ ${result.error || 'Erreur'}`,
          'error'
        );
      }

    } catch (error) {
      console.error('Erreur ajout:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    }
  }

  /**
   * Retire une transaction d'une récurrence
   */
  async removeTransactionFromRecurrence(recurringId, transactionId) {
    if (!confirm('Retirer cette transaction de la récurrence ?')) {
      return;
    }

    try {
      const response = await fetch(
        `/recurrences/${recurringId}/transactions/${transactionId}`,
        {
          method: 'DELETE'
        }
      );

      const result = await response.json();

      if (result.success) {
        this.showNotification('✅ Transaction retirée', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.showNotification(
          `❌ ${result.error || 'Erreur'}`,
          'error'
        );
      }

    } catch (error) {
      console.error('Erreur retrait:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    }
  }

  /**
   * Charge les suggestions de transactions pour une récurrence
   */
  async loadSuggestions(recurringId) {
    try {
      const response = await fetch(
        `/recurrences/${recurringId}/suggested-transactions`
      );

      const result = await response.json();

      if (result.success) {
        this.displaySuggestions(recurringId, result.suggestions);
      }

    } catch (error) {
      console.error('Erreur chargement suggestions:', error);
    }
  }

  /**
   * Affiche les suggestions dans un modal
   */
  displaySuggestions(recurringId, suggestions) {
    const modal = document.getElementById('suggestionsModal');
    const container = document.getElementById('suggestionsContainer');

    if (!modal || !container) return;

    container.innerHTML = '';

    if (suggestions.length === 0) {
      container.innerHTML = '<p>Aucune suggestion disponible</p>';
    } else {
      suggestions.forEach(transaction => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
          <div class="suggestion-info">
            <span class="date">${new Date(transaction.date).toLocaleDateString('fr-FR')}</span>
            <span class="description">${transaction.objet}</span>
            <span class="amount">${parseFloat(transaction.montant).toFixed(2)} €</span>
          </div>
          <button 
            class="btn-add-suggestion"
            onclick="recurrenceManager.addTransactionToRecurrence('${recurringId}', '${transaction.id}')"
          >
            ➕ Ajouter
          </button>
        `;
        container.appendChild(div);
      });
    }

    modal.style.display = 'flex';
  }

  /**
   * Ferme le modal des suggestions
   */
  closeSuggestionsModal() {
    const modal = document.getElementById('suggestionsModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Valide une détection
   */
  async validateDetection(detectionId) {
    try {
      const response = await fetch(`/recurrences/validate/${detectionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('✅ Récurrence validée', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.showNotification('❌ Erreur lors de la validation', 'error');
      }

    } catch (error) {
      console.error('Erreur validation:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    }
  }

  /**
   * Rejette une détection
   */
  async rejectDetection(detectionId) {
    if (!confirm('Rejeter cette détection ?')) {
      return;
    }

    try {
      const response = await fetch(`/recurrences/reject/${detectionId}`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('✅ Détection rejetée', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.showNotification('❌ Erreur', 'error');
      }

    } catch (error) {
      console.error('Erreur rejet:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    }
  }

  /**
   * Désactive une récurrence
   */
  async deleteRecurrence(recurringId) {
    if (!confirm('Désactiver cette récurrence ?')) {
      return;
    }

    try {
      const response = await fetch(`/recurrences/${recurringId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('✅ Récurrence désactivée', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        this.showNotification('❌ Erreur', 'error');
      }

    } catch (error) {
      console.error('Erreur suppression:', error);
      this.showNotification('❌ Erreur de connexion', 'error');
    }
  }

  /**
   * Affiche une notification
   */
  showNotification(message, type = 'info') {
    // Créer la notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Ajouter au DOM
    document.body.appendChild(notification);

    // Animer l'apparition
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    // Retirer après 3 secondes
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Sélectionne toutes les transactions
   */
  selectAll() {
    document.querySelectorAll('.transaction-checkbox').forEach(checkbox => {
      checkbox.checked = true;
      this.selectedTransactions.add(checkbox.value);
    });
    this.updateSelectionCounter();
  }

  /**
   * Désélectionne toutes les transactions
   */
  deselectAll() {
    document.querySelectorAll('.transaction-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    this.selectedTransactions.clear();
    this.updateSelectionCounter();
  }
}

// Initialiser le gestionnaire au chargement de la page
let recurrenceManager;
document.addEventListener('DOMContentLoaded', () => {
  recurrenceManager = new RecurrenceManager();
  recurrenceManager.init();
});