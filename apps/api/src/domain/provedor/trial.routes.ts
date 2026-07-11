/**
 * P5-05 — Rotas do Trial sem fricção.
 *
 * POST /api/v2/trial/signup           Cadastro self-service (público)
 * GET  /api/v2/trial/insight          Primeiro insight (token trial)
 * POST /api/v2/trial/connect-erp      Conecta ERP durante trial (token trial)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  buildFirstInsight,
  defaultTrialDb,
  defaultInsightDb,
  type TrialDb,
  type InsightDb,
} from './trial.service';
import { hashPassword } from '../../infrastructure/auth/password.service';

const TRIAL_DAYS = 14;

const SignupSchema = z.object({
  ispName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const ConnectErpSchema = z.object({
  provider: z.enum(['ixc', 'voalle', 'mkauth', 'sgp', 'hubsoft']),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
});

export interface TrialRoutesDeps {
  trialDb?: TrialDb;
  insightDb?: InsightDb;
}

export async function trialRoutes(
  app: FastifyInstance,
  deps: TrialRoutesDeps = {},
) {
  const trialDb = deps.trialDb ?? defaultTrialDb;
  const insightDb = deps.insightDb ?? defaultInsightDb;

  // ── Middleware de trial token ─────────────────────────────────────────────
  async function verifyTrialToken(request: any, reply: any) {
    try {
      const payload = await request.jwtVerify() as any;
      if (payload?.role !== 'trial') {
        return reply.code(403).send({ error: 'Token de trial necessário' });
      }
    } catch {
      return reply.code(401).send({ error: 'Token inválido ou expirado' });
    }
  }

  // ── POST /api/v2/trial/signup ─────────────────────────────────────────────
  app.post('/api/v2/trial/signup', async (request, reply) => {
    const body = SignupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Dados inválidos', details: body.error.flatten() });
    }

    const { ispName, email, password } = body.data;
    const adminPasswordHash = await hashPassword(password);
    const signupIp = request.ip;

    try {
      const { tenantId, trialId } = await trialDb.createTrialTenant({
        ispName,
        adminEmail: email,
        adminPasswordHash,
        signupIp,
      });

      const expiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const token = (app as any).jwt.sign(
        { sub: email, tenantId, role: 'trial' },
        { expiresIn: `${TRIAL_DAYS}d` },
      );

      return reply.code(201).send({
        tenantId,
        trialId,
        token,
        expiresAt: expiresAt.toISOString(),
        trialDays: TRIAL_DAYS,
        nextStep: 'connect_erp',
        message: `Trial de ${TRIAL_DAYS} dias ativo. Conecte seu ERP para ver o primeiro insight.`,
      });
    } catch (err: any) {
      if (err?.message?.includes('duplicate') || err?.code === '23505') {
        return reply.code(409).send({ error: 'E-mail já cadastrado. Use o login normal.' });
      }
      throw err;
    }
  });

  // ── GET /api/v2/trial/insight ─────────────────────────────────────────────
  app.get('/api/v2/trial/insight', {
    preHandler: verifyTrialToken,
  }, async (request, reply) => {
    const { tenantId } = (request as any).user as { tenantId: string };

    const trial = await trialDb.getTrialByTenantId(tenantId);
    if (!trial) return reply.code(404).send({ error: 'Trial não encontrado' });

    if (new Date() > trial.expiresAt) {
      return reply.code(403).send({ error: 'Trial expirado. Assine um plano para continuar.' });
    }

    const [overdueCustomers, overdueCents, openServiceOrders, totalCustomers] = await Promise.all([
      insightDb.countOverdueCustomers(tenantId),
      insightDb.sumOverdueCents(tenantId),
      insightDb.countOpenServiceOrders(tenantId),
      insightDb.countTotalCustomers(tenantId),
    ]);

    const insight = buildFirstInsight(tenantId, {
      overdueCustomers,
      overdueCents,
      openServiceOrders,
      totalCustomers,
    });

    if (!trial.firstInsightGenerated) {
      await trialDb.markInsightGenerated(tenantId);
    }

    return reply.send({
      ...insight,
      trial: {
        expiresAt: trial.expiresAt.toISOString(),
        daysRemaining: Math.max(
          0,
          Math.ceil((trial.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        ),
        erpConnected: trial.erpConnected,
      },
    });
  });

  // ── POST /api/v2/trial/connect-erp ───────────────────────────────────────
  app.post('/api/v2/trial/connect-erp', {
    preHandler: verifyTrialToken,
  }, async (request, reply) => {
    const body = ConnectErpSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Dados de ERP inválidos', details: body.error.flatten() });
    }

    const { tenantId } = (request as any).user as { tenantId: string };
    const { provider } = body.data;

    // Persistir provider (credenciais serão salvas via erp-admin.routes.ts existente)
    await trialDb.markErpConnected(tenantId, provider);

    return reply.send({
      ok: true,
      message: `ERP ${provider} conectado. Acesse GET /api/v2/trial/insight para ver o primeiro insight.`,
      nextStep: 'view_insight',
    });
  });
}
