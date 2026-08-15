/**
 * Proxy Evolution API v2 — FASE 2-A.5 (port do Express /api/evolution/proxy).
 *
 * Diferença de segurança vs. legado: o legado recebia `evolutionUrl`+`evolutionApiKey`
 * NO BODY, vindos do BROWSER (segredo exposto no cliente + destino arbitrário = SSRF).
 * O v2 resolve as credenciais SERVER-SIDE (resolveTenantKeys) e o cliente só manda o
 * `path` relativo. Aqui fica a validação PURA/testável; a rota faz o I/O (fetch).
 */

export class EvolutionProxyError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'EvolutionProxyError';
  }
}

/**
 * Valida o `path` do cliente e monta a URL de destino, garantindo que ela permanece
 * no MESMO host da Evolution configurada pelo tenant. Impede o path de escapar para
 * outro host (SSRF) via absoluto (`http://…`), protocol-relative (`//host`) ou header
 * injection (`\r\n`).
 *
 * Nota de escopo: NÃO bloqueia IP privado/loopback no host base — o ISP frequentemente
 * self-hosta a Evolution numa LAN, então isso seria falso-positivo. A defesa aqui é o
 * pinning de host: o destino final tem de bater com o host da URL configurada.
 */
export function buildEvolutionTarget(evolutionUrl: string, path: unknown): string {
  if (!evolutionUrl) {
    throw new EvolutionProxyError('Evolution API não configurada para este tenant.', 503);
  }
  if (evolutionUrl.includes('trycloudflare.com')) {
    throw new EvolutionProxyError('Evolution API usando túnel morto (trycloudflare).', 503);
  }
  if (typeof path !== 'string' || path.length === 0) {
    throw new EvolutionProxyError('path é obrigatório.', 400);
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new EvolutionProxyError('path deve ser relativo (começar com "/", sem "//").', 400);
  }
  if (/[\r\n\t]/.test(path)) {
    throw new EvolutionProxyError('path inválido.', 400);
  }

  const base = evolutionUrl.replace(/\/+$/, '');
  let baseHost: string;
  let target: URL;
  try {
    baseHost = new URL(base).host;
    target = new URL(base + path);
  } catch {
    throw new EvolutionProxyError('URL de destino inválida.', 400);
  }
  // Pinning de host — o backstop anti-SSRF.
  if (target.host !== baseHost) {
    throw new EvolutionProxyError('path tentou escapar do host da Evolution.', 400);
  }
  return target.toString();
}

/** Normaliza o método HTTP (default GET; só verbos seguros p/ a Evolution API). */
export function normalizeMethod(method: unknown): string {
  const m = String(method ?? 'GET').toUpperCase();
  return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(m) ? m : 'GET';
}
