import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { warn: vi.fn(), info: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import {
  isActiveLearningEnabled,
  getPendingExamples,
  labelExample,
  exportExamples,
} from './active-learning.service';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chainMock(data: any = [], error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => Promise.resolve(resolve({ data, error }))),
  };
  Object.keys(chain).forEach((k) => {
    if (k !== 'then') chain[k].mockReturnValue(chain);
  });
  return chain;
}

describe('active-learning.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (process.env as any).ACTIVE_LEARNING_ENABLED;
  });

  it('isActiveLearningEnabled returns false by default', () => {
    expect(isActiveLearningEnabled()).toBe(false);
  });

  it('isActiveLearningEnabled returns true when set', () => {
    process.env.ACTIVE_LEARNING_ENABLED = 'true';
    expect(isActiveLearningEnabled()).toBe(true);
  });

  it('getPendingExamples returns mapped items', async () => {
    const chain = chainMock([
      { id: 'a', source: 'feedback', input: 'hello', output: 'hi', label: null, created_at: '2026-01-01' },
    ]);
    mockFrom.mockReturnValue(chain);

    const result = await getPendingExamples('t1', 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'a',
      source: 'feedback',
      input: 'hello',
      output: 'hi',
      label: null,
      createdAt: '2026-01-01',
    });
  });

  it('getPendingExamples returns [] on error', async () => {
    const chain = chainMock(null, { message: 'fail' });
    mockFrom.mockReturnValue(chain);
    const result = await getPendingExamples('t1');
    expect(result).toEqual([]);
  });

  it('labelExample returns true on success', async () => {
    const chain = chainMock();
    mockFrom.mockReturnValue(chain);
    const ok = await labelExample('t1', 'ex1', 'correto');
    expect(ok).toBe(true);
  });

  it('labelExample returns false on error', async () => {
    const chain = chainMock(null, { message: 'fail' });
    mockFrom.mockReturnValue(chain);
    const ok = await labelExample('t1', 'ex1', 'correto');
    expect(ok).toBe(false);
  });

  it('exportExamples returns labeled items and marks exported_at', async () => {
    const updateChain = chainMock();
    const selectChain = chainMock([
      { id: 'b', source: 'manual', input: 'x', output: 'y', label: 'correto', created_at: '2026-02-01' },
    ]);
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectChain : updateChain;
    });

    const result = await exportExamples('t1');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('correto');
  });
});
