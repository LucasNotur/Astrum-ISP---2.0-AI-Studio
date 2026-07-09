import { FastifyInstance } from 'fastify';
import supabase from '../../infrastructure/database/supabase.client';
import { encryptCredentials, decryptCredentials } from '../../adapters/erp/credential-cipher';
import { createErpProvider, isErpImplemented } from '../../adapters/erp/erp.factory';
import type { ERPProviderName, ERPCredentials } from '../../adapters/erp/erp.types';

const ALLOWED_PROVIDERS: ERPProviderName[] = ['ixc', 'mkauth', 'voalle', 'sgp', 'hubsoft'];

/**
 * P0-01 — Wizard de credenciais ERP (15 minutos).
 *
 * GET    /api/v2/erp/credentials           — lista providers ativos do tenant
 * POST   /api/v2/erp/credentials           — salva/atualiza credential (criptografado)
 * DELETE /api/v2/erp/credentials/:provider — remove credential
 * POST   /api/v2/erp/credentials/:provider/test — sanity check (conecta no ERP e busca CPF de teste)
 */
export async function erpAdminRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/erp/credentials', { onRequest: auth }, async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const { data, error } = await supabase
      .from('tenant_erp_credentials')
      .select('id, provider, active, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('provider');

    if (error) return reply.code(500).send({ error: 'Erro ao listar credenciais' });

    return {
      credentials: (data ?? []).map((r: any) => ({
        ...r,
        implemented: isErpImplemented(r.provider as ERPProviderName),
      })),
    };
  });

  app.post<{ Body: { provider: ERPProviderName; credentials: ERPCredentials; active?: boolean } }>(
    '/api/v2/erp/credentials',
    { onRequest: auth },
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const { provider, credentials, active = true } = req.body;
      if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
        return reply.code(400).send({ error: `provider inválido. Aceitos: ${ALLOWED_PROVIDERS.join(', ')}` });
      }
      if (!credentials?.url || !credentials?.token) {
        return reply.code(400).send({ error: 'credentials.url e credentials.token são obrigatórios' });
      }

      let encrypted: string;
      try {
        encrypted = encryptCredentials(credentials as Record<string, unknown>);
      } catch (err) {
        return reply.code(500).send({ error: 'Falha ao cifrar credenciais. Verifique ERP_CRED_KEY.' });
      }

      const { error } = await supabase
        .from('tenant_erp_credentials')
        .upsert(
          { tenant_id: tenantId, provider, credentials_encrypted: encrypted, active, updated_at: new Date().toISOString() },
          { onConflict: 'tenant_id,provider' },
        );

      if (error) return reply.code(500).send({ error: 'Erro ao salvar credenciais' });
      return reply.code(201).send({ ok: true });
    },
  );

  app.delete<{ Params: { provider: string } }>(
    '/api/v2/erp/credentials/:provider',
    { onRequest: auth },
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const { error } = await supabase
        .from('tenant_erp_credentials')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('provider', req.params.provider);

      if (error) return reply.code(500).send({ error: 'Erro ao remover credenciais' });
      return { ok: true };
    },
  );

  app.post<{ Params: { provider: string }; Body: { test_cpf?: string } }>(
    '/api/v2/erp/credentials/:provider/test',
    { onRequest: auth },
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const provider = req.params.provider as ERPProviderName;
      if (!ALLOWED_PROVIDERS.includes(provider)) {
        return reply.code(400).send({ error: `provider inválido` });
      }
      if (!isErpImplemented(provider)) {
        return reply.code(422).send({ error: `provider ${provider} ainda não implementado` });
      }

      const { data } = await supabase
        .from('tenant_erp_credentials')
        .select('credentials_encrypted')
        .eq('tenant_id', tenantId)
        .eq('provider', provider)
        .maybeSingle();

      if (!data?.credentials_encrypted) {
        return reply.code(404).send({ error: 'Credencial não encontrada para este provider' });
      }

      let creds: ERPCredentials;
      try {
        creds = decryptCredentials<ERPCredentials>(data.credentials_encrypted);
      } catch {
        return reply.code(500).send({ error: 'Falha ao decifrar credenciais' });
      }

      try {
        const adapter = createErpProvider(provider, creds);
        const testCpf = req.body?.test_cpf ?? '00000000000';
        const result = await adapter.findCustomerByCpf(testCpf);
        return { ok: true, provider, sample: result };
      } catch (err) {
        return reply.code(422).send({ ok: false, error: (err as Error).message });
      }
    },
  );
}
