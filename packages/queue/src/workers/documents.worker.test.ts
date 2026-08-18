import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// vi.hoisted garante que as factories do vi.mock enxerguem os mocks (vitest hoista o vi.mock).
const { mockSingle, mockUpdate, mockEq, mockSelect, mockFrom, mockGetContent, mockExtractText, mockQueueAdd } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockGetContent: vi.fn(),
  mockExtractText: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  connection: {},
  default: {},
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: mockFrom },
}));
vi.mock('../../../../apps/api/src/adapters/storage/r2.adapter', () => ({
  r2Adapter: { getContent: mockGetContent },
}));
vi.mock('../../../../apps/api/src/infrastructure/rag/document-extractor.service', () => ({
  extractText: mockExtractText,
}));
vi.mock('./indexing.worker', () => ({
  aiProcessingQueue: { add: mockQueueAdd },
}));

import { processDocumentUploaded, type DocumentUploadedJobData } from './documents.worker';

function fakeJob(data: DocumentUploadedJobData): Job<DocumentUploadedJobData> {
  return { data } as unknown as Job<DocumentUploadedJobData>;
}

const JOB = {
  documentId: 'doc-1',
  fileKey: 'tenants/t1/documents/manual.pdf',
  filename: 'manual.pdf',
  tenantId: 't1',
  outboxId: 'outbox-1',
};

describe('documents.worker — processDocumentUploaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cadeia do supabase-js: from → select/update → eq → single
    const chain = {
      select: mockSelect.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
    };
    mockFrom.mockReturnValue(chain);
  });

  it('caminho feliz: baixa do R2, extrai texto e enfileira com entityType document', async () => {
    mockSingle.mockResolvedValue({ data: { file_type: 'pdf' }, error: null });
    mockGetContent.mockResolvedValue(Buffer.from('%PDF-1.4 fake', 'utf-8'));
    mockExtractText.mockResolvedValue('conteúdo extraído do manual');
    mockQueueAdd.mockResolvedValue({ id: 'job-1' });

    await processDocumentUploaded(fakeJob(JOB));

    expect(mockFrom).toHaveBeenCalledWith('knowledge_documents');
    expect(mockSelect).toHaveBeenCalledWith('file_type');
    expect(mockEq).toHaveBeenCalledWith('id', 'doc-1');
    expect(mockGetContent).toHaveBeenCalledWith(JOB.fileKey);
    expect(mockExtractText).toHaveBeenCalledWith(expect.any(Buffer), 'pdf');
    expect(mockQueueAdd).toHaveBeenCalledWith('index-document', expect.objectContaining({
      tenantId: 't1',
      documentId: 'doc-1',
      filename: 'manual.pdf',
      fileType: 'pdf',
      textContent: 'conteúdo extraído do manual',
      entityType: 'document',
    }));
  });

  it('texto vazio → marca failed no banco e NÃO enfileira indexação', async () => {
    mockSingle.mockResolvedValue({ data: { file_type: 'txt' }, error: null });
    mockGetContent.mockResolvedValue(Buffer.from('   \n  ', 'utf-8'));
    mockExtractText.mockResolvedValue('   \n  ');

    await processDocumentUploaded(fakeJob(JOB));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error_message: expect.stringContaining('Não foi possível extrair texto'),
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'doc-1');
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('documento não encontrado no banco → lança erro (não silencia)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'não existe' } });

    await expect(processDocumentUploaded(fakeJob(JOB)))
      .rejects.toThrow('knowledge_documents doc-1 não encontrado (tenant t1)');

    expect(mockGetContent).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('erro do supabase no select → lança erro (não silencia)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } });

    await expect(processDocumentUploaded(fakeJob(JOB)))
      .rejects.toThrow('knowledge_documents doc-1 não encontrado (tenant t1)');

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
