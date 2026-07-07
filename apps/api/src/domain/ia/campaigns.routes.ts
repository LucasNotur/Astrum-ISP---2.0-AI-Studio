import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import {
  createVariant,
  getVariantStatsByCampaign,
  listAllVariantsForCampaign,
  setVariantStatus,
} from '../cobranca/variant-picker.service';

/**
 * IA-26 — Campaigns Routes.
 *
 * Endpoints administrativos para gerenciar variantes de campanha CobrAI:
 *
 *   GET    /api/v2/ia/campaigns
 *     → Lista campanhas (com variantes) e taxa de conversão + IC 95% por variante.
 *     → Marca a campanha como "explorando" ou "convergiu" com base em sobreposição
 *        dos ICs das variantes ativas (heurística: convergiu se maxRate-minRate > 0.1
 *        e há pelo menos 2 variantes ativas).
 *
 *   POST   /api/v2/ia/campaigns/variants
 *     body: { campaign_key, variant_key, template }
 *     → Cria nova variante (alpha=beta=1 por default — prior uniforme).
 *
 *   PATCH  /api/v2/ia/campaigns/variants/:id
 *     body: { status: 'active' | 'paused' }
 *     → Pausa/reativa variante. Pausada não entra no sorteio do bandit, mas
 *        envios já feitos continuam contando para a taxa de conversão.
 *
 * Auth: requirePermission('ai_config', 'read' | 'write') — mesma régua do /ia/tools.
 */

interface CampaignSummary {
  campaignKey: string;
  status: 'explorando' | 'convergiu';
  variants: Array<{
    id: string;
    variantKey: string;
    template: string;
    alpha: number;
    beta: number;
    status: 'active' | 'paused';
    sent: number;
    paid: number;
    expired: number;
    conversionRate: number;
    ci95Low: number;
    ci95High: number;
  }>;
}

interface CampaignListResponse {
  campaigns: CampaignSummary[];
}

const CONVERGENCE_GAP = 0.1;

function pickStatus(
  variants: Array<{ status: string; conversionRate: number; sent: number }>,
): 'explorando' | 'convergiu' {
  const active = variants.filter((v) => v.status === 'active' && v.sent > 0);
  if (active.length < 2) return 'explorando';
  const rates = active.map((v) => v.conversionRate);
  const gap = Math.max(...rates) - Math.min(...rates);
  return gap > CONVERGENCE_GAP ? 'convergiu' : 'explorando';
}

export async function campaignsRoutes(fastify: FastifyInstance) {
  // GET /api/v2/ia/campaigns
  fastify.get(
    '/api/v2/ia/campaigns',
    {
      onRequest: [fastify.authenticate],
      preHandler: [requirePermission('ai_config', 'read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).user.tenantId as string;
      if (!tenantId) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'tenant ausente' });
      }

      const { data: rows, error } = await supabaseAdmin
        .from('campaign_variants')
        .select('campaign_key')
        .eq('tenant_id', tenantId);
      if (error) {
        return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
      }

      const uniqueKeys = Array.from(
        new Set((rows ?? []).map((r: any) => r.campaign_key as string)),
      ).sort();

      const summaries: CampaignSummary[] = await Promise.all(
        uniqueKeys.map(async (campaignKey) => {
          const variants = await listAllVariantsForCampaign(tenantId, campaignKey);
          const stats = await getVariantStatsByCampaign(tenantId, campaignKey);
          const statsByVariant = new Map(stats.map((s) => [s.variantId, s]));

          const merged = variants.map((v) => {
            const s = statsByVariant.get(v.id);
            return {
              id: v.id,
              variantKey: v.variantKey,
              template: v.template,
              alpha: v.alpha,
              beta: v.beta,
              status: v.status,
              sent: s?.sent ?? 0,
              paid: s?.paid ?? 0,
              expired: s?.expired ?? 0,
              conversionRate: s?.conversionRate ?? 0,
              ci95Low: s?.ci95Low ?? 0,
              ci95High: s?.ci95High ?? 0,
            };
          });

          return {
            campaignKey,
            status: pickStatus(merged),
            variants: merged,
          };
        }),
      );

      const body: CampaignListResponse = { campaigns: summaries };
      return body;
    },
  );

  // POST /api/v2/ia/campaigns/variants
  fastify.post(
    '/api/v2/ia/campaigns/variants',
    {
      onRequest: [fastify.authenticate],
      preHandler: [requirePermission('ai_config', 'write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).user.tenantId as string;
      if (!tenantId) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'tenant ausente' });
      }
      const body = request.body as {
        campaign_key?: string;
        variant_key?: string;
        template?: string;
      };
      if (!body.campaign_key || !body.variant_key || !body.template) {
        return reply.code(400).send({
          code: 'BAD_REQUEST',
          message: 'campaign_key, variant_key e template são obrigatórios',
        });
      }
      try {
        const variant = await createVariant(
          tenantId,
          body.campaign_key,
          body.variant_key,
          body.template,
        );
        return { ok: true, variant };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro ao criar variante';
        if (msg.includes('duplicate')) {
          return reply.code(409).send({ code: 'CONFLICT', message: msg });
        }
        return reply.code(500).send({ code: 'DB_ERROR', message: msg });
      }
    },
  );

  // PATCH /api/v2/ia/campaigns/variants/:id
  fastify.patch(
    '/api/v2/ia/campaigns/variants/:id',
    {
      onRequest: [fastify.authenticate],
      preHandler: [requirePermission('ai_config', 'write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).user.tenantId as string;
      if (!tenantId) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'tenant ausente' });
      }
      const { id } = request.params as { id: string };
      const body = request.body as { status?: 'active' | 'paused' };
      if (!body.status || (body.status !== 'active' && body.status !== 'paused')) {
        return reply.code(400).send({
          code: 'BAD_REQUEST',
          message: 'status deve ser "active" ou "paused"',
        });
      }
      try {
        await setVariantStatus(tenantId, id, body.status);
        return { ok: true, id, status: body.status };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro ao atualizar variante';
        return reply.code(500).send({ code: 'DB_ERROR', message: msg });
      }
    },
  );
}
