// src/controllers/optimisationController.js
const SessionOptimisation = require('../models/SessionOptimisation');
const BudgetOptimise = require('../models/BudgetOptimise');
const ActionOptimisation = require('../models/ActionOptimisation');
const RecurringTransaction = require('../models/RecurringTransaction');
const supabase = require('../../config/supabase');

class OptimisationController {
  
  // ===============================
  // DÉMARRAGE DE L'OPTIMISATION
  // ===============================
  
  /**
   * Page de démarrage de l'optimisation
   */
  static async start(req, res) {
    try {
      const userId = req.session.userId;
      
      // 1. Récupérer le dernier plan budgétaire validé
      const { data: dernierPlan } = await supabase
        .from('sessions_optimisation')
        .select(`
          *,
          budgets_optimises (
            *,
            recurring_transactions (*)
          )
        `)
        .eq('user_id', userId)
        .eq('statut', 'validee')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      console.log('📊 Dashboard - Dernier plan:', dernierPlan?.id);
      console.log('📊 Nombre de budgets:', dernierPlan?.budgets_optimises?.length || 0);
      if (dernierPlan?.budgets_optimises) {
        const revenusCount = dernierPlan.budgets_optimises.filter(b => b.category_type === 'revenu').length;
        const depensesCount = dernierPlan.budgets_optimises.filter(b => b.category_type === 'depense').length;
        console.log(`📊 Budgets: ${revenusCount} revenus, ${depensesCount} dépenses`);
      }
      
      // 2. Récupérer toutes les catégories (revenus + dépenses)
      const { data: categoriesRevenus } = await supabase
        .from('categories_revenus')
        .select('*')
        .order('nom');
      
      const { data: categoriesDepenses } = await supabase
        .from('categories_depenses')
        .select('*')
        .order('nom');
      
      // 3. Calculer les dépenses/revenus actuels du mois en cours
      const debutMois = new Date();
      debutMois.setDate(1);
      debutMois.setHours(0, 0, 0, 0);
      
      const finMois = new Date(debutMois);
      finMois.setMonth(finMois.getMonth() + 1);
      finMois.setDate(0);
      finMois.setHours(23, 59, 59, 999);
      
      // Récupérer les transactions du mois
      const { data: transactionsMois } = await supabase
        .from('transactions')
        .select('montant, nature, categorie_depense_id, categorie_revenu_id')
        .eq('user_id', userId)
        .gte('date_transaction', debutMois.toISOString())
        .lte('date_transaction', finMois.toISOString());
      
      // 4. Construire le tableau comparatif
      const tableauComparatif = {
        revenus: [],
        depenses: []
      };
      
      // Préparer un map des budgets du dernier plan
      const budgetsMap = {};
      if (dernierPlan && dernierPlan.budgets_optimises) {
        dernierPlan.budgets_optimises.forEach(budget => {
          const key = `${budget.category_type}_${budget.category_id}`;
          if (!budgetsMap[key]) {
            budgetsMap[key] = 0;
          }
          budgetsMap[key] += parseFloat(budget.montant_optimal);
        });
      }
      
      // Calculer les montants actuels par catégorie
      const actualMap = {};
      (transactionsMois || []).forEach(tx => {
        if (tx.nature === 'depense' && tx.categorie_depense_id) {
          const key = `depense_${tx.categorie_depense_id}`;
          actualMap[key] = (actualMap[key] || 0) + Math.abs(parseFloat(tx.montant));
        } else if (tx.nature === 'revenu' && tx.categorie_revenu_id) {
          const key = `revenu_${tx.categorie_revenu_id}`;
          actualMap[key] = (actualMap[key] || 0) + Math.abs(parseFloat(tx.montant));
        }
      });
      
      // Construire les lignes pour les REVENUS
      (categoriesRevenus || []).forEach(cat => {
        const key = `revenu_${cat.id}`;
        const budgetFixe = budgetsMap[key] || 0;
        const montantActuel = actualMap[key] || 0;
        
        tableauComparatif.revenus.push({
          nom: cat.nom.trim(),
          budgetFixe: budgetFixe,
          montantActuel: montantActuel,
          pourcentage: budgetFixe > 0 ? (montantActuel / budgetFixe * 100) : 0,
          etat: OptimisationController.determinerEtat(montantActuel, budgetFixe, 'revenu')
        });
      });
      
      // Construire les lignes pour les DÉPENSES
      (categoriesDepenses || []).forEach(cat => {
        const key = `depense_${cat.id}`;
        const budgetFixe = budgetsMap[key] || 0;
        const montantActuel = actualMap[key] || 0;
        
        tableauComparatif.depenses.push({
          nom: cat.nom.trim(),
          budgetFixe: budgetFixe,
          montantActuel: montantActuel,
          pourcentage: budgetFixe > 0 ? (montantActuel / budgetFixe * 100) : 0,
          etat: OptimisationController.determinerEtat(montantActuel, budgetFixe, 'depense')
        });
      });
      
      // 5. Calculer les totaux
      const totaux = {
        revenus: {
          budget: tableauComparatif.revenus.reduce((sum, r) => sum + r.budgetFixe, 0),
          actuel: tableauComparatif.revenus.reduce((sum, r) => sum + r.montantActuel, 0)
        },
        depenses: {
          budget: tableauComparatif.depenses.reduce((sum, d) => sum + d.budgetFixe, 0),
          actuel: tableauComparatif.depenses.reduce((sum, d) => sum + d.montantActuel, 0)
        }
      };
      
      totaux.solde = {
        budget: totaux.revenus.budget - totaux.depenses.budget,
        actuel: totaux.revenus.actuel - totaux.depenses.actuel
      };
      
      res.render('optimisation/dashboard', {
        tableauComparatif,
        totaux,
        dernierPlan,
        moisActuel: OptimisationController.getMoisActuelFormate(),
        user: req.session.user,
        currentPage: 'optimisation'
      });
      
    } catch (error) {
      console.error('Erreur start:', error);
      res.status(500).send('Erreur lors de l\'affichage du tableau de bord');
    }
  }
  
