
async function benchmark() {
  const baseUrl = 'http://localhost:3000';
  const endpoints = [
    '/api/health',
    '/api/system/webhook-url'
  ];

  console.log('🚀 Iniciando Benchmark de Sistema...');
  console.log('-----------------------------------');

  for (const endpoint of endpoints) {
    const start = Date.now();
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      const duration = Date.now() - start;
      console.log(`✅ [${endpoint}] Status: ${response.status} - Tempo: ${duration}ms`);
    } catch (error: any) {
      const duration = Date.now() - start;
      console.log(`❌ [${endpoint}] Erro: ${error.message} - Tempo: ${duration}ms`);
    }
  }

  console.log('-----------------------------------');
  console.log('🏁 Benchmark concluído.');
}

benchmark();
