import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

export async function voiceQaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/voice/calls', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { calls: [] };
    const limit = Math.min(Number((req.query as any).limit) || 50, 200);

    const { data: calls } = await supabaseAdmin
      .from('voice_calls')
      .select(`
        id, phone_last4, started_at, ended_at, duration_s, status,
        voice_scorecards(total, criteria, model)
      `)
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(limit);

    return {
      calls: (calls ?? []).map((c: any) => ({
        id: c.id,
        phoneLast4: c.phone_last4,
        startedAt: c.started_at,
        endedAt: c.ended_at,
        durationS: c.duration_s,
        status: c.status,
        scorecard: c.voice_scorecards?.[0] ?? null,
      })),
    };
  });

  app.get('/api/v2/ia/voice/calls/:id', async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    const callId = (req.params as any).id;
    if (!tenantId) return reply.code(401).send({ error: 'Unauthorized' });

    const { data: call } = await supabaseAdmin
      .from('voice_calls')
      .select(`
        id, phone_last4, started_at, ended_at, duration_s, status,
        voice_scorecards(total, criteria, model),
        voice_transcripts(id, role, content, t_offset_ms)
      `)
      .eq('id', callId)
      .eq('tenant_id', tenantId)
      .single();

    if (!call) return reply.code(404).send({ error: 'Chamada não encontrada' });

    const transcripts = ((call as any).voice_transcripts ?? [])
      .sort((a: any, b: any) => a.t_offset_ms - b.t_offset_ms);

    return {
      call: {
        id: call.id,
        phoneLast4: (call as any).phone_last4,
        startedAt: (call as any).started_at,
        endedAt: (call as any).ended_at,
        durationS: (call as any).duration_s,
        status: call.status,
        scorecard: (call as any).voice_scorecards?.[0] ?? null,
        transcripts: transcripts.map((t: any) => ({
          id: t.id,
          role: t.role,
          content: t.content,
          offsetMs: t.t_offset_ms,
        })),
      },
    };
  });
}
