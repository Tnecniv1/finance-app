const supabase = require('../../config/supabase');

class Transaction {
  /**
   * Créer une nouvelle transaction
   */
  static async create(transactionData) {
    const { user_id, objet, montant, nature, date, sous_categorie_revenu_id, sous_categorie_depense_id } = transactionData;

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id,
        objet,
        montant,
        nature,
        date,
        sous_categorie_revenu_id,
        sous_categorie_depense_id
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer les transactions avec filtres
   */
  static async findWithFilters(filters) {
    const { userId, nature, categorieId, sousCategorieId, dateDebut, dateFin, recherche, categorized } = filters;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        sous_categorie_revenu:sous_categories_revenus(id, nom, categorie_revenu_id),
        sous_categorie_depense:sous_categories_depenses(id, nom, categorie_depense_id)
      `)
      .eq('user_id', userId);

    // Filtre par nature (revenu/depense)
    if (nature) {
      query = query.eq('nature', nature);
    }

    // Filtre par date début
    if (dateDebut) {
      query = query.gte('date', dateDebut);
    }

    // Filtre par date fin
    if (dateFin) {
      query = query.lte('date', dateFin);
    }

    // Filtre par recherche dans la description
    if (recherche) {
      query = query.ilike('objet', `%${recherche}%`);
    }

    // Filtre par sous-catégorie
    if (sousCategorieId) {
      if (nature === 'revenu') {
        query = query.eq('sous_categorie_revenu_id', sousCategorieId);
      } else if (nature === 'depense') {
        query = query.eq('sous_categorie_depense_id', sousCategorieId);
      }
    }

    // Ordre : date décroissante puis created_at décroissant
    query = query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    const { data, error } = await query;

    if (error) throw error;

    // Filtrage post-requête
    let results = data;

    // 🆕 FILTRE CATÉGORISATION (post-requête car Supabase OR est complexe)
    if (categorized === 'yes') {
      // Transactions catégorisées : ont au moins une sous-catégorie
      results = results.filter(t => 
        t.sous_categorie_revenu_id !== null || t.sous_categorie_depense_id !== null
      );
    }

    if (categorized === 'no') {
      // Transactions non catégorisées : n'ont aucune sous-catégorie
      results = results.filter(t => 
        t.sous_categorie_revenu_id === null && t.sous_categorie_depense_id === null
      );
    }

    // Filtrage par catégorie parente
    if (categorieId && !sousCategorieId) {
      results = results.filter(t => {
        if (t.nature === 'revenu' && t.sous_categorie_revenu) {
          return t.sous_categorie_revenu.categorie_revenu_id === parseInt(categorieId);
        }
        if (t.nature === 'depense' && t.sous_categorie_depense) {
          return t.sous_categorie_depense.categorie_depense_id === parseInt(categorieId);
        }
        return false;
      });
    }

    return results;
  }

  static async findByUserId(userId) {
    let allTransactions = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          sous_categorie_revenu:sous_categories_revenus (
            id,
            nom,
            categorie_revenu_id,
            categorie_revenu:categories_revenus (id, nom)
          ),
          sous_categorie_depense:sous_categories_depenses (
            id,
            nom,
            categorie_depense_id,
            categorie_depense:categories_depenses (id, nom)
          )
        `)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allTransactions = allTransactions.concat(data);
        from += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    return allTransactions;
  }

  /**
   * Récupérer une transaction par ID
   */
  static async findById(id, userId) {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        sous_categorie_revenu:sous_categories_revenus(id, nom),
        sous_categorie_depense:sous_categories_depenses(id, nom)
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Mettre à jour la catégorie d'une transaction
   */
  static async updateCategory(transactionId, userId, nature, sousCategorieId) {
    const updates = {};

    if (nature === 'revenu') {
      updates.sous_categorie_revenu_id = sousCategorieId;
      updates.sous_categorie_depense_id = null;
    } else if (nature === 'depense') {
      updates.sous_categorie_depense_id = sousCategorieId;
      updates.sous_categorie_revenu_id = null;
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', transactionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Supprimer une transaction
   */
  static async delete(id, userId) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  /**
   * Calculer le solde d'un utilisateur
   */
  static async getBalance(userId) {
    const { data, error } = await supabase
      .from('transactions')
      .select('montant, nature')
      .eq('user_id', userId);

    if (error) throw error;

    const totalIncome = data
      .filter(t => t.nature === 'revenu')
      .reduce((sum, t) => sum + parseFloat(t.montant), 0);

    const totalExpenses = data
      .filter(t => t.nature === 'depense')
      .reduce((sum, t) => sum + parseFloat(t.montant), 0);

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses
    };
  }

  /**
   * Récupérer les transactions par période
   */
  static async getByDateRange(userId, startDate, endDate) {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        sous_categorie_revenu:sous_categories_revenus(id, nom),
        sous_categorie_depense:sous_categories_depenses(id, nom)
      `)
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * 🆕 Récupérer les transactions non catégorisées pour l'IA
   */
  static async getUncategorized(userId, limit = 100) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .is('sous_categorie_revenu_id', null)
      .is('sous_categorie_depense_id', null)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * 🆕 Compter les transactions catégorisées et non catégorisées
   */
  static async getCategorizedStats(userId) {
    const { data, error } = await supabase
      .from('transactions')
      .select('sous_categorie_revenu_id, sous_categorie_depense_id')
      .eq('user_id', userId);

    if (error) throw error;

    const categorized = data.filter(t => 
      t.sous_categorie_revenu_id !== null || t.sous_categorie_depense_id !== null
    ).length;

    const uncategorized = data.filter(t => 
      t.sous_categorie_revenu_id === null && t.sous_categorie_depense_id === null
    ).length;

    return {
      total: data.length,
      categorized,
      uncategorized,
      percentage: data.length > 0 ? Math.round((categorized / data.length) * 100) : 0
    };
  }

  /**
   * Récupère plusieurs transactions par leurs IDs (UUIDs)
   * @param {Array<string>} ids - Array d'UUIDs
   */
  static async findByIds(ids) {
    if (!ids || ids.length === 0) return [];
    
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        sous_categorie_revenu:sous_categories_revenus (
          id,
          nom,
          categorie_revenu:categories_revenus (id, nom)
        ),
        sous_categorie_depense:sous_categories_depenses (
          id,
          nom,
          categorie_depense:categories_depenses (id, nom)
        )
      `)
      .in('id', ids)
      .order('date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }


}

module.exports = Transaction;