import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isSemanticCacheEnabled,
  isModelCascadeEnabled,
  isEligibleForCache,
} from './semantic-cache.service';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.SEMANTIC_CACHE_ENABLED;
  delete process.env.MODEL_CASCADE_ENABLED;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('isSemanticCacheEnabled', () => {
  it('default false', () => {
    expect(isSemanticCacheEnabled()).toBe(false);
  });

  it('true com env setada', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isSemanticCacheEnabled()).toBe(true);
  });
});

describe('isModelCascadeEnabled', () => {
  it('default false', () => {
    expect(isModelCascadeEnabled()).toBe(false);
  });

  it('true com env setada', () => {
    process.env.MODEL_CASCADE_ENABLED = 'true';
    expect(isModelCascadeEnabled()).toBe(true);
  });
});

describe('isEligibleForCache', () => {
  it('flag off → false', () => {
    expect(isEligibleForCache({ dataSource: 'qdrant' })).toBe(false);
  });

  it('qdrant sem dbContext sem tools → elegível (flag on)', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isEligibleForCache({ dataSource: 'qdrant', toolsExecuted: [] })).toBe(true);
  });

  it('dataSource supabase → NÃO elegível (dados pessoais)', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isEligibleForCache({ dataSource: 'supabase' })).toBe(false);
  });

  it('dbContext preenchido → NÃO elegível', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isEligibleForCache({ dataSource: 'qdrant', dbContext: 'dados do cliente' })).toBe(false);
  });

  it('tools executadas → NÃO elegível', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isEligibleForCache({
      dataSource: 'qdrant',
      toolsExecuted: [{ name: 'check_invoice' }],
    })).toBe(false);
  });

  it('dbContext vazio (string "") é elegível', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isEligibleForCache({ dataSource: 'qdrant', dbContext: '', toolsExecuted: [] })).toBe(true);
  });

  it('dataSource none → não elegível', () => {
    process.env.SEMANTIC_CACHE_ENABLED = 'true';
    expect(isEligibleForCache({ dataSource: 'none' })).toBe(false);
  });
});

describe('cosine similarity', () => {
  it('vetores idênticos = 1', () => {
    const v = [0.5, 0.3, 0.1];
    const dot = v.reduce((s, x) => s + x * x, 0);
    const norm = Math.sqrt(dot);
    expect(dot / (norm * norm)).toBeCloseTo(1, 10);
  });

  it('vetores ortogonais = 0', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    expect(dot).toBe(0);
  });
});
