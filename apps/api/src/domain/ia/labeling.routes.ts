import { FastifyInstance } from 'fastify';
import {
  getPendingExamples,
  labelExample,
  exportExamples,
  isActiveLearningEnabled,
} from '../ml/active-learning.service';
import type { ExampleSource } from '../ml/active-learning.service';

export async function labelingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/labeling/queue', async (req) => {
    if (!isActiveLearningEnabled()) {
      return { queue: [], enabled: false };
    }
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { queue: [] };
    const limit = Number((req.query as any).limit) || 20;
    const queue = await getPendingExamples(tenantId, limit);
    return { queue, enabled: true };
  });

  app.post<{ Params: { id: string }; Body: { label: string } }>(
    '/api/v2/ia/labeling/:id/label',
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
      const { label } = req.body;
      if (!label) return reply.code(400).send({ error: 'label obrigatório' });
      const ok = await labelExample(tenantId, req.params.id, label);
      if (!ok) return reply.code(500).send({ error: 'Falha ao gravar label' });
      return { ok: true };
    },
  );

  app.get('/api/v2/ia/labeling/export', async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
    const source = (req.query as any).source as ExampleSource | undefined;
    const since = (req.query as any).since as string | undefined;
    const examples = await exportExamples(tenantId, source, since);
    const jsonl = examples
      .map((e) =>
        JSON.stringify({
          source: e.source,
          input: e.input,
          output: e.output,
          label: e.label,
        }),
      )
      .join('\n');
    return reply
      .header('Content-Type', 'application/x-ndjson')
      .header('Content-Disposition', 'attachment; filename="labeled_examples.jsonl"')
      .send(jsonl);
  });
}
