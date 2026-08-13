/**
 * Verificação de domínio customizado (SettingsPage → aba "Domínio", whitelabel).
 * Função PURA de decisão: a rota faz os lookups de DNS e injeta os resultados.
 *
 * A UI instrui o cliente a criar um CNAME do seu domínio → host da plataforma
 * (`app.astrum.ai` por padrão, configurável). "Verificado" quando:
 *   (a) algum CNAME do domínio bate com o target, OU
 *   (b) os IPs (A) do domínio intersectam os IPs do target (caso o provedor de
 *       DNS "achate" o CNAME, comum em apex domains).
 *
 * NOTA de escopo: isto só torna o botão "Verificar DNS" funcional (antes 404).
 * SERVIR o SPA sob o domínio custom é outra coisa (topologia — Fase 3 do plano).
 */

/** Normaliza hostname: lowercase, sem ponto final, trim. */
export function normalizeHost(h: string): string {
  return String(h ?? '').trim().toLowerCase().replace(/\.$/, '');
}

/** Aceita apenas hostnames plausíveis (bloqueia IPs, localhost, lixo, espaços). */
export function isValidDomain(domain: string): boolean {
  const d = normalizeHost(domain);
  if (!d || d.length > 253) return false;
  if (d === 'localhost') return false;
  // rejeita IPv4 puro
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(d)) return false;
  // rótulos válidos + pelo menos um ponto (FQDN)
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);
}

export interface DnsInputs {
  domainCnames: string[];
  domainIps: string[];
  target: string;
  targetIps: string[];
}

export interface DomainVerifyResult {
  status: 'verified' | 'error';
  matchedBy?: 'cname' | 'ip';
  error?: string;
}

export function evaluateDnsMatch(input: DnsInputs): DomainVerifyResult {
  const target = normalizeHost(input.target);
  const cnames = (input.domainCnames ?? []).map(normalizeHost).filter(Boolean);

  // (a) CNAME bate com o target (igual ou subdomínio do target)
  if (cnames.some((c) => c === target || c.endsWith(`.${target}`))) {
    return { status: 'verified', matchedBy: 'cname' };
  }

  // (b) interseção de IPs A
  const domainIps = new Set((input.domainIps ?? []).map((s) => s.trim()).filter(Boolean));
  const targetIps = (input.targetIps ?? []).map((s) => s.trim()).filter(Boolean);
  if (targetIps.some((ip) => domainIps.has(ip))) {
    return { status: 'verified', matchedBy: 'ip' };
  }

  return {
    status: 'error',
    error: `O domínio não aponta para ${target}. Verifique o registro CNAME e aguarde a propagação do DNS.`,
  };
}
