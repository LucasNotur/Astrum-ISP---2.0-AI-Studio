import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

export async function browseAdminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/browse/allowlist', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { domains: [] };

    const { data } = await supabaseAdmin
      .from('browse_allowlist')
      .select('domain, added_by, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    return { domains: data ?? [] };
  });

  app.post<{ Body: { domain: string } }>('/api/v2/ia/browse/allowlist', async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const { domain } = req.body;
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return reply.code(400).send({ error: 'Domínio inválido' });
    }

    const userId = (req as any).user?.sub ?? (req as any).user?.id ?? 'unknown';

    const { error } = await supabaseAdmin
      .from('browse_allowlist')
      .upsert({
        tenant_id: tenantId,
        domain: domain.toLowerCase(),
        added_by: userId,
      }, { onConflict: 'tenant_id,domain' });

    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { domain: string } }>(
    '/api/v2/ia/browse/allowlist/:domain',
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const { error } = await supabaseAdmin
        .from('browse_allowlist')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('domain', req.params.domain.toLowerCase());

      if (error) return reply.code(500).send({ error: error.message });
      return { ok: true };
    },
  );
}
