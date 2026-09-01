/**
 * F1-03 — Seed de demonstração (Rio de Janeiro) escrito via apps/api.
 *
 *   POST /api/v2/admin/seed-demo   { wipe?, customers?, tenantId? }  → conta por tabela
 *   POST /api/v2/admin/wipe-demo   { tenantId? }                     → conta apagada
 *
 * Gate: super_admin (`requirePermission('reports','admin')`, mesmo padrão de
 * super-admin.routes.ts). Escreve via `supabaseAdmin` (service role) — é o único jeito
 * de furar a RLS `tenant_own_*` e escrever de verdade; o seed legado (client anônimo)
 * não conseguia. `tenant_id` vem do JWT do requester (ou do body, override do super_admin).
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { getTenantId } from '../../lib/jwt-claims';
import { infraLogger } from '../../infrastructure/logging/logger';
import { buildDemoDataset, DEMO_TABLES, type DemoDataset } from './seed-demo.service';

const CHUNK = 500;

async function insertChunks(table: string, rows: any[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await (supabaseAdmin as any).from(table).insert(slice);
    if (error) throw new Error(`${table}: ${error.message ?? error}`);
    inserted += slice.length;
  }
  return inserted;
}

async function wipeTenant(tenantId: string): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  for (const table of DEMO_TABLES) {
    const { error, count } = await (supabaseAdmin as any)
      .from(table)
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId);
    if (error) throw new Error(`wipe ${table}: ${error.message ?? error}`);
    deleted[table] = count ?? 0;
  }
  return deleted;
}

export async function seedDemoRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const superAdminOnly = [requirePermission('reports', 'admin')];

  app.post('/api/v2/admin/seed-demo', { onRequest: auth, preHandler: superAdminOnly }, async (req, reply) => {
    const body = (req.body as { wipe?: boolean; customers?: number; tenantId?: string }) ?? {};
    const tenantId = body.tenantId || getTenantId((req as any).user) || '';
    if (!tenantId) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'tenant_id ausente no token e no body' });

    const nCustomers = Math.min(Math.max(body.customers ?? 1500, 1), 5000);

    try {
      let wiped: Record<string, number> | undefined;
      if (body.wipe) wiped = await wipeTenant(tenantId);

      const dataset: DemoDataset = buildDemoDataset(tenantId, { customers: nCustomers });
      const counts: Record<string, number> = {};
      // ordem: independentes primeiro; dependentes (referenciam customer.id) depois.
      // Sem FK enforced, mas mantemos a ordem lógica.
      counts.customers        = await insertChunks('customers', dataset.customers);
      counts.network_ctos     = await insertChunks('network_ctos', dataset.network_ctos);
      counts.technicians      = await insertChunks('technicians', dataset.technicians);
      counts.inventory        = await insertChunks('inventory', dataset.inventory);
      counts.knowledge_articles = await insertChunks('knowledge_articles', dataset.knowledge_articles);
      counts.team_members     = await insertChunks('team_members', dataset.team_members);
      counts.tickets          = await insertChunks('tickets', dataset.tickets);
      counts.service_orders   = await insertChunks('service_orders', dataset.service_orders);
      counts.invoices         = await insertChunks('invoices', dataset.invoices);

      infraLogger.info({ tenantId, counts, wiped }, 'F1-03: seed de demo (Rio) concluído');
      return reply.send({ ok: true, tenantId, city: 'Rio de Janeiro', wiped, counts });
    } catch (err: any) {
      infraLogger.error({ err, tenantId }, 'F1-03: falha no seed de demo');
      return reply.code(500).send({ code: 'SEED_ERROR', message: err?.message ?? String(err) });
    }
  });

  app.post('/api/v2/admin/wipe-demo', { onRequest: auth, preHandler: superAdminOnly }, async (req, reply) => {
    const body = (req.body as { tenantId?: string }) ?? {};
    const tenantId = body.tenantId || getTenantId((req as any).user) || '';
    if (!tenantId) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'tenant_id ausente no token e no body' });
    try {
      const deleted = await wipeTenant(tenantId);
      infraLogger.info({ tenantId, deleted }, 'F1-03: wipe de demo concluído');
      return reply.send({ ok: true, tenantId, deleted });
    } catch (err: any) {
      infraLogger.error({ err, tenantId }, 'F1-03: falha no wipe de demo');
      return reply.code(500).send({ code: 'WIPE_ERROR', message: err?.message ?? String(err) });
    }
  });
}
