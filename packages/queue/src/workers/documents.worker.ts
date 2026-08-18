import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { iaLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { r2Adapter } from '../../../../apps/api/src/adapters/storage/r2.adapter';
import { extractText } from '../../../../apps/api/src/infrastructure/rag/document-extractor.service';
import { aiProcessingQueue, type IndexingJobData } from './indexing.worker';

export interface DocumentUploadedJobData {
  documentId: string;
  fileKey: string;
  filename: string;
  tenantId: string;
  outboxId?: string;
}

export async function processDocumentUploaded(job: Job<DocumentUploadedJobData>): Promise<void> {
  const { documentId, fileKey, filename, tenantId } = job.data;

  const { data: doc, error } = await supabaseAdmin
    .from('knowledge_documents')
    .select('file_type')
    .eq('id', documentId)
    .single();
  if (error || !doc) {
    throw new Error(`knowledge_documents ${documentId} não encontrado (tenant ${tenantId})`);
  }

  const buffer = await r2Adapter.getContent(fileKey);
  const text = await extractText(buffer, doc.file_type);

  if (!text || !text.trim()) {
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'failed',
      error_message: 'Não foi possível extrair texto do arquivo (vazio, corrompido ou PDF escaneado sem OCR).',
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    iaLogger.warn({ tenantId, documentId }, 'Documents worker: extração vazia — marcado failed');
    return;
  }

  const jobData: IndexingJobData = {
    tenantId,
    documentId,
    filename,
    fileType: doc.file_type,
    textContent: text,
    entityType: 'document',
  };
  await aiProcessingQueue.add('index-document', jobData);
  iaLogger.info(
    { tenantId, documentId, chars: text.length },
    'Documents worker: texto extraído, enfileirado pra indexação',
  );
}

export function createDocumentsWorker() {
  const worker = new Worker<DocumentUploadedJobData>('documents', processDocumentUploaded, {
    connection: connection as any,
    concurrency: 2,
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'documents-worker');

  worker.on('failed', async (job, err) => {
    if (!job) return;
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'failed',
      error_message: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', job.data.documentId);
  });

  return worker;
}
