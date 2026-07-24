import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  connection: {},
  default: {},
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));
vi.mock('../../../../apps/api/src/adapters/whatsapp/history-import.service', () => ({
  importWhatsAppHistory: vi.fn(),
}));

import { processHistoryImportJob } from './history-import.worker';
import { importWhatsAppHistory } from '../../../../apps/api/src/adapters/whatsapp/history-import.service';

describe('F6-01 — history-import worker', () => {
  it('delega para importWhatsAppHistory e retorna o resultado', async () => {
    const result = {
      chatsFound: 5,
      conversationsCreated: 3,
      messagesImported: 42,
      duplicatesSkipped: 2,
    };
    vi.mocked(importWhatsAppHistory).mockResolvedValue(result);

    const job = { id: 'job-1', data: { tenantId: 't1', instanceName: 'inst-1' } } as any;
    const out = await processHistoryImportJob(job);

    expect(importWhatsAppHistory).toHaveBeenCalledWith('t1', 'inst-1');
    expect(out).toEqual(result);
  });

  it('propaga erro do service', async () => {
    vi.mocked(importWhatsAppHistory).mockRejectedValue(new Error('Evolution down'));

    const job = { id: 'job-2', data: { tenantId: 't1', instanceName: 'inst-2' } } as any;
    await expect(processHistoryImportJob(job)).rejects.toThrow('Evolution down');
  });
});
