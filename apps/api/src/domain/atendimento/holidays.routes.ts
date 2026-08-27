import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { computeNationalHolidays, mergeHolidays } from './holidays.service';

/**
 * Feriados (SettingsPage.tsx, aba Feriados). `tenants.holidays` (jsonb array,
 * migration 122) — antes o add/remove/leitura manual iam direto ao Supabase
 * anônimo (bloqueado desde a 092); só `fetch-national` já tinha rota real.
 *
 *   GET  /api/v2/settings/holidays                  → { holidays: [...] }
 *   PUT  /api/v2/settings/holidays                  → substitui a lista inteira
 *   POST /api/v2/settings/holidays/fetch-national    → { count } (mescla nacionais)
 *
 * Tenant sempre vem do JWT.
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function holidaysRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/settings/holidays', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('holidays')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ holidays: Array.isArray(data?.holidays) ? data.holidays : [] });
  });

  app.put('/api/v2/settings/holidays', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { holidays } = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(holidays)) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'holidays obrigatório (array)' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ holidays })
      .eq('id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  app.post('/api/v2/settings/holidays/fetch-national', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const year = new Date().getFullYear();
    const national = computeNationalHolidays(year);

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('holidays')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

    const existing = Array.isArray((data as any)?.holidays) ? (data as any).holidays : [];
    const { merged, added } = mergeHolidays(existing, national);

    const { error: upErr } = await supabaseAdmin
      .from('tenants')
      .update({ holidays: merged })
      .eq('id', tenantId);
    if (upErr) return reply.code(500).send({ code: 'DB_ERROR', message: upErr.message });

    return { count: added, total: merged.length, year };
  });
}
