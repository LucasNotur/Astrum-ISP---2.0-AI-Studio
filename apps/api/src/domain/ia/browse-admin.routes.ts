import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { readTenantScoped, writeTenantScoped } from '../../infrastructure/database/tenant-rls';

export async function browseAdminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/browse/allowlist', async (req) => {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return { domains: [] };

    // MT-02(c): leitura via RLS por-tenant quando a flag está ligada (pós-096);
    // senão, caminho service_role atual. Mesmo shape de retorno nos dois.
    const domains = await readTenantScoped(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT domain, added_by, created_at FROM browse_allowlist
             WHERE tenant_id = $1 ORDER BY created_at DESC`,
          [tenantId],
        );
        return rows;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('browse_allowlist')
          .select('domain, added_by, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
        return data ?? [];
      },
    });

    return { domains };
  });

  app.post<{ Body: { domain: string } }>('/api/v2/ia/browse/allowlist', async (req, reply) => {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const { domain } = req.body;
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return reply.code(400).send({ error: 'Domínio inválido' });
    }

    const userId = (req as any).user?.sub ?? (req as any).user?.id ?? 'unknown';

    // MT-02(c): escrita RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    try {
      await writeTenantScoped(tenantId, {
        rls: async (db) => {
          await db.query(
            `INSERT INTO browse_allowlist (tenant_id, domain, added_by)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, domain) DO UPDATE SET added_by = EXCLUDED.added_by`,
            [tenantId, domain.toLowerCase(), userId],
          );
        },
        fallback: async () => {
          const { error } = await supabaseAdmin
            .from('browse_allowlist')
            .upsert({
              tenant_id: tenantId,
              domain: domain.toLowerCase(),
              added_by: userId,
            }, { onConflict: 'tenant_id,domain' });
          if (error) throw new Error(error.message);
        },
      });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'db error' });
    }
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { domain: string } }>(
    '/api/v2/ia/browse/allowlist/:domain',
    async (req, reply) => {
      const tenantId = (req as any).user?.tenantId;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      // MT-02(c): escrita RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
      try {
        await writeTenantScoped(tenantId, {
          rls: async (db) => {
            await db.query(
              `DELETE FROM browse_allowlist WHERE tenant_id = $1 AND domain = $2`,
              [tenantId, req.params.domain.toLowerCase()],
            );
          },
          fallback: async () => {
            const { error } = await supabaseAdmin
              .from('browse_allowlist')
              .delete()
              .eq('tenant_id', tenantId)
              .eq('domain', req.params.domain.toLowerCase());
            if (error) throw new Error(error.message);
          },
        });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'db error' });
      }
      return { ok: true };
    },
  );
}
