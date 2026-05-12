
import { db } from '../src/lib/firebase';
import { getCustomers, getTickets } from '../src/lib/db';

async function testSystem() {
  console.log('🧪 Iniciando Testes de Integridade e Latência...');
  console.log('-------------------------------------------');

  const start = Date.now();
  
  try {
    // Teste de conexão com o Banco
    console.log('📡 Testando conexão com Firestore...');
    const connStart = Date.now();
    // Simulando o que o app faz
    await new Promise((resolve, reject) => {
      const unsub = getCustomers((data) => {
        unsub();
        resolve(data);
      });
      setTimeout(() => reject(new Error('Timeout na conexão com Firestore')), 5000);
    });
    console.log(`✅ Conexão Firestore: OK (${Date.now() - connStart}ms)`);

    // Teste de Latência da API Local
    console.log('🌐 Testando Latência da API Express...');
    const apiStart = Date.now();
    const res = await fetch('http://localhost:3000/api/health');
    const status = await res.json();
    console.log(`✅ API Health: ${status.status} (${Date.now() - apiStart}ms)`);

    // Teste de Memória (Node Process)
    const usage = process.memoryUsage();
    console.log(`📊 Uso de Memória (Heap): ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB`);

    console.log('-------------------------------------------');
    console.log(`✨ Todos os testes de backend concluídos em ${Date.now() - start}ms`);
    process.exit(0);
  } catch (err: any) {
    console.error(`❌ Falha no teste: ${err.message}`);
    process.exit(1);
  }
}

testSystem();
