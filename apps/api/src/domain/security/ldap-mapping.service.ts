/**
 * Dossiê #15 — Gestão Role e Mapeamento LDAP (completude).
 * Item #15 estava parcial (RBAC completo, LDAP pendente).
 * Agora com mapeamento LDAP group → RBAC role.
 */

export interface LdapConfig {
  tenantId: string;
  serverUrl: string;
  bindDn: string;
  baseDn: string;
  groupSearchFilter: string;
  usernameAttribute: string;
  groupAttribute: string;
  isEnabled: boolean;
}

export interface LdapGroupMapping {
  id: string;
  tenantId: string;
  ldapGroup: string;
  rbacRole: string;
  priority: number;
}

export interface LdapUser {
  username: string;
  email: string;
  displayName: string;
  groups: string[];
}

export interface LdapPorts {
  getConfig: (tenantId: string) => Promise<LdapConfig | null>;
  listMappings: (tenantId: string) => Promise<LdapGroupMapping[]>;
  saveMappings: (tenantId: string, mappings: LdapGroupMapping[]) => Promise<void>;
  authenticate: (config: LdapConfig, username: string, password: string) => Promise<LdapUser | null>;
  assignRole: (tenantId: string, userId: string, role: string) => Promise<void>;
}

export function resolveRole(userGroups: string[], mappings: LdapGroupMapping[]): string | null {
  const sorted = [...mappings].sort((a, b) => a.priority - b.priority);
  for (const mapping of sorted) {
    if (userGroups.includes(mapping.ldapGroup)) return mapping.rbacRole;
  }
  return null;
}

export function validateMappings(mappings: LdapGroupMapping[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenGroups = new Set<string>();
  for (const m of mappings) {
    if (!m.ldapGroup) errors.push(`Mapping ${m.id}: grupo LDAP vazio`);
    if (!m.rbacRole) errors.push(`Mapping ${m.id}: role RBAC vazia`);
    if (seenGroups.has(m.ldapGroup)) errors.push(`Grupo LDAP "${m.ldapGroup}" duplicado`);
    seenGroups.add(m.ldapGroup);
  }
  return { valid: errors.length === 0, errors };
}

export async function authenticateViaLdap(
  tenantId: string,
  username: string,
  password: string,
  ports: LdapPorts,
): Promise<{ ok: boolean; user?: LdapUser; role?: string; error?: string }> {
  const config = await ports.getConfig(tenantId);
  if (!config || !config.isEnabled) return { ok: false, error: 'LDAP não configurado ou desabilitado' };

  const user = await ports.authenticate(config, username, password);
  if (!user) return { ok: false, error: 'Credenciais LDAP inválidas' };

  const mappings = await ports.listMappings(tenantId);
  const role = resolveRole(user.groups, mappings);
  if (!role) return { ok: false, error: 'Usuário não pertence a nenhum grupo mapeado' };

  return { ok: true, user, role };
}
