import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  connection: {},
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [{ id: 't1' }, { id: 't2' }] }),
      }),
    }),
  },
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));

const mockRunNightlyReflection = vi.fn();
const mockIsNightlyBrainEnabled = vi.fn();
vi.mock('../../../../apps/api/src/domain/ia/nightly-brain/nightly-brain.service', () => ({
  isNightlyBrainEnabled: () => mockIsNightlyBrainEnabled(),
  runNightlyReflection: (...args: any[]) => mockRunNightlyReflection(...args),
}));

const mockExecuteSuggestedActions = vi.fn();
const mockRecordExecutedActions = vi.fn();
const mockIsNightlyActEnabled = vi.fn();
vi.mock('../../../../apps/api/src/domain/ia/nightly-brain/nightly-actions.service', () => ({
  isNightlyActEnabled: () => mockIsNightlyActEnabled(),
  executeSuggestedActions: (...args: any[]) => mockExecuteSuggestedActions(...args),
  recordExecutedActions: (...args: any[]) => mockRecordExecutedActions(...args),
}));

let capturedProcessor: any = null;

vi.mock('bullmq', () => {
  return {
    Worker: class MockWorker {
      constructor(_name: string, processor: any) {
        capturedProcessor = processor;
      }
      on() { return this; }
    },
    Queue: class MockQueue {
      async add() {}
    },
  };
});

import { createNightlyBrainWorker } from './nightly-brain.worker';

describe('nightly-brain.worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NIGHTLY_BRAIN_ENABLED;
    delete process.env.NIGHTLY_BRAIN_ACT_ENABLED;
  });

  it('não cria worker quando flag desligada', () => {
    mockIsNightlyBrainEnabled.mockReturnValue(false);
    const w = createNightlyBrainWorker();
    expect(w).toBeNull();
  });

  it('cria worker quando flag ligada', () => {
    mockIsNightlyBrainEnabled.mockReturnValue(true);
    const w = createNightlyBrainWorker();
    expect(w).not.toBeNull();
  });

  it('chama runNightlyReflection com o tenantId do job', async () => {
    mockIsNightlyBrainEnabled.mockReturnValue(true);
    mockIsNightlyActEnabled.mockReturnValue(false);
    mockRunNightlyReflection.mockResolvedValue({
      hypotheses: [{ code: 'DIA_SAUDAVEL' }],
      actions: [],
    });

    createNightlyBrainWorker();
    const processor = capturedProcessor;
    await processor({ data: { tenantId: 'tenant-abc' }, id: 'job-1' });

    expect(mockRunNightlyReflection).toHaveBeenCalledWith('tenant-abc', expect.any(String));
  });

  it('executa ações quando NIGHTLY_BRAIN_ACT_ENABLED=true e há ações', async () => {
    mockIsNightlyBrainEnabled.mockReturnValue(true);
    mockIsNightlyActEnabled.mockReturnValue(true);
    const actions = [{ type: 'kb_scan', detail: 'test' }];
    mockRunNightlyReflection.mockResolvedValue({
      hypotheses: [{ code: 'KB_COMBUSTIVEL' }],
      actions,
    });
    mockExecuteSuggestedActions.mockResolvedValue([
      { ...actions[0], executed: true, result: '3/5 rascunhos' },
    ]);
    mockRecordExecutedActions.mockResolvedValue(undefined);

    createNightlyBrainWorker();
    const processor = capturedProcessor;
    await processor({ data: { tenantId: 'tenant-xyz' }, id: 'job-2' });

    expect(mockExecuteSuggestedActions).toHaveBeenCalledWith('tenant-xyz', actions);
    expect(mockRecordExecutedActions).toHaveBeenCalled();
  });

  it('NÃO executa ações quando flag de ação desligada', async () => {
    mockIsNightlyBrainEnabled.mockReturnValue(true);
    mockIsNightlyActEnabled.mockReturnValue(false);
    mockRunNightlyReflection.mockResolvedValue({
      hypotheses: [{ code: 'KB_COMBUSTIVEL' }],
      actions: [{ type: 'kb_scan', detail: 'test' }],
    });

    createNightlyBrainWorker();
    const processor = capturedProcessor;
    await processor({ data: { tenantId: 'tenant-no-act' }, id: 'job-3' });

    expect(mockExecuteSuggestedActions).not.toHaveBeenCalled();
  });

  it('falha na reflexão é fail-open (não lança)', async () => {
    mockIsNightlyBrainEnabled.mockReturnValue(true);
    mockRunNightlyReflection.mockRejectedValue(new Error('db down'));

    createNightlyBrainWorker();
    const processor = capturedProcessor;
    await expect(
      processor({ data: { tenantId: 'tenant-fail' }, id: 'job-4' }),
    ).resolves.not.toThrow();
  });
});
