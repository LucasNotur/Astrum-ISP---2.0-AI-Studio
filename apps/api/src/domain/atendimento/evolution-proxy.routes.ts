import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { buildEvolutionTarget, normalizeMethod, EvolutionProxyError } from './evolution-proxy.service';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

/**
 * Proxy Evolution API v2 (port do Express /api/evolution/proxy) — FASE 2-A.5.
 * Credenciais resolvidas SERVER-SIDE (resolveTenantKeys); o cliente só manda `path` relativo.
 * Gate: `authenticate` (operador — é o Chat/WhatsApp do próprio tenant; creds pinadas ao tenant do JWT).
 */
export async function evolutionProxyRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.post('/api/v2/evolution/proxy', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { path, method, body } = (req.body ?? {}) as { path?: string; method?: string; body?: unknown };

    let target: string;
    let apikey: string;
    try {
      const keys = await resolveTenantKeys(tenantId);
      apikey = keys.evolutionApiKey;
      target = buildEvolutionTarget(keys.evolutionUrl, path);
    } catch (e) {
      if (e instanceof EvolutionProxyError) return reply.code(e.statusCode).send({ error: e.message });
      return reply.code(500).send({ error: 'Falha ao resolver credenciais da Evolution.' });
    }

    const m = normalizeMethod(method);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const init: RequestInit = {
        method: m,
        headers: { 'Content-Type': 'application/json', apikey },
        signal: controller.signal,
      };
      if (body && typeof body === 'object' && Object.keys(body).length > 0 && m !== 'GET' && m !== 'HEAD') {
        init.body = JSON.stringify(body);
      }
      const res = await fetch(target, init);
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      return reply.code(res.status).send(data);
    } catch {
      return reply.code(502).send({ error: 'Falha ao conectar na Evolution API.' });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Legado mockado (histórico real vem do worker). Mantém o contrato p/ o ChatPage.
  app.get('/api/v2/evolution/fetch-history', { onRequest: auth }, async (_req, reply) => {
    return reply.send({ messages: [] });
  });
}
