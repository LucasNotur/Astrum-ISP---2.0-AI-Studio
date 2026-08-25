/**
 * F1-D — não existia nenhuma rota de leitura de `customers` por id em apps/api
 * (maior buraco transversal do inventário F1-INV: CustomerDetailSheet,
 * CustomerHistorySidebar e CustomerDetailsDialog batiam direto no Supabase
 * anônimo, bloqueado pela migration 092).
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function customersRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/customers/:id
  app.get('/api/v2/customers/:id', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    if (!data) return reply.code(404).send({ code: 'NOT_FOUND' });
    return reply.send(data);
  });

  // GET /api/v2/customers/:id/tickets — histórico de tickets do cliente.
  app.get('/api/v2/customers/:id/tickets', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('customer_id', id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/customers/:id/service-orders — histórico de OS do cliente.
  app.get('/api/v2/customers/:id/service-orders', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('service_orders')
      .select('*')
      .eq('customer_id', id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // POST /api/v2/customers/:id/invoices — gera fatura manual (CustomerDetailsDialog).
  app.post('/api/v2/customers/:id/invoices', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };
    const body = (req.body as { amountCents?: number; dueDate?: string }) ?? {};
    if (!body.amountCents || body.amountCents <= 0) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'amountCents é obrigatório e deve ser positivo' });
    }

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .insert({
        customer_id: id,
        tenant_id: tenantId,
        amount_cents: body.amountCents,
        status: 'pending',
        due_date: body.dueDate ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.code(201).send(data);
  });
}
