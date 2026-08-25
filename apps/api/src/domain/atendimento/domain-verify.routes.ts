import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { promises as dns } from 'node:dns';
import { evaluateDnsMatch, isValidDomain, normalizeHost } from './domain-verify.service';

/**
 * Verificação de DNS de domínio customizado (SettingsPage). Antes o front batia
 * em `/api/domains/verify?domain=` (404):
 *
 *   GET /api/v2/domains/verify?domain=painel.cliente.com.br
 *       → { status: 'verified' | 'error', matchedBy?, error? }
 *
 * Host alvo configurável por env `CUSTOM_DOMAIN_CNAME_TARGET` (default app.astrum.ai).
 * Autenticado (tenant do JWT). Só faz lookup de DNS — nenhuma requisição HTTP ao
 * domínio (sem SSRF). Domínio validado por regex (bloqueia IP/localhost/lixo).
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}

export async function domainVerifyRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const target = normalizeHost(process.env.CUSTOM_DOMAIN_CNAME_TARGET || 'app.astrum.ai');

  app.get('/api/v2/domains/verify', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const domain = normalizeHost((req.query as any)?.domain ?? '');
    if (!isValidDomain(domain)) {
      return reply.code(400).send({ status: 'error', error: 'Domínio inválido.' });
    }

    const [cnames, aRecords, targetIps] = await Promise.all([
      safe(dns.resolveCname(domain)),
      safe(dns.resolve4(domain)),
      safe(dns.resolve4(target)),
    ]);

    return evaluateDnsMatch({
      domainCnames: cnames ?? [],
      domainIps: aRecords ?? [],
      target,
      targetIps: targetIps ?? [],
    });
  });
}
