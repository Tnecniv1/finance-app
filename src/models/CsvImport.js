const supabase = require('../../config/supabase');

class CsvImport {
  /**
   * Créer un nouvel import CSV
   */
  static async create(userId, filename, fileContent, fileSize) {
    const { data, error } = await supabase
      .from('csv_imports')
      .insert([{
        user_id: userId,
        filename: filename,
        file_content: fileContent,
        file_size: fileSize,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer un import par ID
   */
  static async findById(importId) {
    const { data, error } = await supabase
      .from('csv_imports')
      .select('*')
      .eq('id', importId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer tous les imports d'un utilisateur
   */
  static async findByUserId(userId, limit = 10) {
    const { data, error } = await supabase
      .from('csv_imports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  /**
   * Mettre à jour le statut d'un import
   */
  static async updateStatus(importId, status, importedCount = null, errorCount = null, errorDetails = null) {
    const updates = {
      status: status,
      processed_at: new Date().toISOString()
    };

    if (importedCount !== null) updates.imported_count = importedCount;
    if (errorCount !== null) updates.error_count = errorCount;
    if (errorDetails !== null) updates.error_details = errorDetails;

    const { data, error } = await supabase
      .from('csv_imports')
      .update(updates)
      .eq('id', importId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Supprimer un import
   */
  static async delete(importId, userId) {
    const { error } = await supabase
      .from('csv_imports')
      .delete()
      .eq('id', importId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }
}

module.exports = CsvImport;