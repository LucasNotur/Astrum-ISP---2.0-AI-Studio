import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mock-model'),
}));
vi.mock('../cache/redis.client', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
}));
vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../logging/logger', () => ({
  infraLogger: { warn: vi.fn(), info: vi.fn() },
}));

import { generateObject } from 'ai';
import { supabaseAdmin } from '../database/supabase.client';
import {
  isConstitutionalLoopEnabled,
  getConstitution,
  saveConstitution,
  critiqueAndRevise,
  DEFAULT_PRINCIPLES,
} from './constitution.service';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockGenerateObject = generateObject as ReturnType<typeof vi.fn>;

function chainMock(data: any = null, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    upsert: vi.fn().mockResolvedValue({ error }),
  };
  return chain;
}

describe('constitution.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (process.env as any).CONSTITUTIONAL_LOOP_ENABLED;
  });

  it('isConstitutionalLoopEnabled false by default', () => {
    expect(isConstitutionalLoopEnabled()).toBe(false);
  });

  it('isConstitutionalLoopEnabled true when set', () => {
    process.env.CONSTITUTIONAL_LOOP_ENABLED = 'true';
    expect(isConstitutionalLoopEnabled()).toBe(true);
  });

  it('getConstitution returns defaults when no row exists', async () => {
    mockFrom.mockReturnValue(chainMock(null));
    const result = await getConstitution('t1');
    expect(result).toEqual([...DEFAULT_PRINCIPLES]);
  });

  it('getConstitution returns stored principles', async () => {
    const custom = ['Princípio A', 'Princípio B'];
    mockFrom.mockReturnValue(chainMock({ principles: custom }));
    const result = await getConstitution('t1');
    expect(result).toEqual(custom);
  });

  it('saveConstitution rejects > 10 principles', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `P${i}`);
    const result = await saveConstitution('t1', many);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/10/);
  });

  it('saveConstitution rejects long principles', async () => {
    const result = await saveConstitution('t1', ['a'.repeat(300)]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/280/);
  });

  it('saveConstitution succeeds with valid input', async () => {
    mockFrom.mockReturnValue(chainMock(null, null));
    const result = await saveConstitution('t1', ['Regra 1', 'Regra 2']);
    expect(result.ok).toBe(true);
  });

  it('critiqueAndRevise returns result from LLM', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { violates: true, principle_index: 0, revised_response: 'Versão corrigida' },
    });
    const result = await critiqueAndRevise('resposta original', ['Regra 1']);
    expect(result.violates).toBe(true);
    expect(result.revised_response).toBe('Versão corrigida');
  });

  it('critiqueAndRevise fails open on error', async () => {
    mockGenerateObject.mockRejectedValue(new Error('timeout'));
    const result = await critiqueAndRevise('resposta', ['Regra']);
    expect(result.violates).toBe(false);
    expect(result.revised_response).toBeNull();
  });
});
