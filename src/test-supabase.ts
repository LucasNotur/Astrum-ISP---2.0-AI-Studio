import { supabase } from './lib/supabase';
import { supabaseAdmin } from './lib/supabaseAdmin';

async function testConnection() {
  console.log('🔌 Testando conexão com Supabase...');

  // Teste 1: conexão básica
  const { error } = await supabase.from('_test_connection').select('*').limit(1);
  if (error && !error.message.includes('does not exist') && !error.message.includes('schema cache')) {
    console.error('❌ Falha na conexão:', error.message);
    process.exit(1);
  }
  console.log('✅ Conexão básica: OK');

  // Teste 2: admin client
  const { data, error: adminError } = await supabaseAdmin.from('idempotency_keys').select('*').limit(1);

  if (adminError && !adminError.message.includes('schema cache')) {
    console.error('❌ Falha no cliente admin:', adminError.message);
  } else {
    console.log('✅ Cliente admin: OK');
    if (adminError?.message.includes('schema cache')) {
       console.log('📋 Tabelas idempotency_keys e dead_letter_queue AINDA NÃO EXISTEM. Por favor, execute as migrations no SQL Editor do Supabase.');
    } else {
       console.log('📋 Migrations detectadas com sucesso na base de dados.');
    }
  }
}

testConnection();
