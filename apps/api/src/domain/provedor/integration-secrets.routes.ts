import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { mergeAndEncryptIntegrationKeys, computeSecretsStatus } from './integration-secrets.service';

/**
 * SEC-R5 — gravação cifrada dos segredos de integração (openaiApiKey/evolutionApiKey).
 * O browser envia o valor em texto puro AQUI (HTTPS + JWT); a cifra AES-256-GCM
 * acontece server-side com ERP_CRED_KEY antes de persistir em tenants.integration_keys.
 * O GET de status nunca devolve o segredo — só se está configurado.
 */
export async function integrationSecretsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/settings/integration-keys/status', { onRequest: auth }, async (req, reply) => {
    const tenantId = getTenantId((req as any).user);
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const { data } = await supabase
      .from('tenants').select('integration_keys').eq('id', tenantId).maybeSingle();
    return computeSecretsStatus((data?.integration_keys as Record<string, string>) ?? {});
  });

  app.put<{ Body: { keys: Record<string, string> } }>(
    '/api/v2/settings/integration-keys',
    { onRequest: auth },
    async (req, reply) => {
      const tenantId = getTenantId((req as any).user);
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const { keys } = req.body;
      if (!keys || typeof keys !== 'object') {
        return reply.code(400).send({ error: 'keys obrigatório (objeto)' });
      }

      const { data } = await supabase
        .from('tenants').select('integration_keys').eq('id', tenantId).maybeSingle();
      const existing = (data?.integration_keys as Record<string, string>) ?? {};

      let merged: Record<string, string>;
      try {
        merged = mergeAndEncryptIntegrationKeys(existing, keys);
      } catch (err) {
        return reply.code(500).send({ error: 'Falha ao cifrar. Verifique ERP_CRED_KEY.' });
      }

      const { error } = await supabase
        .from('tenants').update({ integration_keys: merged }).eq('id', tenantId);
      if (error) return reply.code(500).send({ error: 'Erro ao salvar' });
      return { ok: true };
    },
  );
}
