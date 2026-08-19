import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

/**
 * BILL-06 (segregação de funções): PUT /negotiation/policy audita todo afrouxamento de
 * alçada (audit_log imutável) e é FAIL-CLOSED — se a auditoria não gravar, a alteração
 * não é aplicada. Estes testes travam esse comportamento.
 */

const h = vi.hoisted(() => ({
  oldPolicy: {
    maxInstallments: 3,
    maxDiscountPct: 10,
    fineWaiverPerYear: 1,
    autoApproveUpToCents: 50000,
  } as any,
  auditInsert: vi.fn(async () => ({ data: null, error: null })),
  upsertPolicy: vi.fn(async () => undefined),
}));

vi.mock('../../infrastructure/database/supabase.client', () => {
  const supabaseAdmin = {
    from: vi.fn(() => ({ insert: h.auditInsert })),
  };
  return { supabaseAdmin, default: supabaseAdmin };
});

vi.mock('./negotiation-policy.service', async () => {
  const actual = await vi.importActual<typeof import('./negotiation-policy.service')>('./negotiation-policy.service');
  return {
    ...actual, // mantém describePolicyChange, validateProposal reais (puros)
    getPolicy: vi.fn(async () => ({ tenantId: TENANT, ...h.oldPolicy })),
    upsertPolicy: h.upsertPolicy,
  };
});

import { negotiationRoutes } from './negotiation.routes';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xxxx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
  });
  await app.register(negotiationRoutes);
  await app.ready();
  return app;
}

function auth(app: any, role = 'admin') {
  return `Bearer ${(app as any).jwt.sign({ userId: 'op-1', tenantId: TENANT, role })}`;
}

describe('PUT /api/v2/cobranca/negotiation/policy — BILL-06', () => {
  beforeEach(() => {
    h.auditInsert.mockClear();
    h.auditInsert.mockResolvedValue({ data: null, error: null });
    h.upsertPolicy.mockClear();
    h.oldPolicy = { maxInstallments: 3, maxDiscountPct: 10, fineWaiverPerYear: 1, autoApproveUpToCents: 50000 };
  });

  it('afrouxa a alçada (desconto sobe) → audita como loosened, aplica a mudança', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/cobranca/negotiation/policy',
      headers: { authorization: auth(app) },
      payload: { maxDiscountPct: 25, maxInstallments: 3, fineWaiverPerYear: 1, autoApproveUpToCents: 50000 },
    });

    expect(res.statusCode).toBe(200);
    expect(h.auditInsert).toHaveBeenCalledTimes(1);
    const [call] = h.auditInsert.mock.calls[0];
    expect(call.action).toBe('negotiation_policy_loosened');
    expect(call.tenant_id).toBe(TENANT);
    expect(call.metadata.changedFields).toContain('maxDiscountPct');
    expect(h.upsertPolicy).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('aperta a alçada (desconto desce) → audita como tightened', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/cobranca/negotiation/policy',
      headers: { authorization: auth(app) },
      payload: { maxDiscountPct: 5, maxInstallments: 3, fineWaiverPerYear: 1, autoApproveUpToCents: 50000 },
    });

    expect(res.statusCode).toBe(200);
    expect(h.auditInsert.mock.calls[0][0].action).toBe('negotiation_policy_tightened');
    await app.close();
  });

  it('sem mudança nenhuma (mesmos valores) → não grava auditoria, mas ainda aplica (no-op)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/cobranca/negotiation/policy',
      headers: { authorization: auth(app) },
      payload: { maxDiscountPct: 10, maxInstallments: 3, fineWaiverPerYear: 1, autoApproveUpToCents: 50000 },
    });

    expect(res.statusCode).toBe(200);
    expect(h.auditInsert).not.toHaveBeenCalled();
    expect(h.upsertPolicy).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it.each([
    ['erro retornado pelo client (sem exceção)', () => h.auditInsert.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as any)],
    ['exceção de rede', () => h.auditInsert.mockImplementationOnce(async () => { throw new Error('db down'); })],
  ])('FAIL-CLOSED (%s): a alteração é negada, upsertPolicy nunca chamado', async (_label, arrange) => {
    arrange();
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/cobranca/negotiation/policy',
      headers: { authorization: auth(app) },
      payload: { maxDiscountPct: 25 },
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).code).toBe('AUDIT_FAILED');
    expect(h.upsertPolicy).not.toHaveBeenCalled();
    await app.close();
  });

  it('operator (sem billing:write) recebe 403, nem chega a tentar auditar', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/cobranca/negotiation/policy',
      headers: { authorization: auth(app, 'operator') },
      payload: { maxDiscountPct: 99 },
    });

    expect(res.statusCode).toBe(403);
    expect(h.auditInsert).not.toHaveBeenCalled();
    expect(h.upsertPolicy).not.toHaveBeenCalled();
    await app.close();
  });
});
