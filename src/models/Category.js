const supabase = require('../../config/supabase');

class Category {
  /**
   * Récupérer toutes les catégories de revenus
   */
  static async getCategoriesRevenus() {
    const { data, error } = await supabase
      .from('categories_revenus')
      .select('*')
      .order('id');

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer toutes les sous-catégories de revenus
   */
  static async getSousCategoriesRevenus(categorieId = null) {
    let query = supabase
      .from('sous_categories_revenus')
      .select('*, categorie:categories_revenus(nom)')
      .order('categorie_revenu_id')
      .order('nom');

    if (categorieId) {
      query = query.eq('categorie_revenu_id', categorieId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer toutes les catégories de dépenses
   */
  static async getCategoriesDepenses() {
    const { data, error } = await supabase
      .from('categories_depenses')
      .select('*')
      .order('id');

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer toutes les sous-catégories de dépenses
   */
  static async getSousCategoriesDepenses(categorieId = null) {
    let query = supabase
      .from('sous_categories_depenses')
      .select('*, categorie:categories_depenses(nom)')
      .order('categorie_depense_id')
      .order('nom');

    if (categorieId) {
      query = query.eq('categorie_depense_id', categorieId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer toutes les catégories et sous-catégories organisées
   */
  static async getAllOrganized() {
    const [revenus, sousRevenus, depenses, sousDepenses] = await Promise.all([
      this.getCategoriesRevenus(),
      this.getSousCategoriesRevenus(),
      this.getCategoriesDepenses(),
      this.getSousCategoriesDepenses()
    ]);

    return {
      revenus: revenus.map(cat => ({
        ...cat,
        sous_categories: sousRevenus.filter(sc => sc.categorie_revenu_id === cat.id)
      })),
      depenses: depenses.map(cat => ({
        ...cat,
        sous_categories: sousDepenses.filter(sc => sc.categorie_depense_id === cat.id)
      }))
    };
  }
}

module.exports = Category;