import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeHash,
  verifyChain,
  recordDecision,
  isAiAuditEnabled,
} from './ai-audit.service';
import type { AuditDeps, DecisionRecord } from './ai-audit.service';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.AI_AUDIT_ENABLED;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ─── isAiAuditEnabled ────────────────────────────────────────────────────────

describe('isAiAuditEnabled', () => {
  it('default false quando env ausente', () => {
    expect(isAiAuditEnabled()).toBe(false);
  });

  it('false para valores inválidos ou vazios', () => {
    process.env.AI_AUDIT_ENABLED = 'banana';
    expect(isAiAuditEnabled()).toBe(false);
    process.env.AI_AUDIT_ENABLED = '';
    expect(isAiAuditEnabled()).toBe(false);
  });

  it('true quando explicitamente "true"', () => {
    process.env.AI_AUDIT_ENABLED = 'true';
    expect(isAiAuditEnabled()).toBe(true);
  });

  it('case-insensitive e tolera espaços', () => {
    process.env.AI_AUDIT_ENABLED = '  TRUE ';
    expect(isAiAuditEnabled()).toBe(true);
  });
});

// ─── computeHash ─────────────────────────────────────────────────────────────

describe('computeHash', () => {
  it('gera um hex string de 64 caracteres (SHA-256)', () => {
    const hash = computeHash('genesis', { test: true }, '2026-01-01T00:00:00.000Z');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é determinístico — mesma entrada = mesmo hash', () => {
    const payload = { intent: 'support_billing', score: 1 };
    const h1 = computeHash('abc123', payload, '2026-07-05T12:00:00.000Z');
    const h2 = computeHash('abc123', payload, '2026-07-05T12:00:00.000Z');
    expect(h1).toBe(h2);
  });

  it('muda se o prev_hash muda', () => {
    const payload = { a: 1 };
    const h1 = computeHash('hash-a', payload, '2026-01-01T00:00:00.000Z');
    const h2 = computeHash('hash-b', payload, '2026-01-01T00:00:00.000Z');
    expect(h1).not.toBe(h2);
  });

  it('muda se o payload muda', () => {
    const h1 = computeHash('genesis', { a: 1 }, '2026-01-01T00:00:00.000Z');
    const h2 = computeHash('genesis', { a: 2 }, '2026-01-01T00:00:00.000Z');
    expect(h1).not.toBe(h2);
  });

  it('muda se o createdAt muda', () => {
    const h1 = computeHash('genesis', { a: 1 }, '2026-01-01T00:00:00.000Z');
    const h2 = computeHash('genesis', { a: 1 }, '2026-01-01T00:00:01.000Z');
    expect(h1).not.toBe(h2);
  });
});

// ─── verifyChain ─────────────────────────────────────────────────────────────

function makeRecord(
  overrides: Partial<DecisionRecord> & { id: string },
): DecisionRecord {
  const payload = overrides.payload ?? { test: true };
  const createdAt = overrides.created_at ?? '2026-07-01T00:00:00.000Z';
  const prevHash = overrides.prev_hash ?? 'genesis';
  const hash = overrides.hash ?? computeHash(prevHash, payload, createdAt);

  return {
    id: overrides.id,
    tenant_id: 't1',
    decision_type: overrides.decision_type ?? 'agent_response',
    payload,
    prev_hash: prevHash,
    hash,
    created_at: createdAt,
  };
}