  /**
   * Détermine l'état d'une catégorie (bon, moyen, mauvais)
   */
  static determinerEtat(montantActuel, budgetFixe, type) {
    if (budgetFixe === 0) {
      return montantActuel === 0 ? 'vide' : 'non-budgete';
    }
    
    const pourcentage = (montantActuel / budgetFixe) * 100;
    
    if (type === 'depense') {
      if (pourcentage <= 75) return 'excellent';
      if (pourcentage <= 90) return 'bon';
      if (pourcentage <= 100) return 'limite';
      if (pourcentage <= 110) return 'depassement-leger';
      return 'depassement';
    } else {
      // Pour les revenus, c'est l'inverse
      if (pourcentage >= 100) return 'excellent';
      if (pourcentage >= 90) return 'bon';
      if (pourcentage >= 75) return 'moyen';
      return 'faible';
    }
  }
  
  /**
   * Retourne le mois actuel formaté
   */
  static getMoisActuelFormate() {
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const date = new Date();
    return `${mois[date.getMonth()]} ${date.getFullYear()}`;
  }
  
  /**
   * Démarre une nouvelle session d'optimisation
   */
  static async nouveauBudget(req, res) {
    try {
      const userId = req.session.userId;
      
      // Vérifier s'il y a déjà une session en cours
      const sessionEnCours = await SessionOptimisation.getCurrent(userId);
      
      if (sessionEnCours) {
        // Rediriger vers l'étape en cours
        return res.redirect('/optimisation/etape1');
      }
      
      // Calculer le mois cible (mois prochain, premier jour)
      const moisCible = new Date();
      moisCible.setMonth(moisCible.getMonth() + 1);
      moisCible.setDate(1);
      moisCible.setHours(0, 0, 0, 0);
      
      console.log('Création session avec mois_cible:', moisCible.toISOString());
      
      // Créer une nouvelle session avec un objet
      await SessionOptimisation.create(userId, {
        mois_cible: moisCible,
        revenus_recurrents: 0,
        depenses_recurrentes: 0
      });
      
      // Rediriger vers l'étape 1
      res.redirect('/optimisation/etape1');
      
    } catch (error) {
      console.error('Erreur nouveauBudget:', error);
      res.status(500).send('Erreur lors du démarrage de l\'optimisation');
    }
  }
  
