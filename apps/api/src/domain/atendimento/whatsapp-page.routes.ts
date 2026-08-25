/**
 * F1-B — WhatsAppPage removia instâncias desconectadas batendo direto no Supabase
 * com o client anônimo (bloqueado pela migration 092_p0_rls_hardening.sql).
 *
 * Só esta operação (delete) foi migrada nesta tarefa. As outras duas ocorrências
 * da página (`tenants.evolution_instances` e o upsert em `tenant_evolution_instances`
 * com `label`/`phone_number`/`ai_enabled`) gravam colunas que NÃO EXISTEM na tabela
 * real — bug pré-existente, não é RLS. Ver "Achados colaterais" em
 * PLANO_ACAO_100_OPERACIONAL.md (F1-B) antes de migrá-las.
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function whatsappPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // DELETE /api/v2/whatsapp/instances/:instanceName — remove conexão desconectada.
  app.delete('/api/v2/whatsapp/instances/:instanceName', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { instanceName } = req.params as { instanceName: string };
    const { error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('instance_name', instanceName);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