describe('verifyChain', () => {
  it('lista vazia é válida', async () => {
    const result = await verifyChain([]);
    expect(result.valid).toBe(true);
  });

  it('registro único com prev_hash=genesis é válido', async () => {
    const r = makeRecord({ id: '1', prev_hash: 'genesis' });
    const result = await verifyChain([r]);
    expect(result.valid).toBe(true);
  });

  it('cadeia de 3 registros íntegra verifica ok', async () => {
    const r1 = makeRecord({ id: '1', prev_hash: 'genesis', created_at: '2026-07-01T00:00:00.000Z' });
    const r2 = makeRecord({ id: '2', prev_hash: r1.hash, created_at: '2026-07-01T00:01:00.000Z' });
    const r3 = makeRecord({ id: '3', prev_hash: r2.hash, created_at: '2026-07-01T00:02:00.000Z' });
    const result = await verifyChain([r3, r1, r2]); // fora de ordem
    expect(result.valid).toBe(true);
  });

  it('prev_hash quebrado é detectado', async () => {
    const r1 = makeRecord({ id: '1', prev_hash: 'genesis', created_at: '2026-07-01T00:00:00.000Z' });
    const r2 = makeRecord({ id: '2', prev_hash: 'WRONG_HASH', created_at: '2026-07-01T00:01:00.000Z' });
    const result = await verifyChain([r1, r2]);
    expect(result.valid).toBe(false);
    expect(result.invalidIndex).toBe(1);
    expect(result.reason).toContain('Hash chain broken');
  });

  it('payload adulterado é detectado (hash mismatch)', async () => {
    const r1 = makeRecord({ id: '1', prev_hash: 'genesis', created_at: '2026-07-01T00:00:00.000Z' });
    const hash2 = computeHash(r1.hash, { original: true }, '2026-07-01T00:01:00.000Z');
    // payload foi adulterado depois de gerar o hash
    const r2: DecisionRecord = {
      id: '2',
      tenant_id: 't1',
      decision_type: 'agent_response',
      payload: { tampered: true },
      prev_hash: r1.hash,
      hash: hash2,
      created_at: '2026-07-01T00:01:00.000Z',
    };
    const result = await verifyChain([r1, r2]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Hash mismatch');
  });

  it('verificaChain é tolerante a ordem (ordena por created_at)', async () => {
    const r1 = makeRecord({ id: '1', prev_hash: 'genesis', created_at: '2026-07-01T00:00:00.000Z' });
    const r2 = makeRecord({ id: '2', prev_hash: r1.hash, created_at: '2026-07-01T00:01:00.000Z' });
    const r3 = makeRecord({ id: '3', prev_hash: r2.hash, created_at: '2026-07-01T00:02:00.000Z' });

    // Embaralhado
    const result = await verifyChain([r2, r3, r1]);
    expect(result.valid).toBe(true);
  });
});

// ─── recordDecision (pure, com deps injetáveis) ──────────────────────────────

describe('recordDecision', () => {
  it('flag off retorna false sem chamar deps', async () => {
    const getLastHash = vi.fn();
    const insertDecision = vi.fn();
    const deps: AuditDeps = { getLastHash, insertDecision };

    const result = await recordDecision(
      { tenantId: 't1', decisionType: 'agent_response', payload: { test: true } },
      deps,
    );
    expect(result).toBe(false);
    expect(getLastHash).not.toHaveBeenCalled();
    expect(insertDecision).not.toHaveBeenCalled();
  });

  it('flag on grava com hash encadeado (genesis no primeiro)', async () => {
    process.env.AI_AUDIT_ENABLED = 'true';
    const getLastHash = vi.fn().mockResolvedValue(null); // sem registros anteriores
    const insertDecision = vi.fn().mockResolvedValue(undefined);
    const deps: AuditDeps = { getLastHash, insertDecision };

    const result = await recordDecision(
      { tenantId: 't1', decisionType: 'agent_response', payload: { intent: 'support_billing' } },
      deps,
    );
    expect(result).toBe(true);
    expect(getLastHash).toHaveBeenCalledWith('t1');
    expect(insertDecision).toHaveBeenCalledTimes(1);

    const inserted = insertDecision.mock.calls[0][0];
    expect(inserted.tenant_id).toBe('t1');
    expect(inserted.decision_type).toBe('agent_response');
    expect(inserted.prev_hash).toBe('genesis');
    expect(inserted.hash).toHaveLength(64);
    expect(inserted.payload).toEqual({ intent: 'support_billing' });
  });

  it('flag on encadeia com hash anterior existente', async () => {
    process.env.AI_AUDIT_ENABLED = 'true';
    const prevRecordHash = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
    const getLastHash = vi.fn().mockResolvedValue(prevRecordHash);
    const insertDecision = vi.fn().mockResolvedValue(undefined);
    const deps: AuditDeps = { getLastHash, insertDecision };

    const result = await recordDecision(
      { tenantId: 't1', decisionType: 'escalation', payload: { reason: 'self_check_failed' } },
      deps,
    );
    expect(result).toBe(true);
    expect(insertDecision.mock.calls[0][0].prev_hash).toBe(prevRecordHash);
  });

  it('falha de insert não propaga exceção (fail-open)', async () => {
    process.env.AI_AUDIT_ENABLED = 'true';
    const getLastHash = vi.fn().mockResolvedValue(null);
    const insertDecision = vi.fn().mockRejectedValue(new Error('DB down'));
    const deps: AuditDeps = { getLastHash, insertDecision };

    // Não deve lançar
    const result = await recordDecision(
      { tenantId: 't1', decisionType: 'agent_response', payload: { test: true } },
      deps,
    );
    expect(result).toBe(false);
    expect(insertDecision).toHaveBeenCalled();
  });

  it('falha de getLastHash também é fail-open', async () => {
    process.env.AI_AUDIT_ENABLED = 'true';
    const getLastHash = vi.fn().mockRejectedValue(new Error('connection refused'));
    const insertDecision = vi.fn();
    const deps: AuditDeps = { getLastHash, insertDecision };

    const result = await recordDecision(
      { tenantId: 't1', decisionType: 'block', payload: { reason: 'guardrail' } },
      deps,
    );
    expect(result).toBe(false);
    expect(insertDecision).not.toHaveBeenCalled();
  });

  it('payload com campos opcionais vazios', async () => {
    process.env.AI_AUDIT_ENABLED = 'true';
    const getLastHash = vi.fn().mockResolvedValue(null);
    const insertDecision = vi.fn().mockResolvedValue(undefined);
    const deps: AuditDeps = { getLastHash, insertDecision };

    await recordDecision(
      { tenantId: 't1', decisionType: 'tool_call', payload: {} },
      deps,
    );
    expect(insertDecision).toHaveBeenCalled();
    expect(insertDecision.mock.calls[0][0].payload).toEqual({});
  });
});
