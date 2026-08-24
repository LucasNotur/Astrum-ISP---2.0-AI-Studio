import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { readTenantScoped } from '../../infrastructure/database/tenant-rls';

export async function voiceQaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/voice/calls', async (req) => {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return { calls: [] };
    const limit = Math.min(Number((req.query as any).limit) || 50, 200);

    // MT-02(c): RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    // O embed aninhado `voice_scorecards(...)` é reproduzido via json_agg no caminho RLS
    // (shape validada contra o formato do PostgREST). Sob RLS os subselects também
    // respeitam a policy por tenant (defesa em profundidade).
    const calls = await readTenantScoped<any[]>(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT c.id, c.phone_last4, c.started_at, c.ended_at, c.duration_s, c.status,
             COALESCE((SELECT json_agg(json_build_object('total', s.total, 'criteria', s.criteria, 'model', s.model))
                       FROM voice_scorecards s WHERE s.call_id = c.id), '[]'::json) AS voice_scorecards
             FROM voice_calls c
             WHERE c.tenant_id = $1
             ORDER BY c.started_at DESC LIMIT $2`,
          [tenantId, limit],
        );
        return rows;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('voice_calls')
          .select(`
            id, phone_last4, started_at, ended_at, duration_s, status,
            voice_scorecards(total, criteria, model)
          `)
          .eq('tenant_id', tenantId)
          .order('started_at', { ascending: false })
          .limit(limit);
        return data ?? [];
      },
    });

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
    const tenantId = (req as any).user?.tenantId;
    const callId = (req.params as any).id;
    if (!tenantId) return reply.code(401).send({ error: 'Unauthorized' });

    // MT-02(c): RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    // Embeds `voice_scorecards`/`voice_transcripts` reproduzidos via json_agg no RLS.
    const call = await readTenantScoped<any | null>(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT c.id, c.phone_last4, c.started_at, c.ended_at, c.duration_s, c.status,
             COALESCE((SELECT json_agg(json_build_object('total', s.total, 'criteria', s.criteria, 'model', s.model))
                       FROM voice_scorecards s WHERE s.call_id = c.id), '[]'::json) AS voice_scorecards,
             COALESCE((SELECT json_agg(json_build_object('id', t.id, 'role', t.role, 'content', t.content, 't_offset_ms', t.t_offset_ms))
                       FROM voice_transcripts t WHERE t.call_id = c.id), '[]'::json) AS voice_transcripts
             FROM voice_calls c
             WHERE c.id = $1 AND c.tenant_id = $2 LIMIT 1`,
          [callId, tenantId],
        );
        return rows[0] ?? null;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('voice_calls')
          .select(`
            id, phone_last4, started_at, ended_at, duration_s, status,
            voice_scorecards(total, criteria, model),
            voice_transcripts(id, role, content, t_offset_ms)
          `)
          .eq('id', callId)
          .eq('tenant_id', tenantId)
          .single();
        return data ?? null;
      },
    });

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
