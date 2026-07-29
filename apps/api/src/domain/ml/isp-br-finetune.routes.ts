/**
 * D-10 — Rotas do pipeline ISP-BR fine-tune.
 * POST /api/v2/ia/fine-tune/run    — inicia pipeline (super_admin)
 * GET  /api/v2/ia/fine-tune/runs   — lista runs
 * GET  /api/v2/ia/fine-tune/export — preview JSONL (count + amostra)
 */
import type { FastifyInstance } from 'fastify';
import { exportLabeledExamples, runFineTunePipeline, defaultPorts } from './isp-br-finetune.service';

export async function fineTuneRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/ia/fine-tune';

  app.post(`${prefix}/run`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Apenas super_admin pode iniciar fine-tune.' });
    }
    const body = req.body as any ?? {};
    const { baseModel = 'gpt-4o-mini', minExamples = 5000 } = body;

    // Roda em background (processo longo)
    const runPromise = runFineTunePipeline(user.tenantId ?? null, { baseModel, minExamples }, defaultPorts);
    runPromise.catch(err => app.log.error({ err }, 'D-10: fine-tune falhou'));

    return reply.code(202).send({
      message: 'Pipeline ISP-BR iniciado em background. Acompanhe via GET /runs.',
      baseModel,
    });
  });

  app.get(`${prefix}/runs`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { data, error } = await defaultPorts.db
      .from('fine_tune_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ runs: data });
  });

  app.get(`${prefix}/export`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { count } = await exportLabeledExamples(user.tenantId ?? null, defaultPorts.db, { limit: 100 });
    return reply.send({ count, note: 'Passe limit=all para ver o JSONL completo (somente CLI).' });
  });
}
