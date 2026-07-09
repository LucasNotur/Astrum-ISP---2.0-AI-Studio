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

  const guard = await guardUrl(url, tenantId);
  if (!guard.ok) return { error: guard.error! };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }

    const finalUrl = res.url || url;
    const finalDomain = new URL(finalUrl).hostname.toLowerCase();
    const origDomain = new URL(url).hostname.toLowerCase();
    if (finalDomain !== origDomain) {
      const { extractDomain, loadAllowlist, domainMatches } = await import('./url-guard');
      const allowlist = await loadAllowlist(tenantId);
      if (!allowlist.some((d) => domainMatches(finalDomain, d))) {
        return { error: 'Redirect para domínio fora da allowlist' };
      }
    }

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
