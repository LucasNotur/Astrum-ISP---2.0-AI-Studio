import { db } from '../src/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { embeddingProvider } from '../src/lib/embeddingProvider';
import { vectorStore } from '../src/lib/vectorStore';
import redis from '../src/lib/redis';

// Reindexar toda a base de conhecimento existente no banco vetorial
// Usar quando trocar de provedor vetorial ou reconstruir a coleção

async function reindexAll(tenantId?: string) {
  const q = tenantId
    ? query(collection(db, 'knowledge_base'), where('tenant_id', '==', tenantId))
    : collection(db, 'knowledge_base');

  const snapshot = await getDocs(q);
  const docs = snapshot.docs;

  console.log(`Reindexando ${docs.length} artigos...`);

  const redisKey = `reindex_progress:${tenantId || 'all'}`;
  await redis.set(redisKey, JSON.stringify({ total: docs.length, indexed: 0, status: 'running', started_at: Date.now() }));

  // Processar em batches de 10 para não sobrecarregar a API de embeddings
  for (let i = 0; i < docs.length; i += 10) {
    const batch = docs.slice(i, i + 10);
    const texts = batch.map(d => `${d.data().title}\n\n${d.data().content}`);
    const embeddings = await (await embeddingProvider).embedBatch(texts, tenantId);

    const vectorDocs = batch.map((d, idx) => ({
      id: d.id,
      text: d.data().content,
      embedding: embeddings[idx],
      metadata: {
        tenant_id: d.data().tenant_id,
        category: d.data().category ?? 'geral',
        title: d.data().title
      }
    }));

    await (await vectorStore).upsertBatch(vectorDocs, tenantId);
    console.log(`Progresso: ${Math.min(i + 10, docs.length)}/${docs.length}`);
    
    await redis.set(redisKey, JSON.stringify({ 
      total: docs.length, 
      indexed: Math.min(i + 10, docs.length), 
      status: 'running', 
      started_at: Date.now() 
    }), 'EX', 3600);
  }

  await redis.set(redisKey, JSON.stringify({ total: docs.length, indexed: docs.length, status: 'completed', started_at: Date.now() }), 'EX', 3600);
  console.log('Reindexação concluída!');
  process.exit(0);
}

reindexAll(process.argv[2]); // opcional: passar tenantId como argumento
