import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export async function ocrReviewRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/ocr/queue', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { queue: [] };

    const { data, error } = await supabaseAdmin
      .from('ocr_extractions')
      .select('id, doc_type, media_url, extraction, confidence, review_status, created_at')
      .eq('tenant_id', tenantId)
      .eq('review_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      infraLogger.warn({ err: error.message }, '[ocr-review] queue fetch failed');
      return { queue: [] };
    }
    return { queue: data ?? [] };
  });

  app.patch<{
    Params: { id: string };
    Body: { action: 'approve' | 'correct'; corrected?: Record<string, unknown> };
  }>('/api/v2/ia/ocr/:id', async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const { action, corrected } = req.body;
    if (!action || !['approve', 'correct'].includes(action)) {
      return reply.code(400).send({ error: 'action deve ser approve ou correct' });
    }

    const userId = (req as any).user?.sub ?? (req as any).user?.id ?? 'unknown';

    const update: Record<string, unknown> = {
      review_status: action === 'approve' ? 'approved' : 'corrected',
      reviewed_by: userId,
    };

    if (action === 'correct') {
      if (!corrected) return reply.code(400).send({ error: 'corrected obrigatório para action=correct' });
      update.corrected = corrected;
    }

    const { error } = await supabaseAdmin
      .from('ocr_extractions')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId);

    if (error) {
      return reply.code(500).send({ error: 'Falha ao atualizar' });
    }

    if (action === 'correct') {
      try {
        const { recordExample, isActiveLearningEnabled } = await import('../ml/active-learning.service');
        if (isActiveLearningEnabled()) {
          recordExample({
            tenantId,
            source: 'ocr_correction',
            input: JSON.stringify({ id: req.params.id }),
            output: JSON.stringify(corrected),
            label: 'corrected',
          });
        }
      } catch { /* IA-29 may not be available */ }
    }

    return { ok: true };
  });
}
