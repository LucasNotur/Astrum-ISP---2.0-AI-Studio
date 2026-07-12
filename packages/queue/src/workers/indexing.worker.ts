import { Worker, Queue, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { chunkTechnicalManual } from '../../../../apps/api/src/infrastructure/rag/document-chunker.service';
import { generateEmbeddingsBatch } from '../../../../apps/api/src/adapters/ai/embedding.service';
import { ensureCollection, upsertPoints } from '../../../../apps/api/src/adapters/vector/qdrant.adapter';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { iaLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import crypto from 'node:crypto';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

export type IndexingEntityType = 'document' | 'article';

export interface IndexingJobData {
  tenantId: string;
  documentId: string;   // ID do knowledge_documents (quando entityType='document')
  filename: string;
  fileType: string;
  textContent: string;  // texto já extraído
  entityType?: IndexingEntityType;  // default 'document'
  articleId?: string;   // ID do knowledge_articles (quando entityType='article')
}

// Queue exportada para que outros módulos possam enfileirar jobs de indexação
const isMockRedis = !(connection as any).options;
export const aiProcessingQueue: Pick<Queue, 'add'> = isMockRedis
  ? { add: async () => ({ id: 'mock' }) as any }
  : new Queue('astrum:ai-processing', { connection: connection as any });

async function indexDocument(job: Job<IndexingJobData>): Promise<void> {
  const { tenantId, documentId, filename, fileType, textContent, entityType = 'document', articleId } = job.data;

  iaLogger.info({ tenantId, documentId, articleId, entityType, filename }, 'Iniciando indexação RAG');

  // 1. Chunking
  const chunks = chunkTechnicalManual(textContent);
  iaLogger.info({ documentId, chunksCount: chunks.length }, 'Documento dividido em chunks');

  // 2. Garantir coleção no Qdrant
  await ensureCollection(tenantId);

  // 3. Gerar embeddings em batch
  const chunkTexts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddingsBatch(chunkTexts, tenantId);

  // 4. Inserir no Qdrant (payload diferencia documento de artigo para permitir filtros futuros)
  const points = chunks.map((chunk, i) => {
    const vector = embeddings[i];
    if (!vector) throw new Error(`Embedding ausente para o chunk ${i} (${chunks.length} chunks, ${embeddings.length} embeddings)`);
    return {
    id: crypto.randomUUID(),
    vector,
    payload: {
      document_id: entityType === 'document' ? documentId : null,
      article_id: entityType === 'article' ? articleId : null,
      entity_type: entityType,
      tenant_id: tenantId,
      filename,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      file_type: fileType,
      created_at: new Date().toISOString(),
    },
  };
  });

  await upsertPoints(tenantId, points);

  // 5. Atualizar status na tabela correta
  if (entityType === 'article' && articleId) {
    await supabaseAdmin.from('knowledge_articles').update({
      ingest_status: 'indexed',
      updated_at: new Date().toISOString(),
    }).eq('id', articleId);
    iaLogger.info({ tenantId, articleId, chunksCount: chunks.length }, '✅ Artigo KB indexado no RAG');
  } else {
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'indexed',
      chunks_count: chunks.length,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    iaLogger.info({ tenantId, documentId, chunksCount: chunks.length }, '✅ Documento indexado no RAG');
  }
}

export function createIndexingWorker() {
  const worker = new Worker<IndexingJobData>(
    'astrum:ai-processing',
    indexDocument,
    { connection: connection as any, concurrency: 2 }
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'indexing-worker');

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { entityType = 'document', documentId, articleId } = job.data;
    if (entityType === 'article' && articleId) {
      await supabaseAdmin.from('knowledge_articles').update({
        ingest_status: 'failed',
        updated_at: new Date().toISOString(),
      }).eq('id', articleId);
    } else {
      await supabaseAdmin.from('knowledge_documents').update({
        status: 'failed',
        error_message: err.message,
      }).eq('id', documentId);
    }
  });

  return worker;
}
