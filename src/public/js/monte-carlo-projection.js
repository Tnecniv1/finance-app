// public/js/monte-carlo-projection.js
// Script pour gérer la projection Monte Carlo sur la page Évolution

let projectionChart = null;
let isProjectionMode = false;
let originalChartData = null;

/**
 * Initialiser le bouton Projection
 */
function initProjectionButton() {
  const typeButtons = document.querySelector('#type-buttons'); // Ajustez le sélecteur selon votre HTML
  
  if (!typeButtons) {
    console.error('Container des boutons Type non trouvé');
    return;
  }

  // Créer le bouton Projection
  const projectionButton = document.createElement('button');
  projectionButton.className = 'btn-filter btn-projection';
  projectionButton.innerHTML = '🔮 Projection';
  projectionButton.style.marginLeft = '20px';
  
  // Ajouter le bouton après les boutons Type
  typeButtons.appendChild(projectionButton);

  // Event listener
  projectionButton.addEventListener('click', toggleProjection);
}

/**
 * Basculer entre vue normale et projection
 */
async function toggleProjection() {
  const btn = document.querySelector('.btn-projection');
  
  if (isProjectionMode) {
    // Retour à la vue normale
    restoreOriginalChart();
    btn.classList.remove('active');
    btn.innerHTML = '🔮 Projection';
    isProjectionMode = false;
  } else {
    // Activer la projection
    btn.innerHTML = '⏳ Chargement...';
    btn.disabled = true;
    
    try {
      await loadProjection();
      btn.classList.add('active');
      btn.innerHTML = '📊 Vue normale';
      isProjectionMode = true;
    } catch (error) {
      alert('Erreur : ' + error.message);
      btn.innerHTML = '🔮 Projection';
    } finally {
      btn.disabled = false;
    }
  }
}

/**
 * Charger et afficher la projection Monte Carlo
 */
async function loadProjection() {
  try {
    const response = await fetch('/api/monte-carlo/projection?weeks=12&numSimulations=1000');
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la projection');
    }

    const data = await response.json();
    
    // Sauvegarder l'état actuel du graphique
    saveOriginalChart();
    
    // Afficher la projection
    displayProjection(data);
    
    // Afficher les métriques
    displayMetrics(data.metrics, data.alert);
    
  } catch (error) {
    console.error('Erreur loadProjection:', error);
    throw error;
  }
}

/**
 * Sauvegarder l'état actuel du graphique
 */
function saveOriginalChart() {
  if (projectionChart) {
    originalChartData = {
      data: JSON.parse(JSON.stringify(projectionChart.data)),
      options: JSON.parse(JSON.stringify(projectionChart.options))
    };
  }
}

/**
 * Restaurer le graphique original
 */
function restoreOriginalChart() {
  if (projectionChart && originalChartData) {
    projectionChart.data = originalChartData.data;
    projectionChart.options = originalChartData.options;
    projectionChart.update();
  }
  
  // Masquer les métriques de projection
  const metricsContainer = document.getElementById('projection-metrics');
  if (metricsContainer) {
    metricsContainer.remove();
  }
}

/**
 * Afficher la projection sur le graphique
 */
function displayProjection(data) {
  // Récupérer le graphique existant (Chart.js)
  const canvas = document.querySelector('canvas'); // Ajustez le sélecteur selon votre HTML
  
  if (!canvas) {
    throw new Error('Canvas du graphique non trouvé');
  }

  // Si le graphique existe déjà, le détruire
  if (projectionChart) {
    projectionChart.destroy();
  }

  // Créer le nouveau graphique avec la projection
  const ctx = canvas.getContext('2d');
  projectionChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.projection.labels,
      datasets: data.projection.datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: true,
          text: '🔮 Projection Monte Carlo - 12 semaines',
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + parseFloat(context.parsed.y).toFixed(2) + ' €';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return value.toFixed(0) + ' €';
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/**
 * Afficher les métriques de projection
 */
function displayMetrics(metrics, alert) {
  // Créer un container pour les métriques si inexistant
  let metricsContainer = document.getElementById('projection-metrics');
  
  if (!metricsContainer) {
    metricsContainer = document.createElement('div');
    metricsContainer.id = 'projection-metrics';
    metricsContainer.className = 'projection-metrics';
    
    // Insérer après les stats principales
    const statsContainer = document.querySelector('.stats-container'); // Ajustez le sélecteur
    if (statsContainer) {
      statsContainer.after(metricsContainer);
    }
  }

  // Déterminer la classe CSS selon le niveau d'alerte
  const alertClass = alert.level === 'danger' ? 'alert-danger' 
                    : (alert.level === 'warning' ? 'alert-warning' : 'alert-success');

  metricsContainer.innerHTML = `
    <div class="alert ${alertClass}" style="margin-bottom: 20px; padding: 15px; border-radius: 8px;">
      ${alert.message}
    </div>
    
    <div class="metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
      <div class="metric-card">
        <h4>Solde actuel</h4>
        <div class="value">${metrics.soldeActuel} €</div>
      </div>
      
      <div class="metric-card">
        <h4>Solde médian (S12)</h4>
        <div class="value">${metrics.soldeMedianFinal} €</div>
      </div>
      
      <div class="metric-card">
        <h4>Pire scénario (S12)</h4>
        <div class="value">${metrics.soldePireFinal} €</div>
      </div>
      
      <div class="metric-card">
        <h4>Meilleur scénario (S12)</h4>
        <div class="value">${metrics.soldeMeilleurFinal} €</div>
      </div>
      
      <div class="metric-card">
        <h4>Risque de découvert</h4>
        <div class="value ${parseFloat(metrics.risqueNegatif) > 20 ? 'text-danger' : 'text-success'}">
          ${metrics.risqueNegatif}%
        </div>
      </div>
      
      <div class="metric-card">
        <h4>Revenu moyen/semaine</h4>
        <div class="value">${metrics.revenuMoyen} €</div>
      </div>
    </div>
  `;
}

/**
 * Styles CSS pour les métriques (à ajouter dans votre CSS global)
 */
const projectionStyles = `
<style>
.btn-projection {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.btn-projection:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-projection.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.btn-projection:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.projection-metrics {
  margin: 20px 0;
}

.metric-card {
  background: white;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.metric-card h4 {
  color: #666;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 8px;
}

.metric-card .value {
  color: #333;
  font-size: 1.3rem;
  font-weight: 700;
}

.metric-card .value.text-danger {
  color: #ef4444;
}

.metric-card .value.text-success {
  color: #10b981;
}

.alert {
  border-left: 4px solid;
  font-weight: 500;
}

.alert-danger {
  background: #fee2e2;
  border-color: #ef4444;
  color: #991b1b;
}

.alert-warning {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #92400e;
}

.alert-success {
  background: #d1fae5;
  border-color: #10b981;
  color: #065f46;
}
</style>
`;

// Injecter les styles
document.head.insertAdjacentHTML('beforeend', projectionStyles);

// Initialiser au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProjectionButton);
} else {
  initProjectionButton();
}