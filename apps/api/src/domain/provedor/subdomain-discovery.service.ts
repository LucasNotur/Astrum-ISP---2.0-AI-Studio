/**
 * Dossiê #8 — Sub-domínios Dinâmicos (completude).
 * Item #8 estava parcial (URL param). Agora com resolução DNS,
 * custom domain, validação e CNAME check.
 */

export interface SubdomainConfig {
  tenantId: string;
  subdomain: string;
  customDomain?: string;
  isVerified: boolean;
  sslStatus: 'pending' | 'active' | 'expired';
}

export interface SubdomainPorts {
  getBySubdomain: (subdomain: string) => Promise<SubdomainConfig | null>;
  getByCustomDomain: (domain: string) => Promise<SubdomainConfig | null>;
  register: (config: SubdomainConfig) => Promise<SubdomainConfig>;
  update: (tenantId: string, data: Partial<SubdomainConfig>) => Promise<SubdomainConfig>;
  checkCname: (domain: string, expectedTarget: string) => Promise<boolean>;
}

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = new Set(['www', 'api', 'admin', 'app', 'mail', 'smtp', 'ftp', 'cdn', 'status', 'docs']);

export function isValidSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!SUBDOMAIN_RE.test(subdomain)) return { valid: false, error: 'Subdomínio deve conter apenas letras minúsculas, números e hífens' };
  if (subdomain.length < 3) return { valid: false, error: 'Subdomínio deve ter pelo menos 3 caracteres' };
  if (RESERVED.has(subdomain)) return { valid: false, error: 'Subdomínio reservado' };
  return { valid: true };
}

export function resolveHostToTenant(host: string, baseDomain: string): { type: 'subdomain' | 'custom'; value: string } | null {
  if (host.endsWith(`.${baseDomain}`)) {
    const subdomain = host.replace(`.${baseDomain}`, '');
    if (subdomain && !subdomain.includes('.')) return { type: 'subdomain', value: subdomain };
  }
  if (host !== baseDomain && !host.endsWith(`.${baseDomain}`)) {
    return { type: 'custom', value: host };
  }
  return null;
}

export async function registerSubdomain(
  tenantId: string,
  subdomain: string,
  ports: SubdomainPorts,
): Promise<{ ok: boolean; config?: SubdomainConfig; error?: string }> {
  const validation = isValidSubdomain(subdomain);
  if (!validation.valid) return { ok: false, error: validation.error };

  const existing = await ports.getBySubdomain(subdomain);
  if (existing) return { ok: false, error: 'Subdomínio já em uso' };

  const config = await ports.register({
    tenantId, subdomain, isVerified: true, sslStatus: 'active',
  });
  return { ok: true, config };
}

export async function addCustomDomain(
  tenantId: string,
  domain: string,
  cnameTarget: string,
  ports: SubdomainPorts,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await ports.getByCustomDomain(domain);
  if (existing && existing.tenantId !== tenantId) {
    return { ok: false, error: 'Domínio já registrado por outro tenant' };
  }

  const cnameOk = await ports.checkCname(domain, cnameTarget);
  if (!cnameOk) {
    return { ok: false, error: `CNAME de ${domain} não aponta para ${cnameTarget}` };
  }

  await ports.update(tenantId, { customDomain: domain, isVerified: true, sslStatus: 'pending' });
  return { ok: true };
}
