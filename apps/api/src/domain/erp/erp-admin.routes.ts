import { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { encryptCredentials, decryptCredentials } from '../../adapters/erp/credential-cipher';
import { createErpProvider, isErpImplemented } from '../../adapters/erp/erp.factory';
import { createOAuthTokenCache } from '../../adapters/erp/erp-oauth-cache.service';
import type { ERPProviderName, ERPCredentials } from '../../adapters/erp/erp.types';

// rbx e radiusnet têm tipo + adapter no factory, mas estavam fora desta lista → o
// wizard rejeitava providers IMPLEMENTADOS (ERPIntegrationsPage.tsx usa os dois).
// Alinhado ao factory (7/7 adapters implementados).
const ALLOWED_PROVIDERS: ERPProviderName[] = ['ixc', 'mkauth', 'voalle', 'sgp', 'hubsoft', 'radiusnet', 'rbx'];

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
    const tenantId = getTenantId((req as any).user);
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
      const tenantId = getTenantId((req as any).user);
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const { provider, credentials, active = true } = req.body;
      if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
        return reply.code(400).send({ error: `provider inválido. Aceitos: ${ALLOWED_PROVIDERS.join(', ')}` });
      }
      // Aceita provedores token-based (ixc/hubsoft/sgp/rbx: url+token) E OAuth
      // (voalle: url+clientSecret). Exige a URL + ao menos um segredo.
      if (!credentials?.url || (!credentials?.token && !credentials?.clientSecret && !credentials?.password)) {
        return reply.code(400).send({ error: 'credentials.url e um segredo (token ou clientSecret) são obrigatórios' });
      }
      // SGP — validado ao vivo 2026-08-28 (demo.sgp.net.br): a API real exige
      // `app` (nome exato da Aplicação vinculada ao token no painel SGP,
      // case-sensitive) além do token. Sem isso, todo request falha com 403
      // "Credenciais de autenticação incorretas" mesmo com token válido.
      if (provider === 'sgp' && !credentials?.app) {
        return reply.code(400).send({ error: 'credentials.app é obrigatório para o SGP (nome da Aplicação cadastrada no painel SGP)' });
      }
      // Voalle — reescrito 2026-08-29 (fonte: SDK Go de terceiros github.com/raykavin/elleven-go,
      // sem doc oficial pública). O grant client_credentials exige um 3º segredo, `syndata`
      // (Suite → Settings → Parameters → Integration/Map), que o check genérico acima não pedia.
      if (
        provider === 'voalle' &&
        !credentials?.token &&
        !(credentials?.clientId && credentials?.clientSecret && credentials?.syndata)
      ) {
        return reply.code(400).send({
          error: 'credentials para voalle exigem token OU (clientId + clientSecret + syndata)',
        });
      }
      // Hubsoft — confirmado 2026-08-29 contra a doc oficial (github.com/hubsoftbrasil/api):
      // a API só documenta grant_type "password", que exige os 4 campos juntos (não basta
      // clientId+clientSecret como no Voalle). Sem isso o request de /oauth/token falha.
      if (
        provider === 'hubsoft' &&
        !credentials?.token &&
        !(credentials?.clientId && credentials?.clientSecret && credentials?.username && credentials?.password)
      ) {
        return reply.code(400).send({
          error: 'credentials para hubsoft exigem token OU (clientId + clientSecret + username + password)',
        });
      }
      // MK-Auth — reescrito 2026-08-29 (a API real usa Basic Auth Client_id:Client_Secret,
      // não usuário/senha do painel). O check genérico acima aceita `clientSecret` sozinho
      // como "segredo presente" — sem isso, salvaria uma credencial incompleta que só falha
      // depois, no primeiro request de verdade.
      if (
        provider === 'mkauth' &&
        !credentials?.token &&
        !(credentials?.clientId && credentials?.clientSecret)
      ) {
        return reply.code(400).send({
          error: 'credentials para mkauth exigem token OU (clientId + clientSecret)',
        });
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
      const tenantId = getTenantId((req as any).user);
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
      const tenantId = getTenantId((req as any).user);
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const provider = req.params.provider as ERPProviderName;
      if (!ALLOWED_PROVIDERS.includes(provider)) {
        return reply.code(400).send({ error: `provider inválido` });
      }
      if (!isErpImplemented(provider)) {
        return reply.code(422).send({ error: `provider ${provider} ainda não implementado` });
      }

      const { data, error } = await supabase
        .from('tenant_erp_credentials')
        .select('credentials_encrypted')
        .eq('tenant_id', tenantId)
        .eq('provider', provider)
        .maybeSingle();

      if (error) return reply.code(500).send({ error: 'Erro ao buscar credenciais' });

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
        const adapter = createErpProvider(provider, creds, undefined, createOAuthTokenCache(tenantId, provider));
        const testCpf = req.body?.test_cpf ?? '00000000000';
        const result = await adapter.findCustomerByCpf(testCpf);
        return { ok: true, provider, sample: result };
      } catch (err) {
        return reply.code(422).send({ ok: false, error: (err as Error).message });
      }
    },
  );
}
