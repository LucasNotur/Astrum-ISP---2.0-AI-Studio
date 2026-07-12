import { resolve as dnsResolve } from 'dns/promises';
import { supabaseAdmin } from '../database/supabase.client';

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80/i,
];

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function domainMatches(host: string, allowedDomain: string): boolean {
  const h = host.toLowerCase();
  const d = allowedDomain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export async function loadAllowlist(tenantId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('browse_allowlist')
    .select('domain')
    .eq('tenant_id', tenantId);
  return (data ?? []).map((r: any) => r.domain);
}

export interface GuardResult {
  ok: boolean;
  resolvedIp?: string;
  error?: string;
}

export async function guardUrl(
  url: string,
  tenantId: string,
): Promise<GuardResult> {
  const domain = extractDomain(url);
  if (!domain) return { ok: false, error: 'URL inválida ou protocolo não permitido' };

  const allowlist = await loadAllowlist(tenantId);
  if (!allowlist.some((d) => domainMatches(domain, d))) {
    return { ok: false, error: 'Domínio fora da lista de sites permitidos.' };
  }

  try {
    const addresses = await dnsResolve(domain);
    if (!addresses.length) return { ok: false, error: 'DNS não resolveu' };

    const ip = addresses[0]!;
    if (isPrivateIp(ip)) {
      return { ok: false, error: 'Endereço IP privado não permitido (SSRF protection)' };
    }

    return { ok: true, resolvedIp: ip };
  } catch {
    return { ok: false, error: 'Falha na resolução DNS' };
  }
}
