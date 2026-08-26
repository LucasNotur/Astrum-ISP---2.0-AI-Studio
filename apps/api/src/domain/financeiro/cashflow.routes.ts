/**
 * D-08 — Rota do CFO virtual.
 * GET  /api/v2/financeiro/cashflow?window_days=90 → projeção 90d + inadimplência recuperável.
 * POST /api/v2/financeiro/cashflow/act            → executar ação sugerida (criar campanha de recuperação).
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { forecastCashflow } from './cashflow-forecast.service';
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';

export async function cashflowRoutes(app: FastifyInstance) {
  app.get('/api/v2/financeiro/cashflow', {
    preHandler: [app.authenticate, requirePermission('billing', 'read')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request.user) ?? '';
    const { window_days } = request.query as { window_days?: string };
    try {
      return await forecastCashflow(tenantId, { windowDays: window_days ? Number(window_days) : undefined });
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  // D-08 Fase 2: botão "agir" — cria campanha de recuperação a partir da sugestão do CFO
  app.post('/api/v2/financeiro/cashflow/act', {
    preHandler: [app.authenticate, requirePermission('billing', 'write')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request.user) ?? '';
    const body = (request.body ?? {}) as {
      type?: string;
      payload?: { targetSegment?: string; expectedRecoveryCents?: number };
    };

    if (body.type !== 'create_campaign') {
      return reply.code(400).send({ error: 'Tipo de ação inválido. Use type: "create_campaign".' });
    }

    const targetSegment = body.payload?.targetSegment ?? 'overdue';
    const expectedRecoveryCents = body.payload?.expectedRecoveryCents ?? 0;

    // Cria campanha de recuperação (IA-26 — bandits)
    const { data: campaign, error } = await supabase
      .from('campaign_variants')
      .insert({
        tenant_id: tenantId,
        name: `Recuperação CFO — ${new Date().toLocaleDateString('pt-BR')}`,
        channel: 'whatsapp',
        trigger: 'overdue',
        status: 'draft',
        metadata: {
          source: 'cfo_virtual_d08',
          targetSegment,
          expectedRecoveryCents,
          createdVia: 'cashflow_act',
        },
      })
      .select('id, name, status')
      .single();

    if (error) {
      return reply.code(500).send({ error: `Falha ao criar campanha: ${error.message}` });
    }

    return reply.code(201).send({
      campaign,
      message: `Campanha de recuperação criada. Acesse Campanhas para revisar e ativar.`,
    });
  });
}
