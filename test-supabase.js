const supabase = require('./config/supabase');

async function testConnection() {
  try {
    console.log('🔍 Test de connexion à Supabase...');
    
    // Test 1: Récupérer les catégories de revenus
    const { data, error } = await supabase
      .from('categories_revenus')
      .select('*');
    
    if (error) throw error;
    
    console.log('✅ Connexion réussie !');
    console.log('📊 Catégories de revenus trouvées:', data.length);
    console.log(data);
    
  } catch (error) {
    console.error('❌ Erreur de connexion:', error.message);
  }
}

testConnection();