import { describe, it, expect } from 'vitest';
import { normalizeHost, isValidDomain, evaluateDnsMatch } from './domain-verify.service';

describe('normalizeHost', () => {
  it('lowercase, tira ponto final e espaços', () => {
    expect(normalizeHost('  Painel.Cliente.COM.br.  ')).toBe('painel.cliente.com.br');
  });
});

describe('isValidDomain', () => {
  it('aceita FQDN válido', () => {
    expect(isValidDomain('painel.minhaempresa.com.br')).toBe(true);
  });
  it('rejeita localhost, IP e lixo', () => {
    expect(isValidDomain('localhost')).toBe(false);
    expect(isValidDomain('127.0.0.1')).toBe(false);
    expect(isValidDomain('sem-ponto')).toBe(false);
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain('a b.com')).toBe(false);
  });
});

describe('evaluateDnsMatch', () => {
  const target = 'app.astrum.ai';

  it('verifica por CNAME exato', () => {
    const r = evaluateDnsMatch({ domainCnames: ['app.astrum.ai.'], domainIps: [], target, targetIps: [] });
    expect(r).toEqual({ status: 'verified', matchedBy: 'cname' });
  });

  it('verifica por CNAME sendo subdomínio do target', () => {
    const r = evaluateDnsMatch({ domainCnames: ['edge.app.astrum.ai'], domainIps: [], target, targetIps: [] });
    expect(r.status).toBe('verified');
    expect(r.matchedBy).toBe('cname');
  });

  it('verifica por interseção de IPs quando não há CNAME', () => {
    const r = evaluateDnsMatch({ domainCnames: [], domainIps: ['1.2.3.4'], target, targetIps: ['9.9.9.9', '1.2.3.4'] });
    expect(r).toEqual({ status: 'verified', matchedBy: 'ip' });
  });

  it('erro quando nada bate', () => {
    const r = evaluateDnsMatch({ domainCnames: ['outra.coisa.com'], domainIps: ['8.8.8.8'], target, targetIps: ['1.1.1.1'] });
    expect(r.status).toBe('error');
    expect(r.error).toContain('app.astrum.ai');
  });

  it('não confunde target como sufixo parcial (evil-app.astrum.ai.attacker.com)', () => {
    const r = evaluateDnsMatch({ domainCnames: ['app.astrum.ai.attacker.com'], domainIps: [], target, targetIps: [] });
    expect(r.status).toBe('error');
  });
});
