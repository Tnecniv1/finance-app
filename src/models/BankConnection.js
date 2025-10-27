const supabase = require('../../config/supabase');

class BankConnection {
  /**
   * Créer une nouvelle connexion bancaire
   */
  static async create(userId, bridgeItemId, bankName) {
    const { data, error } = await supabase
      .from('bank_connections')
      .insert([{
        user_id: userId,
        bridge_item_id: bridgeItemId,
        bank_name: bankName,
        status: 'active',
        last_sync: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Récupérer toutes les connexions bancaires d'un utilisateur
   */
  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('bank_connections')
      .select(`
        *,
        bank_accounts (
          id,
          name,
          type,
          balance,
          currency,
          iban
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Trouver une connexion par bridge_item_id
   */
  static async findByBridgeItemId(bridgeItemId) {
    const { data, error } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('bridge_item_id', bridgeItemId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Mettre à jour le statut d'une connexion
   */
  static async updateStatus(connectionId, status) {
    const { error } = await supabase
      .from('bank_connections')
      .update({ 
        status,
        last_sync: new Date().toISOString()
      })
      .eq('id', connectionId);

    if (error) throw error;
    return true;
  }

  /**
   * Supprimer une connexion bancaire
   */
  static async delete(connectionId, userId) {
    const { error } = await supabase
      .from('bank_connections')
      .delete()
      .eq('id', connectionId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  }

  /**
   * Sauvegarder les comptes bancaires d'une connexion
   */
  static async saveAccounts(connectionId, accounts) {
    const accountsToInsert = accounts.map(account => ({
      bank_connection_id: connectionId,
      bridge_account_id: account.id.toString(),
      name: account.name || 'Compte sans nom',
      type: account.type,
      balance: account.balance,
      currency: account.currency_code || 'EUR',
      iban: account.iban || null
    }));

    const { data, error } = await supabase
      .from('bank_accounts')
      .upsert(accountsToInsert, { 
        onConflict: 'bridge_account_id',
        ignoreDuplicates: false 
      })
      .select();

    if (error) throw error;
    return data;
  }

  /**
   * Sauvegarder les transactions bancaires
   */
  static async saveTransactions(accountId, transactions) {
    if (!transactions || transactions.length === 0) return [];

    const transactionsToInsert = transactions.map(transaction => ({
      bank_account_id: accountId,
      bridge_transaction_id: transaction.id.toString(),
      description: transaction.description || transaction.raw_description || 'Transaction',
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category_name || null,
      is_imported_to_transactions: false
    }));

    const { data, error } = await supabase
      .from('bank_transactions')
      .upsert(transactionsToInsert, { 
        onConflict: 'bridge_transaction_id',
        ignoreDuplicates: true 
      })
      .select();

    if (error) throw error;
    return data;
  }
}

module.exports = BankConnection;