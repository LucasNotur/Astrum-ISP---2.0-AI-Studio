/**
 * F1-D — InventoryPage importava CSV direto no Supabase (client anônimo,
 * bloqueado pela migration 092), linha a linha, gravando `price` — coluna
 * inexistente (a real é `price_cents`, verificado via MCP). O
 * `provedor/inventory.service.ts` existente modela um conceito diferente
 * (multi-filial, sku, serialNumbers) que não bate com a tabela real `inventory`
 * (flat, sem branch/sku) — por isso esta rota grava direto, sem reusar aquele
 * serviço órfão.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

interface ImportItem {
  name: string;
  category?: string;
  stock?: number;
  minStock?: number;
  priceCents?: number;
}

export async function inventoryImportRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // POST /api/v2/inventory/import — importação em lote via CSV (InventoryPage).
  app.post('/api/v2/inventory/import', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body as { items?: ImportItem[] }) ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'items é obrigatório e não pode ser vazio' });

    const rows = items.map((it) => ({
      tenant_id: tenantId,
      name: it.name || 'Item sem nome',
      category: it.category || 'Geral',
      stock: Number.isFinite(it.stock) ? it.stock : 0,
      min_stock: Number.isFinite(it.minStock) ? it.minStock : 5,
      price_cents: Number.isFinite(it.priceCents) ? it.priceCents : 0,
    }));

    const { data, error } = await supabaseAdmin.from('inventory').insert(rows).select('id');
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ imported: data?.length ?? 0 });
  });
}
