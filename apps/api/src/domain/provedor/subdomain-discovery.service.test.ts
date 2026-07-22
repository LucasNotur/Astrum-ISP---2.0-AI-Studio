import { describe, it, expect, vi } from 'vitest';
import { isValidSubdomain, resolveHostToTenant, registerSubdomain, addCustomDomain, SubdomainPorts } from './subdomain-discovery.service';

function makePorts(): SubdomainPorts {
  return {
    getBySubdomain: vi.fn().mockResolvedValue(null),
    getByCustomDomain: vi.fn().mockResolvedValue(null),
    register: vi.fn().mockImplementation(async (cfg) => cfg),
    update: vi.fn().mockResolvedValue({}),
    checkCname: vi.fn().mockResolvedValue(true),
  };
}

describe('subdomain-discovery.service', () => {
  describe('isValidSubdomain', () => {
    it('aceita subdomínio válido', () => expect(isValidSubdomain('meu-isp').valid).toBe(true));
    it('rejeita muito curto', () => expect(isValidSubdomain('ab').valid).toBe(false));
    it('rejeita reservado', () => expect(isValidSubdomain('api').valid).toBe(false));
    it('rejeita caracteres especiais', () => expect(isValidSubdomain('meu_isp!').valid).toBe(false));
    it('rejeita maiúsculas', () => expect(isValidSubdomain('MeuISP').valid).toBe(false));
  });

  describe('resolveHostToTenant', () => {
    it('detecta subdomínio', () => {
      expect(resolveHostToTenant('acme.astrum.io', 'astrum.io')).toEqual({ type: 'subdomain', value: 'acme' });
    });
    it('detecta custom domain', () => {
      expect(resolveHostToTenant('app.acme-isp.com.br', 'astrum.io')).toEqual({ type: 'custom', value: 'app.acme-isp.com.br' });
    });
    it('retorna null para base domain puro', () => {
      expect(resolveHostToTenant('astrum.io', 'astrum.io')).toBeNull();
    });
  });

  describe('registerSubdomain', () => {
    it('registra subdomínio válido', async () => {
      const ports = makePorts();
      const result = await registerSubdomain('t1', 'meu-isp', ports);
      expect(result.ok).toBe(true);
      expect(result.config?.subdomain).toBe('meu-isp');
    });
    it('rejeita subdomínio já em uso', async () => {
      const ports = makePorts();
      (ports.getBySubdomain as any).mockResolvedValue({ tenantId: 't-other' });
      const result = await registerSubdomain('t1', 'meu-isp', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('já em uso');
    });
  });

  describe('addCustomDomain', () => {
    it('adiciona domain com CNAME válido', async () => {
      const ports = makePorts();
      const result = await addCustomDomain('t1', 'app.isp.com', 'proxy.astrum.io', ports);
      expect(result.ok).toBe(true);
    });
    it('rejeita CNAME inválido', async () => {
      const ports = makePorts();
      (ports.checkCname as any).mockResolvedValue(false);
      const result = await addCustomDomain('t1', 'app.isp.com', 'proxy.astrum.io', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('CNAME');
    });
    it('rejeita domínio de outro tenant', async () => {
      const ports = makePorts();
      (ports.getByCustomDomain as any).mockResolvedValue({ tenantId: 't-other' });
      const result = await addCustomDomain('t1', 'app.isp.com', 'proxy.astrum.io', ports);
      expect(result.ok).toBe(false);
    });
  });
});
