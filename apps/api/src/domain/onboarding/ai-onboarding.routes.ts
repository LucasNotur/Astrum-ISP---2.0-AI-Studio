/**
 * D-21 — Rotas do Onboarding IA.
 * POST /api/v2/onboarding/ai/start   — iniciar orquestrador de onboarding
 * GET  /api/v2/onboarding/ai/:id     — status do job
 */
import type { FastifyInstance } from 'fastify';
import { createOnboardingJob, runOnboarding, defaultPorts } from './ai-onboarding-orchestrator.service';

export async function aiOnboardingRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/onboarding/ai';

  app.post(`${prefix}/start`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['owner', 'admin', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { erpConnector } = (req.body as any) ?? {};

    const jobId = await createOnboardingJob(user.tenantId, erpConnector, defaultPorts);

    // Rodar em background
    runOnboarding(user.tenantId, jobId, erpConnector, defaultPorts)
      .catch(err => app.log.error({ err, jobId }, 'D-21: onboarding falhou'));

    return reply.code(202).send({
      jobId,
      message: 'Onboarding IA iniciado. Acompanhe em GET /api/v2/onboarding/ai/:id',
    });
  });

  app.get(`${prefix}/:id`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const { data, error } = await defaultPorts.db
      .from('ai_onboarding_jobs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data) return reply.code(404).send({ error: 'Job não encontrado.' });
    return reply.send(data);
  });

  app.get(prefix, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { data, error } = await defaultPorts.db
      .from('ai_onboarding_jobs')
      .select('id,status,started_at,completed_at,summary')
      .eq('tenant_id', user.tenantId)
      .order('started_at', { ascending: false })
      .limit(10);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ jobs: data });
  });
}
