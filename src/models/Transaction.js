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
   * Récupérer toutes les transactions d'un utilisateur
   */
  static async findByUserId(userId, limit = 50) {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        sous_categorie_revenu:sous_categories_revenus(id, nom, categorie_revenu_id),
        sous_categorie_depense:sous_categories_depenses(id, nom, categorie_depense_id)
      `)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
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
}

module.exports = Transaction;