/**
 * D-15 — Rotas do Túnel de Vento.
 *
 * POST /api/v2/ia/wind-tunnel/run       → dispara rodada (202; roda em background)
 * GET  /api/v2/ia/wind-tunnel/personas  → catálogo de personas
 * GET  /api/v2/ia/wind-tunnel/runs      → lista rodadas
 * GET  /api/v2/ia/wind-tunnel/runs/:id  → detalhe (resultados + transcripts)
 *
 * Gate: WIND_TUNNEL_ENABLED=true (staging). RBAC: ai_config.
 */
import type { FastifyInstance } from 'fastify';
import supabase from '../../../infrastructure/database/supabase.client';
import { iaLogger } from '../../../infrastructure/logging/logger';
import { requirePermission } from '../../../infrastructure/auth/rbac.middleware';
import { isWindTunnelEnabled, runWindTunnel, PERSONAS } from './wind-tunnel.service';

export async function windTunnelRoutes(app: FastifyInstance) {
  app.get('/api/v2/ia/wind-tunnel/personas', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'read')],
  }, async () => {
    return {
      personas: PERSONAS.map((p) => ({
        id: p.id,
        nome: p.nome,
        dificuldade: p.dificuldade,
        maxTurns: p.maxTurns,
      })),
    };
  });

  app.post('/api/v2/ia/wind-tunnel/run', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    if (!isWindTunnelEnabled()) {
      return reply.code(409).send({
        error: 'Túnel de vento desabilitado. Ligue WIND_TUNNEL_ENABLED=true (apenas staging).',
      });
    }

    const { tenantId } = request.user as { tenantId: string };
    const body = (request.body ?? {}) as { persona_ids?: string[]; dificuldade_min?: number };

    // Fire-and-forget: a rodada leva minutos (LLM multi-turn). O run_id sai na
    // criação do registro; o cliente acompanha via GET /runs/:id.
    const summaryPromise = runWindTunnel(tenantId, {
      personaIds: body.persona_ids,
      dificuldadeMin: body.dificuldade_min,
      triggeredBy: 'manual',
    });

    // Espera só a criação do run (primeiro insert) — o resto segue em background.
    const runId = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      summaryPromise
        .then((s) => { clearTimeout(timer); resolve(s.runId); })
        .catch((err) => {
          clearTimeout(timer);
          iaLogger.error({ err: err.message, tenantId }, 'D-15: rodada falhou');
          resolve(null);
        });
    });

    // Mantém a promise viva sem derrubar o processo em caso de erro.
    summaryPromise.catch(() => { /* já logado acima */ });

    return reply.code(202).send({
      accepted: true,
      run_id: runId, // null = ainda criando (ou falhou cedo) — consultar GET /runs
      message: 'Rodada iniciada. Acompanhe em GET /api/v2/ia/wind-tunnel/runs',
    });
  });

  app.get('/api/v2/ia/wind-tunnel/runs', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'read')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    const { data } = await supabase
      .from('wind_tunnel_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(20);
    return { runs: data ?? [] };
  });

  app.get('/api/v2/ia/wind-tunnel/runs/:id', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'read')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const { data: run } = await supabase
      .from('wind_tunnel_runs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (!run) return reply.code(404).send({ error: 'Rodada não encontrada' });

    const { data: results } = await supabase
      .from('wind_tunnel_results')
      .select('*')
      .eq('run_id', id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    return { run, results: results ?? [] };
  });
}
