/**
 * POST /api/v2/cobranca/emergency-stop   — ativa o freio (super_admin)
 * POST /api/v2/cobranca/emergency-resume — desativa o freio (super_admin)
 * GET  /api/v2/cobranca/emergency-stop   — estado atual (super_admin)
 *
 * Kill switch real da cobrança (C1 — Option A, 2026-08-25), mesmo padrão do
 * atendimento (ver domain/atendimento/emergency-stop.routes.ts e migration 108):
 * reaproveita as funções puras genéricas de emergency-stop.service.ts, só troca
 * a tabela (`cobranca_emergency_stops`, migration 110). Ativo → CobrAI para de
 * ENVIAR mensagem via WhatsApp, mas continua processando o resto (lockout,
 * invoice.paid, reactivate, notify_human) — ver cobrai.worker.ts.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import { captureWarning } from '../../infrastructure/observability/sentry.service';
import {
  getEmergencyStopStatus,
  activateEmergencyStop,
  deactivateEmergencyStop,
  type EmergencyStopDeps,
  type EmergencyStopRow,
} from '../atendimento/emergency-stop.service';

interface JwtUserPayload {
  userId?: string;
  role?: string;
}

async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string } | null> {
  const user = (request as unknown as { user?: JwtUserPayload }).user;
  const userId = getUserId(user);
  if (!userId) {
    await reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Autenticação necessária.' });
    return null;
  }

  const { data, error } = await supabaseAdmin.from('users').select('role').eq('id', userId).maybeSingle();
  if (error || !data || data.role !== 'super_admin') {
    securityLogger.warn(
      { userId, dbRole: data?.role ?? null },
      'cobrai-emergency-stop: tentativa de acesso sem super_admin',
    );
    await reply.status(403).send({ code: 'FORBIDDEN', message: 'Acesso restrito a super_admin.' });
    return null;
  }
  return { userId };
}

async function findActive(): Promise<EmergencyStopRow | null> {
  const { data, error } = await supabaseAdmin
    .from('cobranca_emergency_stops')
    .select('id, reason, activated_at, activated_by')
    .is('deactivated_at', null)
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar parada de emergência da cobrança: ${error.message}`);
  return data as EmergencyStopRow | null;
}

const deps: EmergencyStopDeps = {
  findActive,
  insertActivation: async ({ reason, activatedBy }) => {
    const { data, error } = await supabaseAdmin
      .from('cobranca_emergency_stops')
      .insert({ reason, activated_by: activatedBy })
      .select('id, reason, activated_at, activated_by')
      .single();
    if (error) throw new Error(`Falha ao ativar parada de emergência da cobrança: ${error.message}`);
    return data as EmergencyStopRow;
  },
  deactivate: async ({ id, deactivatedBy }) => {
    const { error } = await supabaseAdmin
      .from('cobranca_emergency_stops')
      .update({ deactivated_at: new Date().toISOString(), deactivated_by: deactivatedBy })
      .eq('id', id);
    if (error) throw new Error(`Falha ao desativar parada de emergência da cobrança: ${error.message}`);
  },
};

export async function cobraiEmergencyStopRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/cobranca/emergency-stop', { onRequest: auth }, async (request, reply) => {
    const authed = await requireSuperAdmin(request, reply);
    if (!authed) return;
    const status = await getEmergencyStopStatus(deps);
    return reply.send(status);
  });

  app.post('/api/v2/cobranca/emergency-stop', { onRequest: auth }, async (request, reply) => {
    const authed = await requireSuperAdmin(request, reply);
    if (!authed) return;

    const body = (request.body ?? {}) as { reason?: string };
    try {
      const row = await activateEmergencyStop({ reason: body.reason ?? '', activatedBy: authed.userId }, deps);
      securityLogger.warn({ userId: authed.userId, reason: row.reason }, '🛑 PARADA DE EMERGÊNCIA da cobrança CobrAI ativada');
      captureWarning(`🛑 PARADA DE EMERGÊNCIA da cobrança CobrAI ativada: ${row.reason}`, {
        activatedBy: authed.userId,
      });
      return reply.status(201).send({ active: true, reason: row.reason, activatedAt: row.activated_at });
    } catch (err) {
      return reply.status(409).send({ code: 'ALREADY_ACTIVE_OR_INVALID', message: (err as Error).message });
    }
  });

  app.post('/api/v2/cobranca/emergency-resume', { onRequest: auth }, async (request, reply) => {
    const authed = await requireSuperAdmin(request, reply);
    if (!authed) return;

    try {
      await deactivateEmergencyStop({ deactivatedBy: authed.userId }, deps);
      securityLogger.warn({ userId: authed.userId }, '✅ Parada de emergência da cobrança CobrAI desativada');
      captureWarning('✅ Parada de emergência da cobrança CobrAI desativada', { deactivatedBy: authed.userId });
      return reply.send({ active: false });
    } catch (err) {
      return reply.status(409).send({ code: 'NOT_ACTIVE', message: (err as Error).message });
    }
  });
}

export default cobraiEmergencyStopRoutes;
