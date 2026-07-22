/**
 * Dossiê #102 — IP Whitelisting para painel admin.
 * Permite que cada tenant configure IPs/CIDRs autorizados
 * para acessar o painel administrativo.
 */

export interface IpWhitelistEntry {
  id: string;
  tenantId: string;
  cidr: string;
  label: string;
  createdAt: string;
}

export interface IpWhitelistPorts {
  getWhitelist: (tenantId: string) => Promise<IpWhitelistEntry[]>;
  addEntry: (tenantId: string, cidr: string, label: string) => Promise<IpWhitelistEntry>;
  removeEntry: (tenantId: string, entryId: string) => Promise<void>;
  isWhitelistEnabled: (tenantId: string) => Promise<boolean>;
}

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isValidCidr(cidr: string): boolean {
  const match = cidr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\/(\d{1,2}))?$/);
  if (!match) return false;
  const octets = match[1].split('.').map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return false;
  const prefix = match[2] ? parseInt(match[2], 10) : 32;
  return prefix >= 0 && prefix <= 32;
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  const prefix = prefixStr ? parseInt(prefixStr, 10) : 32;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToNumber(ip) & mask) === (ipToNumber(network) & mask);
}

export function isIpAllowed(ip: string, whitelist: IpWhitelistEntry[]): boolean {
  if (whitelist.length === 0) return true;
  return whitelist.some((entry) => ipMatchesCidr(ip, entry.cidr));
}

export async function checkAccess(
  tenantId: string,
  clientIp: string,
  ports: IpWhitelistPorts,
): Promise<{ allowed: boolean; reason: string }> {
  const enabled = await ports.isWhitelistEnabled(tenantId);
  if (!enabled) return { allowed: true, reason: 'Whitelist desabilitada' };

  const whitelist = await ports.getWhitelist(tenantId);
  if (whitelist.length === 0) return { allowed: true, reason: 'Whitelist vazia (acesso livre)' };

  const allowed = isIpAllowed(clientIp, whitelist);
  return {
    allowed,
    reason: allowed ? `IP ${clientIp} autorizado` : `IP ${clientIp} bloqueado pela whitelist`,
  };
}
