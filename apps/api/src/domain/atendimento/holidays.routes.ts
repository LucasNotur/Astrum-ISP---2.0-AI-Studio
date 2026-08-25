import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { computeNationalHolidays, mergeHolidays } from './holidays.service';

/**
 * Feriados nacionais (SettingsPage). Add/remove/leitura já vão direto ao Supabase
 * (`tenants.holidays` JSONB). O único gap era carregar os nacionais:
 *
 *   POST /api/v2/settings/holidays/fetch-national  → { count }
 *
 * Computa os nacionais do ano corrente localmente e mescla sem sobrescrever
 * feriados manuais. Tenant vem do JWT (dropado o `?tenantId` do body).
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function holidaysRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

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
