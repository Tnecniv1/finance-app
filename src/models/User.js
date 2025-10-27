const supabase = require('../../config/supabase');
const bcrypt = require('bcryptjs');

class User {
  /**
   * Créer un nouvel utilisateur
   */
  static async create(userData) {
    try {
      const { nom, prenom, pseudo, date_de_naissance, situation_professionnelle, adresse_mail, ville, password } = userData;

      // Hasher le mot de passe
      const mot_de_passe = await bcrypt.hash(password, 10);

      const { data, error } = await supabase
        .from('users')
        .insert([{
          nom,
          prenom,
          pseudo,
          date_de_naissance,
          situation_professionnelle,
          adresse_mail,
          ville,
          mot_de_passe
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      if (error.code === '23505') { // Code PostgreSQL pour violation de contrainte UNIQUE
        throw new Error('Ce pseudo ou cet email est déjà utilisé');
      }
      throw error;
    }
  }

  /**
   * Trouver un utilisateur par pseudo
   */
  static async findByPseudo(pseudo) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('pseudo', pseudo)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  }

  /**
   * Trouver un utilisateur par email
   */
  static async findByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('adresse_mail', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Trouver un utilisateur par ID
   */
  static async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Vérifier le mot de passe
   */
  static async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }
}

module.exports = User;