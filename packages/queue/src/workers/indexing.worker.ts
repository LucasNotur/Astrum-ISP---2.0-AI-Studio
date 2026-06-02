import { Worker, type Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { chunkTechnicalManual } from '../../../apps/api/src/infrastructure/rag/document-chunker.service';
import { generateEmbeddingsBatch } from '../../../apps/api/src/adapters/ai/embedding.service';
import { ensureCollection, upsertPoints } from '../../../apps/api/src/adapters/vector/qdrant.adapter';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { iaLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import crypto from 'node:crypto';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';

export interface IndexingJobData {
  tenantId: string;
  documentId: string;
  filename: string;
  fileType: string;
  textContent: string;   // texto já extraído do PDF/DOCX
}

async function indexDocument(job: Job<IndexingJobData>): Promise<void> {
  const { tenantId, documentId, filename, fileType, textContent } = job.data;

  iaLogger.info({ tenantId, documentId, filename }, 'Iniciando indexação RAG');

  // 1. Chunking
  const chunks = chunkTechnicalManual(textContent);
  iaLogger.info({ documentId, chunksCount: chunks.length }, 'Documento dividido em chunks');

  // 2. Garantir coleção no Qdrant
  await ensureCollection(tenantId);

  // 3. Gerar embeddings em batch
  const chunkTexts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddingsBatch(chunkTexts, tenantId);

  // 4. Inserir no Qdrant
  const points = chunks.map((chunk, i) => ({
    id: crypto.randomUUID(),
    vector: embeddings[i],
    payload: {
      document_id: documentId,
      tenant_id: tenantId,
      filename,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      file_type: fileType,
      created_at: new Date().toISOString(),
    },
  }));

  await upsertPoints(tenantId, points);

  // 5. Atualizar status no Supabase
  await supabaseAdmin.from('knowledge_documents').update({
    status: 'indexed',
    chunks_count: chunks.length,
    updated_at: new Date().toISOString(),
  }).eq('id', documentId);

  iaLogger.info({ tenantId, documentId, chunksCount: chunks.length }, '✅ Documento indexado no RAG');
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
    if (job) {
      await supabaseAdmin.from('knowledge_documents').update({
        status: 'failed',
        error_message: err.message,
      }).eq('id', job.data.documentId);
    }
  });

  return worker;
}