  /**
   * Initialise une nouvelle session d'optimisation
   */
  static async initSession(req, res) {
    try {
      const userId = req.session.userId;
      const { mois_cible } = req.body;
      
      // Récupérer toutes les recurring_transactions actives
      const recurringTransactions = await RecurringTransaction.findByUserId(userId);
      
      // Calculer les revenus récurrents
      const revenus = recurringTransactions.filter(rt => rt.nature === 'revenu');
      const revenus_recurrents = OptimisationController.calculateMonthlyTotal(revenus);
      
      // Calculer les dépenses récurrentes
      const depenses = recurringTransactions.filter(rt => rt.nature === 'depense');
      const depenses_recurrentes = OptimisationController.calculateMonthlyTotal(depenses);
      
      // Créer la session
      const session = await SessionOptimisation.create(userId, {
        mois_cible: mois_cible || SessionOptimisation.getNextMonth(),
        revenus_recurrents,
        depenses_recurrentes
      });
      
      res.redirect('/optimisation/etape1');
      
    } catch (error) {
      console.error('Erreur initSession:', error);
      res.status(500).send('Erreur lors de l\'initialisation');
    }
  }
  
  
  // ===============================
  // ÉTAPE 1 : REVENUS
  // ===============================
  
  /**
   * Affiche l'étape 1 : Estimation des revenus
   */
  static async etape1Revenus(req, res) {
    try {
      const userId = req.session.userId;
      
      // Récupérer ou créer la session
      let session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        // Créer une nouvelle session si elle n'existe pas
        const nextMonth = SessionOptimisation.getNextMonth();
        const revenus = await RecurringTransaction.findByUserId(userId);
        const revenusActifs = revenus.filter(r => r.nature === 'revenu' && r.active);
        const revenus_recurrents = OptimisationController.calculateMonthlyTotal(revenusActifs);
        
        session = await SessionOptimisation.create(userId, {
          mois_cible: nextMonth,
          revenus_recurrents
        });
      }
      
      // Récupérer les recurring_transactions de type revenu
      const allRecurring = await RecurringTransaction.findByUserId(userId);
      const revenus = allRecurring.filter(rt => rt.nature === 'revenu' && rt.active);
      
      // Récupérer toutes les catégories de revenus
      const { data: categoriesRevenus } = await supabase
        .from('categories_revenus')
        .select('*')
        .order('nom');
      
      // Calculer les montants actuels par catégorie (depuis les recurring_transactions)
      const montantsParCategorie = {};
      revenus.forEach(r => {
        if (r.categorie_revenu_id) {
          const montantMensuel = OptimisationController.calculateMontantMensuel(
            r.montant_moyen, 
            r.frequence
          );
          montantsParCategorie[r.categorie_revenu_id] = 
            (montantsParCategorie[r.categorie_revenu_id] || 0) + montantMensuel;
        }
      });
      
      // Enrichir les catégories avec les montants
      const categoriesEnriched = (categoriesRevenus || []).map(cat => ({
        ...cat,
        montant_actuel: montantsParCategorie[cat.id] || 0
      }));
      
      // Calculer l'estimation totale
      const estimation = OptimisationController.calculateMonthlyTotal(revenus);
      
      res.render('optimisation/etape1-revenus', {
        session,
        categories: categoriesEnriched,
        estimation,
        moisCible: SessionOptimisation.formatMoisCible(session.mois_cible),
        user: req.session.user,
        currentPage: 'optimisation'
      });
      
    } catch (error) {
      console.error('Erreur etape1:', error);
      res.status(500).send('Erreur lors de l\'affichage de l\'étape 1');
    }
  }
  
  /**
   * Sauvegarde les ajustements de revenus
   */
  static async saveRevenus(req, res) {
    try {
      const userId = req.session.userId;
      const { revenus_optimises, budgets_revenus } = req.body;
      
      console.log('📥 Données reçues à saveRevenus:');
      console.log('  revenus_optimises:', revenus_optimises);
      console.log('  budgets_revenus:', JSON.stringify(budgets_revenus, null, 2));
      console.log('  🔍 Type de budgets_revenus:', Array.isArray(budgets_revenus) ? '🚨 ARRAY' : '✅ OBJECT');
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.status(404).send('Session introuvable');
      }
      
      let totalRevenusCalcule = 0;
      
      // Si des budgets par catégorie ont été saisis, les créer
      if (budgets_revenus) {
        // Récupérer toutes les catégories de revenus
        const { data: categoriesRevenus } = await supabase
          .from('categories_revenus')
          .select('*')
          .order('id');
        
        console.log(`📋 ${categoriesRevenus.length} catégories trouvées:`, categoriesRevenus.map(c => `${c.id}:${c.nom}`).join(', '));
        
        // Convertir l'array en objet si nécessaire
        let budgetsObj = budgets_revenus;
        if (Array.isArray(budgets_revenus)) {
          console.log('⚠️ budgets_revenus est un array, conversion en objet...');
          budgetsObj = {};
          categoriesRevenus.forEach((cat, index) => {
            if (budgets_revenus[index] !== undefined) {
              budgetsObj[cat.id] = budgets_revenus[index];
              console.log(`  Mapping: index ${index} → catégorie ${cat.id} (${cat.nom}): ${budgets_revenus[index]}€`);
            }
          });
        }
        
        for (const categorie of categoriesRevenus) {
          const montantBudget = parseFloat(budgetsObj[categorie.id]) || 0;
          
          console.log(`  Catégorie ${categorie.nom} (ID ${categorie.id}): ${montantBudget}€`);
          
          if (montantBudget > 0) {
            totalRevenusCalcule += montantBudget;
            
            // Vérifier si un budget existe déjà pour cette catégorie
            const { data: existingBudget } = await supabase
              .from('budgets_optimises')
              .select('id')
              .eq('session_id', session.id)
              .eq('category_id', categorie.id)
              .eq('category_type', 'revenu')
              .is('recurring_transaction_id', null)
              .maybeSingle();
            
            if (existingBudget) {
              // Mettre à jour
              await supabase
                .from('budgets_optimises')
                .update({
                  montant_optimal: montantBudget
                })
                .eq('id', existingBudget.id);
            } else {
              // Créer
              const { data: newBudget, error: insertError } = await supabase
                .from('budgets_optimises')
                .insert({
                  session_id: session.id,
                  recurring_transaction_id: null,
                  montant_actuel: 0,
                  montant_optimal: montantBudget,
                  category_type: 'revenu',
                  category_id: categorie.id,
                  sous_category_id: null
                })
                .select()
                .single();
              
              if (insertError) {
                console.error(`❌ Erreur insertion budget ${categorie.nom}:`, insertError);
              } else {
                console.log(`    ✅ Budget créé (ID ${newBudget.id}): ${newBudget.montant_optimal}€`);
              }
            }
          }
        }
      }
      
      // VÉRIFICATION : Relire les budgets depuis la base
      const { data: budgetsVerif } = await supabase
        .from('budgets_optimises')
        .select('category_id, montant_optimal')
        .eq('session_id', session.id)
        .eq('category_type', 'revenu');
      
      console.log('🔍 VÉRIFICATION - Budgets dans la base après sauvegarde:');
      budgetsVerif?.forEach(b => {
        console.log(`    Catégorie ${b.category_id}: ${b.montant_optimal}€`);
      });
      
      // Mettre à jour le total des revenus optimisés avec la somme calculée
      await SessionOptimisation.updateRevenus(session.id, totalRevenusCalcule);
      
      console.log(`✅ Revenus sauvegardés: ${totalRevenusCalcule}€ (${Object.keys(budgets_revenus || {}).length} catégories)`);
      
      // Rediriger vers l'étape 2
      res.redirect('/optimisation/etape2');
      
    } catch (error) {
      console.error('Erreur saveRevenus:', error);
      res.status(500).send('Erreur lors de la sauvegarde des revenus');
    }
  }
  
  
  // ===============================
  // ÉTAPE 2 : DÉPENSES
  // ===============================
  
  /**
   * Affiche l'étape 2 : Revue des dépenses par catégorie
   */
  static async etape2Depenses(req, res) {
    try {
      const userId = req.session.userId;
      const { categoryId } = req.params;
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.redirect('/optimisation/start');
      }
      
      // Récupérer toutes les catégories de dépenses
      const { data: categories, error: catError } = await supabase
        .from('categories_depenses')
        .select('*')
        .order('nom');
      
      if (catError) throw catError;
      
      // Si pas de categoryId, rediriger vers la première catégorie
      if (!categoryId && categories.length > 0) {
        return res.redirect(`/optimisation/etape2/${categories[0].id}`);
      }
      
      // Si aucune catégorie n'existe, passer directement au récapitulatif
      if (categories.length === 0) {
        return res.redirect('/optimisation/etape3');
      }
      
      // Récupérer les recurring_transactions de cette catégorie
      const allRecurring = await RecurringTransaction.findByUserId(userId);
      const depenses = allRecurring.filter(rt => 
        rt.nature === 'depense' && 
        rt.active && 
        rt.categorie_depense_id == categoryId
      );
      
      // Enrichir avec montant mensuel
      const depensesEnriched = depenses.map(d => ({
        ...d,
        montant_mensuel: OptimisationController.calculateMontantMensuel(d.montant_moyen, d.frequence)
      }));
      
      const totalActuel = depensesEnriched.reduce((sum, d) => sum + d.montant_mensuel, 0);
      
      // Trouver la catégorie courante et la suivante
      const currentIndex = categories.findIndex(c => c.id == categoryId);
      const currentCategory = categories[currentIndex];
      const nextCategory = categories[currentIndex + 1];
      
      // Calculer la progression
      const progress = Math.round(((currentIndex + 1) / categories.length) * 100);
      
      res.render('optimisation/etape2-depenses', {
        session,
        categories,
        currentCategory,
        nextCategory,
        depenses: depensesEnriched,
        totalActuel,
        progress,
        moisCible: SessionOptimisation.formatMoisCible(session.mois_cible),
        user: req.session.user,
        currentPage: 'optimisation'
      });
      
    } catch (error) {
      console.error('Erreur etape2:', error);
      res.status(500).send('Erreur lors de l\'affichage de l\'étape 2');
    }
  }
  
  /**
   * Sauvegarde les optimisations d'une catégorie
   */
  static async saveDepense(req, res) {
    try {
      const userId = req.session.userId;
      const { categoryId } = req.params;
      const { budgets, budget_global } = req.body;
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.status(404).send('Session introuvable');
      }
      
      // Récupérer TOUTES les recurring_transactions de cette catégorie
      const allRecurring = await RecurringTransaction.findByUserId(userId);
      const depensesCategorie = allRecurring.filter(rt => 
        rt.nature === 'depense' && 
        rt.active && 
        rt.categorie_depense_id == categoryId
      );
      
      let totalOptimise = 0;
      
      // CAS 1 : Il y a des dépenses récurrentes dans cette catégorie
      if (depensesCategorie.length > 0) {
        console.log(`📊 Catégorie ${categoryId}: ${depensesCategorie.length} dépenses récurrentes trouvées`);
        
        // Pour CHAQUE dépense récurrente, créer/mettre à jour un budget
        for (const recurring of depensesCategorie) {
          console.log(`  → Traitement de: ${recurring.nom} (ID: ${recurring.id})`);
          
          // Récupérer le montant saisi par l'utilisateur (ou garder le montant par défaut)
          const montantSaisi = budgets && budgets[recurring.id] 
            ? parseFloat(budgets[recurring.id]) 
            : recurring.montant_moyen;
          
          console.log(`    Montant saisi: ${montantSaisi}`);
          
          // Calculer le montant mensuel actuel
          const montantActuel = OptimisationController.calculateMontantMensuel(
            recurring.montant_moyen, 
            recurring.frequence
          );
          
          // Calculer le montant mensuel optimal
          const montantOptimalMensuel = OptimisationController.calculateMontantMensuel(
            montantSaisi,
            recurring.frequence
          );
          
          totalOptimise += montantOptimalMensuel;
          
          // Vérifier si le budget existe déjà
          const { data: existingBudgets } = await supabase
            .from('budgets_optimises')
            .select('id')
            .eq('session_id', session.id)
            .eq('recurring_transaction_id', recurring.id)
            .maybeSingle();
          
          if (existingBudgets) {
            console.log(`    ✏️ Mise à jour du budget existant (ID: ${existingBudgets.id})`);
            // Mettre à jour
            await BudgetOptimise.updateMontantOptimal(
              existingBudgets.id, 
              montantOptimalMensuel
            );
          } else {
            console.log(`    ➕ Création d'un nouveau budget`);
            // Créer
            await BudgetOptimise.create(session.id, recurring.id, {
              montant_actuel: montantActuel,
              montant_optimal: montantOptimalMensuel,
              category_type: 'depense',
              category_id: categoryId,
              sous_category_id: recurring.sous_categorie_depense_id
            });
          }
        }
        console.log(`✅ Catégorie ${categoryId} traitée avec succès`);
      } 
      // CAS 2 : Pas de dépenses récurrentes, mais budget global défini
      else if (budget_global !== undefined && budget_global !== '') {
        const montantGlobal = parseFloat(budget_global) || 0;
        totalOptimise = montantGlobal;
        
        // Vérifier si un budget virtuel existe déjà pour cette catégorie
        const { data: existingVirtuel } = await supabase
          .from('budgets_optimises')
          .select('id')
          .eq('session_id', session.id)
          .eq('category_type', 'depense')  // ✅ FILTRE AJOUTÉ
          .eq('category_id', categoryId)
          .is('recurring_transaction_id', null)
          .maybeSingle();
        
        if (existingVirtuel) {
          // Mettre à jour le budget virtuel existant
          await supabase
            .from('budgets_optimises')
            .update({
              montant_optimal: montantGlobal
            })
            .eq('id', existingVirtuel.id);
        } else {
          // Créer un nouveau budget virtuel
          const { error: budgetError } = await supabase
            .from('budgets_optimises')
            .insert({
              session_id: session.id,
              recurring_transaction_id: null,
              montant_actuel: 0,
              montant_optimal: montantGlobal,
              category_type: 'depense',
              category_id: categoryId,
              sous_category_id: null
            });
          
          if (budgetError) {
            console.error('Erreur création budget virtuel:', budgetError);
          }
        }
      }
      
      // Recalculer le total des dépenses optimisées
      // ATTENTION : Ne pas ajouter totalOptimise car il est déjà dans allBudgets
      const allBudgets = await BudgetOptimise.getBySession(session.id);
      const depensesOptimisees = allBudgets
        .filter(b => b.category_type === 'depense')
        .reduce((sum, b) => sum + parseFloat(b.montant_optimal), 0);
      
      await SessionOptimisation.update(session.id, {
        depenses_optimisees: depensesOptimisees
      });
      
      // Rediriger vers la catégorie suivante ou le récap
      const { data: categories } = await supabase
        .from('categories_depenses')
        .select('id')
        .order('nom');
      
      const currentIndex = categories.findIndex(c => c.id == categoryId);
      const nextCategory = categories[currentIndex + 1];
      
      if (nextCategory) {
        res.redirect(`/optimisation/etape2/${nextCategory.id}`);
      } else {
        res.redirect('/optimisation/etape3');
      }
      
    } catch (error) {
      console.error('Erreur saveDepense:', error);
      res.status(500).send('Erreur lors de la sauvegarde des dépenses');
    }
  }
  
  
  // ===============================
  // ÉTAPE 3 : RÉCAPITULATIF
  // ===============================
  
  /**
   * Affiche le récapitulatif de l'optimisation
   */
  static async etape3Recapitulatif(req, res) {
    try {
      const userId = req.session.userId;
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.redirect('/optimisation/start');
      }
      
      // Récupérer les budgets et les actions
      const budgets = await BudgetOptimise.getBySession(session.id);
      const actions = await ActionOptimisation.getBySession(session.id);
      
      console.log(`📊 Étape 3 - Session ${session.id}:`);
      console.log(`  Total budgets récupérés: ${budgets.length}`);
      console.log(`  Budgets revenus: ${budgets.filter(b => b.category_type === 'revenu').length}`);
      console.log(`  Budgets dépenses: ${budgets.filter(b => b.category_type === 'depense').length}`);
      
      // Grouper les budgets par catégorie
      const budgetsParCategorie = await OptimisationController.groupBudgetsByCategory(budgets);
      
      console.log(`  Catégories groupées: ${budgetsParCategorie.length}`);
      budgetsParCategorie.forEach(cat => {
        console.log(`    ${cat.type === 'revenu' ? '💰' : '💸'} ${cat.nom}: ${cat.budgets.length} budgets, total ${cat.totalOptimal.toFixed(2)}€`);
      });
      
      // Recalculer le solde
      await SessionOptimisation.recalculateSolde(session.id);
      const sessionUpdated = await SessionOptimisation.getById(session.id);
      
      const solde = parseFloat(sessionUpdated.solde_previsionnel);
      const alerteDeficit = solde < 0;
      
      // Calculer l'économie totale
      const economieTotale = budgets.reduce((sum, b) => {
        return sum + (parseFloat(b.montant_actuel) - parseFloat(b.montant_optimal));
      }, 0);
      
      // Calculer l'économie par les actions
      const economieActions = actions.reduce((sum, a) => {
        return sum + parseFloat(a.economie_mensuelle || 0);
      }, 0);
      
      res.render('optimisation/etape3-recapitulatif', {
        session: sessionUpdated,
        budgetsParCategorie,
        actions,
        solde,
        alerteDeficit,
        economieTotale,
        economieActions,
        moisCible: SessionOptimisation.formatMoisCible(sessionUpdated.mois_cible),
        user: req.session.user,
        currentPage: 'optimisation'
      });
      
    } catch (error) {
      console.error('Erreur etape3:', error);
      res.status(500).send('Erreur lors de l\'affichage du récapitulatif');
    }
  }
  
  /**
   * Valide l'optimisation et génère le plan
   */
  static async validateOptimisation(req, res) {
    try {
      const userId = req.session.userId;
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.status(404).send('Session introuvable');
      }
      
      // Valider la session
      await SessionOptimisation.validate(session.id);
      
      // Rediriger vers le rectangle imprimable
      res.redirect(`/optimisation/rectangle/${session.id}`);
      
    } catch (error) {
      console.error('Erreur validateOptimisation:', error);
      res.status(500).send('Erreur lors de la validation');
    }
  }
  
  
  // ===============================
  // RECTANGLE IMPRIMABLE
  // ===============================
  
  /**
   * Génère le rectangle imprimable
   */
  static async genererRectangle(req, res) {
    try {
      const { sessionId } = req.params;
      
      // Récupérer la session avec tous les détails
      const session = await SessionOptimisation.getByIdWithDetails(sessionId);
      
      if (!session) {
        return res.status(404).send('Session introuvable');
      }
      
      // Vérifier que c'est bien la session de l'utilisateur
      if (session.user_id !== req.session.userId) {
        return res.status(403).send('Accès non autorisé');
      }
      
      // Grouper les budgets par catégorie
      const budgetsParCategorie = await OptimisationController.groupBudgetsByCategory(session.budgets);
      
      // Générer le calendrier des transactions planifiées
      const transactionsPlanifiees = await BudgetOptimise.genererCalendrier(
        sessionId,
        session.mois_cible
      );
      
      // Filtrer les actions non terminées
      const actionsEnCours = session.actions.filter(a => 
        a.statut === 'todo' || a.statut === 'en_cours'
      );
      
      res.render('optimisation/rectangle-impression', {
        session,
        budgetsParCategorie,
        actions: actionsEnCours,
        transactionsPlanifiees,
        moisCible: SessionOptimisation.formatMoisCible(session.mois_cible),
        layout: false, // Pas de layout pour l'impression
        currentPage: 'optimisation'
      });
      
    } catch (error) {
      console.error('Erreur genererRectangle:', error);
      res.status(500).send('Erreur lors de la génération du rectangle');
    }
  }
  
  
  // ===============================
  // GESTION DES ACTIONS
  // ===============================
  
  /**
   * Affiche le formulaire d'ajout d'action
   */
  static async addActionForm(req, res) {
    try {
      const { budgetId, nom, categorie } = req.query;
      
      let budget = null;
      let nomSuggestion = nom || categorie || '';
      
      if (budgetId) {
        budget = await BudgetOptimise.getById(parseInt(budgetId));
      }
      
      res.render('optimisation/add-action', {
        budget,
        nomSuggestion,
        user: req.session.user
      });
      
    } catch (error) {
      console.error('Erreur addActionForm:', error);
      res.status(500).send('Erreur lors de l\'affichage du formulaire');
    }
  }
  
  /**
   * Crée une nouvelle action
   */
  static async addAction(req, res) {
    try {
      const userId = req.session.userId;
      const { budget_optimise_id, description, economie_mensuelle, priorite, date_limite } = req.body;
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.status(404).send('Session introuvable');
      }
      
      // Créer l'action
      await ActionOptimisation.create(session.id, {
        budget_optimise_id: budget_optimise_id || null,
        description,
        economie_mensuelle: economie_mensuelle || 0,
        priorite: priorite || 2,
        date_limite: date_limite || null
      });
      
      // Rediriger vers l'étape en cours
      if (req.headers.referer) {
        res.redirect(req.headers.referer);
      } else {
        res.redirect('/optimisation/etape3');
      }
      
    } catch (error) {
      console.error('Erreur addAction:', error);
      res.status(500).send('Erreur lors de l\'ajout de l\'action');
    }
  }
  
  /**
   * Change le statut d'une action (toggle)
   */
  static async toggleAction(req, res) {
    try {
      const { id } = req.params;
      const { statut } = req.body;
      
      await ActionOptimisation.updateStatut(parseInt(id), statut);
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('Erreur toggleAction:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  /**
   * Supprime une action
   */
  static async deleteAction(req, res) {
    try {
      const { id } = req.params;
      
      await ActionOptimisation.delete(parseInt(id));
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('Erreur deleteAction:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  
  // ===============================
  // HISTORIQUE ET DASHBOARD
  // ===============================
  
  /**
   * Affiche l'historique des optimisations
   */
  static async historique(req, res) {
    try {
      const userId = req.session.userId;
      
      const sessions = await SessionOptimisation.getAllByUser(userId, {
        statut: 'validee',
        limit: 12
      });
      
      res.render('optimisation/historique', {
        sessions,
        user: req.session.user
      });
      
    } catch (error) {
      console.error('Erreur historique:', error);
      res.status(500).send('Erreur lors de l\'affichage de l\'historique');
    }
  }
  
  /**
   * Annule une session en cours
   */
  static async cancelSession(req, res) {
    try {
      const userId = req.session.userId;
      
      const session = await SessionOptimisation.getCurrent(userId);
      
      if (!session) {
        return res.status(404).send('Aucune session en cours');
      }
      
      await SessionOptimisation.cancel(session.id);
      
      res.redirect('/transactions');
      
    } catch (error) {
      console.error('Erreur cancelSession:', error);
      res.status(500).send('Erreur lors de l\'annulation');
    }
  }
  
  
  // ===============================
  // HELPERS
  // ===============================
  
  /**
   * Calcule le montant mensuel selon la fréquence
   */
  static calculateMontantMensuel(montant, frequence) {
    const montantFloat = parseFloat(montant) || 0;
    
    switch (frequence) {
      case 'weekly':
        return montantFloat * 4.33;
      case 'monthly':
        return montantFloat;
      case 'yearly':
        return montantFloat / 12;
      default:
        return montantFloat;
    }
  }
  
  /**
   * Calcule le total mensuel d'un tableau de recurring_transactions
   */
  static calculateMonthlyTotal(recurringTransactions) {
    return recurringTransactions.reduce((total, rt) => {
      return total + this.calculateMontantMensuel(rt.montant_moyen, rt.frequence);
    }, 0);
  }
  
  /**
   * Groupe les budgets par catégorie (OPTIMISÉ)
   */
  static async groupBudgetsByCategory(budgets) {
    if (!budgets || budgets.length === 0) return [];
    
    // Récupérer tous les IDs de catégories uniques
    const categoryIds = [...new Set(budgets.map(b => b.category_id))];
    
    // Récupérer TOUTES les catégories en une seule requête
    const { data: categoriesDepenses } = await supabase
      .from('categories_depenses')
      .select('id, nom')
      .in('id', categoryIds);
    
    const { data: categoriesRevenus } = await supabase
      .from('categories_revenus')
      .select('id, nom')
      .in('id', categoryIds);
    
    // Créer un map pour un accès rapide
    const categoryMap = {};
    (categoriesDepenses || []).forEach(cat => {
      categoryMap[`depense_${cat.id}`] = cat.nom?.trim() || 'Autre';
    });
    (categoriesRevenus || []).forEach(cat => {
      categoryMap[`revenu_${cat.id}`] = cat.nom?.trim() || 'Autre';
    });
    
    // Grouper les budgets
    const grouped = {};
    
    for (const budget of budgets) {
      const key = `${budget.category_type}_${budget.category_id}`;
      const categoryName = categoryMap[key] || 'Autre';
      
      if (!grouped[categoryName]) {
        grouped[categoryName] = {
          nom: categoryName,
          type: budget.category_type,
          budgets: [],
          totalActuel: 0,
          totalOptimal: 0,
          economie: 0
        };
      }
      
      grouped[categoryName].budgets.push(budget);
      grouped[categoryName].totalActuel += parseFloat(budget.montant_actuel);
      grouped[categoryName].totalOptimal += parseFloat(budget.montant_optimal);
      grouped[categoryName].economie += parseFloat(budget.montant_actuel) - parseFloat(budget.montant_optimal);
    }
    
    return Object.values(grouped);
  }
}

module.exports = OptimisationController;