import { guardUrl } from './url-guard';
import { extractReadableContent } from '../../domain/provedor/site-scrape';
import { redis } from '../cache/redis.client';
import { infraLogger } from '../logging/logger';

const MAX_BODY_BYTES = 500_000;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const CACHE_TTL_SECONDS = 600;
const CACHE_PREFIX = 'browse';
const USER_AGENT = 'AstrumISP-Agent/1.0';

export function isBrowsingEnabled(): boolean {
  return (process.env.BROWSING_ENABLED ?? '').trim().toLowerCase() === 'true';
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export interface BrowseResult {
  url_final: string;
  title: string;
  text: string;
  fetched_at: string;
}

export async function browseUrl(
  url: string,
  tenantId: string,
): Promise<BrowseResult | { error: string }> {
  if (!isBrowsingEnabled()) {
    return { error: 'Navegação desabilitada' };
  }

  const cacheKey = `${CACHE_PREFIX}:${tenantId}:${url}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as BrowseResult;
  } catch { /* cache miss */ }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // SSRF hardening: seguimos redirects MANUALMENTE, rodando o guard COMPLETO
    // (allowlist + DNS + bloqueio de IP privado) ANTES de cada fetch. Com
    // redirect:'follow' o fetch para o destino do redirect já teria ocorrido antes
    // de qualquer checagem — um 302 → http://169.254.169.254/ vazaria a request.
    // Aqui cada hop (incluindo o inicial) é guardado antes de sair.
    let currentUrl = url;
    let res: Response;
    let hops = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const hopGuard = await guardUrl(currentUrl, tenantId);
      if (!hopGuard.ok) {
        clearTimeout(timeout);
        return {
          error: hops === 0 ? hopGuard.error! : `Redirect bloqueado: ${hopGuard.error}`,
        };
      }

      res = await fetch(currentUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
        redirect: 'manual',
      });

      if (!isRedirectStatus(res.status)) break;

      if (hops >= MAX_REDIRECTS) {
        clearTimeout(timeout);
        return { error: 'Excedeu o número máximo de redirects' };
      }
      const location = res.headers.get('location');
      if (!location) {
        clearTimeout(timeout);
        return { error: 'Redirect sem cabeçalho Location' };
      }
      // Resolve relativo ao URL atual; a próxima volta do laço guarda o destino.
      currentUrl = new URL(location, currentUrl).toString();
      hops++;
    }
    clearTimeout(timeout);

    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }

    const finalUrl = res.url || currentUrl;
    const buffer = await res.arrayBuffer();
    const body = new TextDecoder().decode(buffer.slice(0, MAX_BODY_BYTES));

    const text = extractReadableContent(body);
    const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? '';

    const result: BrowseResult = {
      url_final: finalUrl,
      title,
      text: text.slice(0, 4000),
      fetched_at: new Date().toISOString(),
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch { /* cache write failure is non-fatal */ }

    return result;
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message, url, tenantId }, '[browse] fetch falhou');
    return { error: `Fetch falhou: ${(err as Error).message}` };
  }
}
