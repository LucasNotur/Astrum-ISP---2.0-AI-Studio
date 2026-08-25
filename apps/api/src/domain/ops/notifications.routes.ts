/**
 * F1-D — MonitoringPage e QualityMonitorPage batiam direto no Supabase (client
 * anônimo, bloqueado pela migration 092) pra listar/marcar `notifications`. A
 * coluna real é `read_at` (timestamp), não `read` (boolean) como o código velho
 * assumia — verificado via MCP antes de escrever a rota.
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function notificationsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/notifications — não lidas do tenant, mais recentes primeiro.
  app.get('/api/v2/notifications', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // PATCH /api/v2/notifications/:id/read — marca uma notificação como lida.
  app.patch('/api/v2/notifications/:id/read', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // PATCH /api/v2/notifications/read-all — marca todas as não lidas do tenant como lidas.
  app.patch('/api/v2/notifications/read-all', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .is('read_at', null);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
