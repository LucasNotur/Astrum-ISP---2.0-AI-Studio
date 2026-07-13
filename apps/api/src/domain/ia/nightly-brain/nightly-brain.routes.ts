/**
 * E-01/E-02 — Rotas do Cérebro Noturno.
 * GET  /api/v2/ia/reflections        → diário (o card "o que pensei esta noite")
 * POST /api/v2/ia/reflections/run    → roda a reflexão de uma data sob demanda
 */
import type { FastifyInstance } from 'fastify';
import supabase from '../../../infrastructure/database/supabase.client';
import { requirePermission } from '../../../infrastructure/auth/rbac.middleware';
import { runNightlyReflection } from './nightly-brain.service';
import { scanForIncidents } from '../../rede/incident-orchestrator.service';

export async function nightlyBrainRoutes(app: FastifyInstance) {
  app.get('/api/v2/ia/reflections', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'read')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    const { data } = await supabase
      .from('ai_reflections').select('*')
      .eq('tenant_id', tenantId)
      .order('reflection_date', { ascending: false })
      .limit(30);
    return { reflections: data ?? [] };
  });

  app.post('/api/v2/ia/reflections/run', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { date } = (request.body ?? {}) as { date?: string };
    const target = date ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10); // ontem

    // A noite começa olhando a rede: anomalias alimentam as hipóteses (D-04 ∩ E-01)
    let anomalies: { ctoId: string; metric: string }[] = [];
    try {
      const scan = await scanForIncidents(tenantId);
      anomalies = scan.anomalousCtos.map((ctoId) => ({ ctoId, metric: 'latency_ms' }));
    } catch { /* telemetria ausente não bloqueia a reflexão */ }

    try {
      const reflection = await runNightlyReflection(tenantId, target, undefined, anomalies);
      return reply.code(201).send(reflection);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
