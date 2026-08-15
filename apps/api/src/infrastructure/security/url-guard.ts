/**
 * Guard anti-SSRF para URLs configuradas por tenant (webhooks, integrações).
 *
 * Bloqueia URLs que apontam para a rede interna / recursos reservados — o vetor clássico
 * de SSRF: um tenant configura `http://169.254.169.254/...` (metadata de nuvem) ou
 * `http://10.0.0.x` e faz o backend (ou um entregador como o Svix) bater em infra interna.
 *
 * ⚠️ Validação de LITERAL de host (formato + faixas de IP reservadas). Não resolve DNS —
 * proteção completa contra DNS-rebinding exige checagem no momento do fetch (resolve→valida).
 * Aqui é a barreira de CONFIG (input do usuário), a primeira e mais importante.
 */

function ipv4ToParts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return parts;
}

function isPrivateOrReservedIpv4(host: string): boolean {
  const p = ipv4ToParts(host);
  if (!p) return false;
  const [a, b] = p;
  if (a === 0) return true;                         // 0.0.0.0/8
  if (a === 10) return true;                        // 10.0.0.0/8 (privado)
  if (a === 127) return true;                       // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (link-local + metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (privado)
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16 (privado)
  if (a === 100 && b >= 64 && b <= 127) return true;// 100.64.0.0/10 (CGNAT)
  if (a >= 224) return true;                        // 224+/multicast/reservado
  return false;
}

function isPrivateOrReservedIpv6(host: string): boolean {
  const h = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (h === '::1' || h === '::') return true;       // loopback / unspecified
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 (ULA)
  if (h.startsWith('fe80')) return true;            // fe80::/10 (link-local)
  // IPv4-mapeado (::ffff:...): o Node comprime o sufixo para hex, então bloqueamos
  // toda a faixa — literais mapeados não aparecem em config de webhook externa legítima.
  if (h.startsWith('::ffff:')) return true;
  return false;
}

/** True se a URL é segura para ser um destino EXTERNO configurado por tenant. */
export function isSafeExternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();
  if (!host) return false;
  // Nomes internos comuns
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }
  if (isPrivateOrReservedIpv4(host)) return false;
  if (host.includes(':') && isPrivateOrReservedIpv6(host)) return false;

  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message = 'URL aponta para host interno/reservado ou é inválida') {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Lança UnsafeUrlError se a URL não for um destino externo seguro. */
export function assertSafeExternalUrl(raw: unknown): string {
  if (!isSafeExternalUrl(raw)) throw new UnsafeUrlError();
  return raw as string;
}
