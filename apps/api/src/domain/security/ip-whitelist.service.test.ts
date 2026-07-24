import { describe, it, expect } from 'vitest';
import { isValidCidr, ipMatchesCidr, isIpAllowed, checkAccess, IpWhitelistPorts, IpWhitelistEntry } from './ip-whitelist.service';

describe('ip-whitelist.service', () => {
  describe('isValidCidr', () => {
    it('aceita IP sem prefixo como /32', () => {
      expect(isValidCidr('192.168.1.1')).toBe(true);
    });

    it('aceita CIDR válido', () => {
      expect(isValidCidr('10.0.0.0/8')).toBe(true);
      expect(isValidCidr('192.168.0.0/24')).toBe(true);
    });

    it('rejeita octeto > 255', () => {
      expect(isValidCidr('256.0.0.1')).toBe(false);
    });

    it('rejeita prefixo > 32', () => {
      expect(isValidCidr('10.0.0.0/33')).toBe(false);
    });

    it('rejeita formato inválido', () => {
      expect(isValidCidr('not-an-ip')).toBe(false);
    });
  });

  describe('ipMatchesCidr', () => {
    it('IP exato match /32', () => {
      expect(ipMatchesCidr('192.168.1.100', '192.168.1.100/32')).toBe(true);
      expect(ipMatchesCidr('192.168.1.101', '192.168.1.100/32')).toBe(false);
    });

    it('subnet /24 match', () => {
      expect(ipMatchesCidr('192.168.1.50', '192.168.1.0/24')).toBe(true);
      expect(ipMatchesCidr('192.168.2.50', '192.168.1.0/24')).toBe(false);
    });

    it('subnet /16 match', () => {
      expect(ipMatchesCidr('10.20.30.40', '10.20.0.0/16')).toBe(true);
      expect(ipMatchesCidr('10.21.30.40', '10.20.0.0/16')).toBe(false);
    });

    it('/0 match tudo', () => {
      expect(ipMatchesCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    });
  });

  describe('isIpAllowed', () => {
    const whitelist: IpWhitelistEntry[] = [
      { id: '1', tenantId: 't1', cidr: '192.168.1.0/24', label: 'Escritório', createdAt: '' },
      { id: '2', tenantId: 't1', cidr: '10.0.0.5', label: 'VPN', createdAt: '' },
    ];

    it('permite IP na whitelist', () => {
      expect(isIpAllowed('192.168.1.50', whitelist)).toBe(true);
      expect(isIpAllowed('10.0.0.5', whitelist)).toBe(true);
    });

    it('bloqueia IP fora da whitelist', () => {
      expect(isIpAllowed('172.16.0.1', whitelist)).toBe(false);
    });

    it('whitelist vazia permite tudo', () => {
      expect(isIpAllowed('1.2.3.4', [])).toBe(true);
    });
  });

  describe('checkAccess', () => {
    it('permite quando whitelist está desabilitada', async () => {
      const ports: IpWhitelistPorts = {
        getWhitelist: async () => [],
        addEntry: async () => ({} as any),
        removeEntry: async () => {},
        isWhitelistEnabled: async () => false,
      };
      const result = await checkAccess('t1', '1.2.3.4', ports);
      expect(result.allowed).toBe(true);
    });

    it('bloqueia IP não autorizado quando habilitada', async () => {
      const ports: IpWhitelistPorts = {
        getWhitelist: async () => [{ id: '1', tenantId: 't1', cidr: '192.168.1.0/24', label: '', createdAt: '' }],
        addEntry: async () => ({} as any),
        removeEntry: async () => {},
        isWhitelistEnabled: async () => true,
      };
      const result = await checkAccess('t1', '10.0.0.1', ports);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('bloqueado');
    });
  });
});
