/**
 * P4-01 — Rotas do portal do assinante (white-label PWA).
 *
 * Auth por CPF + contrato (legacy_id ERP ou UUID do customer).
 * JWT de 24h com role:'subscriber' — separado do JWT de operador (15m).
 *
 * Endpoints:
 *   POST   /api/v2/portal/auth            Autenticação (CPF + contrato)
 *   GET    /api/v2/portal/dashboard       Resumo: status, faturas abertas, OS abertas
 *   GET    /api/v2/portal/invoices        Histórico de faturas com link 2ª via
 *   GET    /api/v2/portal/service-orders  Ordens de serviço recentes
 *   POST   /api/v2/portal/diagnostic      P4-02 — diagnóstico self-service
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  lookupSubscriberByCpf,
  authenticateSubscriber,
  availableActions,
  getCustomerInvoices,
  getCustomerServiceOrders,
  defaultPortalDb,
  type PortalDb,
} from './subscriber-portal';
import { runPortalDiagnostic } from './diagnostic-portal.service';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface PortalRoutesDeps {
  db?: PortalDb;
  tenantId?: string;            // para testes sem header X-Tenant-Id
  runDiagnosticFn?: typeof runPortalDiagnostic;
}

const AuthBodySchema = z.object({
  cpf: z.string().min(11),
  contract: z.string().min(1),
});

const DiagnosticBodySchema = z.object({
  address: z.string().optional(),
});

export async function subscriberPortalRoutes(
  app: FastifyInstance,
  deps: PortalRoutesDeps = {},
) {
  const db = deps.db ?? defaultPortalDb;
  const doRunDiagnostic = deps.runDiagnosticFn ?? runPortalDiagnostic;

  // ── Middleware: verifica token de assinante ──────────────────────────────────
  async function verifyPortalToken(request: any, reply: any) {
    try {
      const payload = await request.jwtVerify() as any;
      if (payload?.role !== 'subscriber') {
        return reply.code(403).send({ error: 'Acesso negado: token de operador inválido aqui' });
      }
    } catch {
      return reply.code(401).send({ error: 'Token inválido ou expirado' });
    }
  }

  // ── Helper: tenant do request ────────────────────────────────────────────────
  function getTenantId(request: any): string {
    return deps.tenantId ?? request.headers['x-tenant-id'] as string ?? '';
  }

  // ── POST /api/v2/portal/auth ─────────────────────────────────────────────────
  app.post('/api/v2/portal/auth', async (request, reply) => {
    const body = AuthBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'CPF e contrato são obrigatórios' });

    const tenantId = getTenantId(request);
    if (!tenantId) return reply.code(400).send({ error: 'X-Tenant-Id obrigatório' });

    const record = await lookupSubscriberByCpf(db, tenantId, body.data.cpf);
    const authResult = authenticateSubscriber(body.data, record);

    if (!authResult.ok) {
      infraLogger.info({ tenantId, reason: authResult.reason }, 'Portal auth falhou');
      return reply.code(401).send({ error: 'CPF ou contrato inválidos' });
    }

    const token = (app as any).jwt.sign(
      { sub: authResult.customerId, tenantId: authResult.tenantId, role: 'subscriber' },
      { expiresIn: '24h' },
    );

    const actions = record ? availableActions(record.active ? 'active' : 'suspended') : [];
    return reply.send({ token, customerId: authResult.customerId, availableActions: actions });
  });

  // ── GET /api/v2/portal/dashboard ─────────────────────────────────────────────
  app.get('/api/v2/portal/dashboard', { preHandler: verifyPortalToken }, async (request, reply) => {
    const payload = (request as any).user as { sub: string; tenantId: string };
    const [invoices, serviceOrders] = await Promise.all([
      getCustomerInvoices(db, payload.tenantId, payload.sub, 3),
      getCustomerServiceOrders(db, payload.tenantId, payload.sub, 3),
    ]);

    const overdueCount = invoices.filter((i: any) => i.status === 'overdue').length;
    const openOsCount = serviceOrders.filter((os: any) => os.status === 'open').length;

    return reply.send({
      customerId: payload.sub,
      overdueInvoices: overdueCount,
      openServiceOrders: openOsCount,
      recentInvoices: invoices,
      recentServiceOrders: serviceOrders,
    });
  });

  // ── GET /api/v2/portal/invoices ───────────────────────────────────────────────
  app.get('/api/v2/portal/invoices', { preHandler: verifyPortalToken }, async (request, reply) => {
    const payload = (request as any).user as { sub: string; tenantId: string };
    const invoices = await getCustomerInvoices(db, payload.tenantId, payload.sub, 10);
    return reply.send({ invoices });
  });

  // ── GET /api/v2/portal/service-orders ────────────────────────────────────────
  app.get('/api/v2/portal/service-orders', { preHandler: verifyPortalToken }, async (request, reply) => {
    const payload = (request as any).user as { sub: string; tenantId: string };
    const serviceOrders = await getCustomerServiceOrders(db, payload.tenantId, payload.sub, 10);
    return reply.send({ serviceOrders });
  });

  // ── POST /api/v2/portal/diagnostic (P4-02) ───────────────────────────────────
  app.post('/api/v2/portal/diagnostic', { preHandler: verifyPortalToken }, async (request, reply) => {
    const payload = (request as any).user as { sub: string; tenantId: string };
    const body = DiagnosticBodySchema.safeParse(request.body);
    const address = body.success ? body.data.address : undefined;

    const result = await doRunDiagnostic(payload.tenantId, payload.sub, address);
    return reply.send(result);
  });
}
