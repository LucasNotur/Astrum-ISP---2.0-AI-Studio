import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import type { PortalDb } from './subscriber-portal';
import type { DiagnosticResult } from './diagnostic-portal.service';
import { subscriberPortalRoutes } from './subscriber-portal.routes';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDb(overrides: Partial<{
  lookupData: any;
  invoiceData: any[];
  soData: any[];
}> = {}): PortalDb {
  const { lookupData = null, invoiceData = [], soData = [] } = overrides;

  return {
    from: vi.fn().mockImplementation((table: string) => {
      const terminal =
        table === 'customers'   ? { data: lookupData, error: null }
        : table === 'invoices'  ? { data: invoiceData, error: null }
        :                         { data: soData, error: null };

      const chain: any = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      Object.defineProperty(chain, 'then', {
        get() { return (onF: any) => onF(terminal); },
      });
      // maybeSingle deve retornar o terminal diretamente (simulado como thenable)
      chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
      return chain;
    }),
  };
}

const SUBSCRIBER_PAYLOAD = { sub: 'cust-1', tenantId: 'tenant-1', role: 'subscriber' };
const OPERATOR_PAYLOAD   = { sub: 'op-1',   tenantId: 'tenant-1', role: 'operator' };

async function buildApp(overrides: {
  dbData?: Parameters<typeof makeDb>[0];
  diagnosticResult?: DiagnosticResult;
  jwtPayload?: any;
} = {}) {
  const app = Fastify();

  const payload = overrides.jwtPayload ?? SUBSCRIBER_PAYLOAD;

  // Mock JWT: sign retorna token fixo; jwtVerify injetado na request.
  app.decorate('jwt', {
    sign: vi.fn().mockReturnValue('mocked-portal-token'),
    verify: vi.fn(),
  });
  app.decorateRequest('jwtVerify', async function (this: any) {
    this.user = payload;
    return payload;
  });

  const db = makeDb(overrides.dbData);
  const diagnosticResult: DiagnosticResult = overrides.diagnosticResult ?? {
    signal: 'ok',
    simulated: true,
    serviceOrderCreated: false,
    message: 'funcionando normalmente',
  };

  await app.register(subscriberPortalRoutes, {
    db,
    tenantId: 'tenant-1',
    runDiagnosticFn: vi.fn().mockResolvedValue(diagnosticResult),
  });

  await app.ready();
  return app;
}

// ── POST /api/v2/portal/auth ──────────────────────────────────────────────────

describe('POST /api/v2/portal/auth', () => {
  it('cpf/contrato correto → 200 com token', async () => {
    const app = await buildApp({
      dbData: {
        lookupData: {
          id: 'cust-1',
          cpf: '12345678901',
          legacy_id: 'CONT-001',
          status: 'active',
          tenant_id: 'tenant-1',
        },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/portal/auth',
      headers: { 'x-tenant-id': 'tenant-1' },
      payload: { cpf: '123.456.789-01', contract: 'CONT-001' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBe('mocked-portal-token');
    expect(body.customerId).toBe('cust-1');
    expect(body.availableActions).toContain('diagnostico');
  });

  it('contrato errado → 401', async () => {
    const app = await buildApp({
      dbData: {
        lookupData: {
          id: 'cust-1',
          cpf: '12345678901',
          legacy_id: 'CONT-001',
          status: 'active',
          tenant_id: 'tenant-1',
        },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/portal/auth',
      headers: { 'x-tenant-id': 'tenant-1' },
      payload: { cpf: '12345678901', contract: 'WRONG' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('cliente não encontrado → 401', async () => {
    const app = await buildApp({ dbData: { lookupData: null } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/portal/auth',
      headers: { 'x-tenant-id': 'tenant-1' },
      payload: { cpf: '00000000000', contract: 'X' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('body inválido → 400', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/portal/auth',
      headers: { 'x-tenant-id': 'tenant-1' },
      payload: { cpf: '123' },   // sem contract
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── GET /api/v2/portal/dashboard ─────────────────────────────────────────────

describe('GET /api/v2/portal/dashboard', () => {
  it('200 com resumo de faturas e OS', async () => {
    const app = await buildApp({
      dbData: {
        invoiceData: [
          { id: 'inv-1', status: 'overdue', amount_cents: 10000 },
          { id: 'inv-2', status: 'paid',    amount_cents: 9900 },
        ],
        soData: [
          { id: 'os-1', status: 'open', type: 'technical_visit' },
        ],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/portal/dashboard',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.overdueInvoices).toBe(1);
    expect(body.openServiceOrders).toBe(1);
    expect(body.recentInvoices).toHaveLength(2);
  });

  it('token com role=operator → 403', async () => {
    const app = await buildApp({ jwtPayload: OPERATOR_PAYLOAD });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/portal/dashboard',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ── GET /api/v2/portal/invoices ───────────────────────────────────────────────

describe('GET /api/v2/portal/invoices', () => {
  it('retorna lista de faturas', async () => {
    const app = await buildApp({
      dbData: {
        invoiceData: [
          { id: 'inv-1', status: 'open', due_date: '2026-07-31', amount_cents: 8900 },
        ],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/portal/invoices',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().invoices).toHaveLength(1);
  });
});

// ── GET /api/v2/portal/service-orders ────────────────────────────────────────

describe('GET /api/v2/portal/service-orders', () => {
  it('retorna OS', async () => {
    const app = await buildApp({
      dbData: {
        soData: [{ id: 'os-1', status: 'open', type: 'installation' }],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/portal/service-orders',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().serviceOrders).toHaveLength(1);
  });
});

// ── POST /api/v2/portal/diagnostic ───────────────────────────────────────────

describe('POST /api/v2/portal/diagnostic', () => {
  it('sinal ok → retorna resultado do diagnóstico', async () => {
    const app = await buildApp({
      diagnosticResult: {
        signal: 'ok',
        simulated: false,
        serviceOrderCreated: false,
        message: 'funcionando normalmente',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/portal/diagnostic',
      headers: { authorization: 'Bearer valid-token' },
      payload: { address: 'Rua X, 100' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.signal).toBe('ok');
    expect(body.serviceOrderCreated).toBe(false);
  });

  it('no_signal → retorna resultado com OS criada', async () => {
    const app = await buildApp({
      diagnosticResult: {
        signal: 'no_signal',
        simulated: true,
        serviceOrderCreated: true,
        serviceOrderId: 'os-99',
        message: 'OS #os-99',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/portal/diagnostic',
      headers: { authorization: 'Bearer valid-token' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().serviceOrderId).toBe('os-99');
  });
});
