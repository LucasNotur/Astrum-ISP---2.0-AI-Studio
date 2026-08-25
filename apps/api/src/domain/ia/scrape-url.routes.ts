import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { isSafeExternalUrl } from '../../infrastructure/security/url-guard';
import { buildArticleFromHtml } from './scrape-url.service';

/**
 * Scrape ad-hoc de URL → artigo na KB (KnowledgeBasePage). Antes o front batia em
 * `/api/rag/scrape-url` (404):
 *
 *   POST /api/v2/rag/scrape-url  { url }  → { id, title, chars, truncated }
 *
 * Tenant do JWT. URL passa pelo guard anti-SSRF (bloqueia IP privado/loopback/
 * metadata/localhost). ⚠️ o guard valida o LITERAL do host — não resolve DNS, então
 * não cobre DNS-rebinding (limitação herdada do url-guard; barreira de config).
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

const MAX_BYTES = 2_000_000; // 2 MB de HTML — além disso, aborta

export async function scrapeUrlRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.post('/api/v2/rag/scrape-url', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const url = String((req.body as any)?.url ?? '').trim();
    if (!isSafeExternalUrl(url)) {
      return reply.code(400).send({ code: 'BAD_URL', error: 'URL inválida ou aponta para host interno/reservado.' });
    }

    // Fetch com timeout + limite de tamanho + content-type texto.
    let html: string;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'AstrumBot/1.0 (+kb-scrape)' },
        redirect: 'follow',
      });
      if (!res.ok) {
        return reply.code(502).send({ code: 'FETCH_FAILED', error: `A página respondeu ${res.status}.` });
      }
      const ct = res.headers.get('content-type') ?? '';
      if (ct && !/text\/html|text\/plain|application\/xhtml/i.test(ct)) {
        return reply.code(415).send({ code: 'UNSUPPORTED', error: `Tipo de conteúdo não suportado (${ct}).` });
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        return reply.code(413).send({ code: 'TOO_LARGE', error: 'Página grande demais (limite 2 MB).' });
      }
      html = buf.toString('utf-8');
    } catch (e: any) {
      const msg = e?.name === 'TimeoutError' ? 'Tempo esgotado ao buscar a página.' : 'Falha ao buscar a página.';
      return reply.code(502).send({ code: 'FETCH_FAILED', error: msg });
    }

    const article = buildArticleFromHtml(html, url);
    if (!article) {
      return reply.code(422).send({ code: 'EMPTY', error: 'Não foi possível extrair texto útil da página.' });
    }

    const { data, error } = await supabaseAdmin
      .from('knowledge_articles')
      .insert({
        tenant_id: tenantId,
        title: article.title,
        content: article.content,
        category: 'website',
        tags: [url],
        ingest_status: 'pending',
      })
      .select('id')
      .single();

    if (error) return reply.code(500).send({ code: 'DB_ERROR', error: error.message });

    return { id: (data as any).id, title: article.title, chars: article.content.length, truncated: article.truncated };
  });
}
