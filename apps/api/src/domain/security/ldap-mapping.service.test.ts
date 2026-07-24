import { describe, it, expect, vi } from 'vitest';
import { resolveRole, validateMappings, authenticateViaLdap, LdapGroupMapping, LdapPorts, LdapConfig } from './ldap-mapping.service';

const MAPPINGS: LdapGroupMapping[] = [
  { id: 'm1', tenantId: 't1', ldapGroup: 'CN=Admins,OU=Groups,DC=isp', rbacRole: 'admin', priority: 1 },
  { id: 'm2', tenantId: 't1', ldapGroup: 'CN=Operators,OU=Groups,DC=isp', rbacRole: 'operator', priority: 2 },
  { id: 'm3', tenantId: 't1', ldapGroup: 'CN=Viewers,OU=Groups,DC=isp', rbacRole: 'viewer', priority: 3 },
];

const CONFIG: LdapConfig = {
  tenantId: 't1', serverUrl: 'ldaps://ldap.isp.com', bindDn: 'cn=admin,dc=isp',
  baseDn: 'dc=isp', groupSearchFilter: '(objectClass=group)',
  usernameAttribute: 'sAMAccountName', groupAttribute: 'memberOf', isEnabled: true,
};

function makePorts(): LdapPorts {
  return {
    getConfig: vi.fn().mockResolvedValue(CONFIG),
    listMappings: vi.fn().mockResolvedValue(MAPPINGS),
    saveMappings: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockResolvedValue({
      username: 'joao', email: 'joao@isp.com', displayName: 'João',
      groups: ['CN=Operators,OU=Groups,DC=isp'],
    }),
    assignRole: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ldap-mapping.service', () => {
  describe('resolveRole', () => {
    it('resolve role pelo grupo de maior prioridade', () => {
      expect(resolveRole(['CN=Admins,OU=Groups,DC=isp', 'CN=Operators,OU=Groups,DC=isp'], MAPPINGS)).toBe('admin');
    });
    it('resolve role de grupo único', () => {
      expect(resolveRole(['CN=Viewers,OU=Groups,DC=isp'], MAPPINGS)).toBe('viewer');
    });
    it('retorna null sem match', () => {
      expect(resolveRole(['CN=Unknown,OU=Groups,DC=isp'], MAPPINGS)).toBeNull();
    });
  });

  describe('validateMappings', () => {
    it('aceita mappings válidos', () => {
      expect(validateMappings(MAPPINGS).valid).toBe(true);
    });
    it('rejeita grupo LDAP vazio', () => {
      const bad = [{ ...MAPPINGS[0], ldapGroup: '' }];
      expect(validateMappings(bad).valid).toBe(false);
    });
    it('rejeita grupo duplicado', () => {
      const dup = [MAPPINGS[0], { ...MAPPINGS[1], ldapGroup: MAPPINGS[0].ldapGroup }];
      expect(validateMappings(dup).valid).toBe(false);
    });
  });

  describe('authenticateViaLdap', () => {
    it('autentica e resolve role', async () => {
      const ports = makePorts();
      const result = await authenticateViaLdap('t1', 'joao', 'pass123', ports);
      expect(result.ok).toBe(true);
      expect(result.role).toBe('operator');
    });
    it('rejeita LDAP desabilitado', async () => {
      const ports = makePorts();
      (ports.getConfig as any).mockResolvedValue({ ...CONFIG, isEnabled: false });
      const result = await authenticateViaLdap('t1', 'joao', 'pass', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('desabilitado');
    });
    it('rejeita credenciais inválidas', async () => {
      const ports = makePorts();
      (ports.authenticate as any).mockResolvedValue(null);
      const result = await authenticateViaLdap('t1', 'joao', 'wrong', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Credenciais');
    });
    it('rejeita usuário sem grupo mapeado', async () => {
      const ports = makePorts();
      (ports.authenticate as any).mockResolvedValue({
        username: 'joao', email: 'j@isp.com', displayName: 'J', groups: ['CN=Unknown'],
      });
      const result = await authenticateViaLdap('t1', 'joao', 'pass', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('grupo mapeado');
    });
  });
});
