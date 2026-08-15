import { describe, it, expect } from 'vitest';
import { buildEvolutionTarget, normalizeMethod, EvolutionProxyError } from './evolution-proxy.service';

const URL_OK = 'https://evo.example.com';

describe('buildEvolutionTarget', () => {
  it('monta a URL no host configurado', () => {
    expect(buildEvolutionTarget(URL_OK, '/message/sendText/inst')).toBe('https://evo.example.com/message/sendText/inst');
    expect(buildEvolutionTarget('https://evo.example.com/', '/x')).toBe('https://evo.example.com/x'); // trailing slash
  });

  it('aceita Evolution self-hosted em IP de LAN (não é falso-positivo)', () => {
    expect(buildEvolutionTarget('http://192.168.0.10:8080', '/instance/connect')).toBe('http://192.168.0.10:8080/instance/connect');
  });

  it('bloqueia SSRF: path absoluto / protocol-relative / troca de host', () => {
    expect(() => buildEvolutionTarget(URL_OK, 'http://evil.com/x')).toThrow(EvolutionProxyError); // não começa com /
    expect(() => buildEvolutionTarget(URL_OK, '//evil.com/x')).toThrow(EvolutionProxyError);       // protocol-relative
    expect(() => buildEvolutionTarget(URL_OK, '/\r\nHost: evil')).toThrow(EvolutionProxyError);     // header injection
  });

  it('erra quando não configurado ou túnel morto', () => {
    expect(() => buildEvolutionTarget('', '/x')).toThrow(/não configurada/);
    expect(() => buildEvolutionTarget('https://abc.trycloudflare.com', '/x')).toThrow(/túnel morto/);
  });

  it('path vazio/ausente → 400', () => {
    expect(() => buildEvolutionTarget(URL_OK, '')).toThrow(EvolutionProxyError);
    expect(() => buildEvolutionTarget(URL_OK, undefined)).toThrow(EvolutionProxyError);
  });
});

describe('normalizeMethod', () => {
  it('default GET; aceita verbos válidos; rejeita lixo → GET', () => {
    expect(normalizeMethod(undefined)).toBe('GET');
    expect(normalizeMethod('post')).toBe('POST');
    expect(normalizeMethod('TRACE')).toBe('GET');
  });
});
