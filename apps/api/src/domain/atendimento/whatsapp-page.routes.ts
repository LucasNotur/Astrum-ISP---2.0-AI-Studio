/**
 * F1-B — WhatsAppPage batia direto no Supabase com o client anônimo (bloqueado
 * pela migration 092_p0_rls_hardening.sql) e gravava colunas que não existiam
 * (`tenants.evolution_instances` + upsert em `tenant_evolution_instances` com
 * `label`/`phone_number`/`ai_enabled`) — bug pré-existente, não era só RLS.
 *
 * Hoje o CRUD completo de conexões está migrado pra cá (GET/POST/PATCH/DELETE),
 * com tenant sempre vindo do JWT (nunca do body). As colunas `label`/
 * `phone_number`/`ai_enabled`/`is_primary` passaram a existir de verdade na
 * migration 123_whatsapp_multi_instancia.sql (aplicada). R5: o delete foi a
 * primeira operação portada; ver histórico no PLANO_ACAO_100_OPERACIONAL.md
 * (F1-B) antes de mexer.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { makePortsFor } from '../../adapters/whatsapp/evolution-provision.service';
import { resolveTenantKeys } from '../../lib/tenant-keys';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

/** URL do webhook — mesmo padrão do provisionEvolutionInstance (S91). */
function evolutionWebhookUrl(): string {
  return `${process.env.PUBLIC_API_URL || 'https://api.astrumai.com.br'}/api/v2/webhook/evolution`;
}

export async function whatsappPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/whatsapp/instances — lista as instâncias do tenant do JWT.
  app.get('/api/v2/whatsapp/instances', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { data, error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // POST /api/v2/whatsapp/instances — cria conexão nova (upsert por instance_name,
  // que é o UNIQUE real da tabela — NÃO usar onConflict 'tenant_id,instance_name').
  // `provisionOnEvolution` (default true) cria a instância na Evolution API antes
  // de gravar, sem duplicar a lógica de provisionamento no frontend. As credenciais
  // são as do PRÓPRIO tenant (resolveTenantKeys, BYOK) — um tenant que hospeda a
  // própria Evolution API não pode ter a instância criada no servidor global.
  app.post('/api/v2/whatsapp/instances', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { instanceName, label, isPrimary, provisionOnEvolution } = (req.body ?? {}) as { instanceName?: string; label?: string; isPrimary?: boolean; provisionOnEvolution?: boolean };
    if (!instanceName || !label) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'instanceName e label são obrigatórios.' });

    if (provisionOnEvolution !== false) {
      try {
        const { evolutionUrl, evolutionApiKey } = await resolveTenantKeys(tenantId);
        await makePortsFor(evolutionUrl, evolutionApiKey).createInstance(instanceName, evolutionWebhookUrl());
      } catch (err) {
        return reply.code(502).send({ code: 'PROVISION_ERROR', message: (err as Error).message });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .upsert({ tenant_id: tenantId, instance_name: instanceName, label, is_primary: !!isPrimary, ai_enabled: true, status: 'unknown' }, { onConflict: 'instance_name' })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data);
  });

  // PATCH /api/v2/whatsapp/instances/:instanceName — atualiza label/ai_enabled/
  // phone_number de uma conexão do PRÓPRIO tenant (filtra por tenant_id do JWT,
  // igual ao DELETE — nunca atualiza instância de outro tenant).
  app.patch('/api/v2/whatsapp/instances/:instanceName', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { instanceName } = req.params as { instanceName: string };
    const { label, aiEnabled, phoneNumber } = (req.body ?? {}) as { label?: string; aiEnabled?: boolean; phoneNumber?: string };
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch.label = label;
    if (aiEnabled !== undefined) patch.ai_enabled = aiEnabled;
    if (phoneNumber !== undefined) patch.phone_number = phoneNumber;
    if (Object.keys(patch).length === 0) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Nada para atualizar.' });
    const { data, error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('instance_name', instanceName)
      .select('*')
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    if (!data) return reply.code(404).send({ code: 'NOT_FOUND' });
    return reply.send(data);
  });

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
