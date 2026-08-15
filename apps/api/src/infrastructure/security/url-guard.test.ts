import { describe, it, expect } from 'vitest';
import { isSafeExternalUrl, assertSafeExternalUrl, UnsafeUrlError } from './url-guard';

describe('url-guard (anti-SSRF)', () => {
  it('aceita URLs externas https/http válidas', () => {
    expect(isSafeExternalUrl('https://hooks.example.com/webhook')).toBe(true);
    expect(isSafeExternalUrl('http://example.org/path?x=1')).toBe(true);
    expect(isSafeExternalUrl('https://8.8.8.8/endpoint')).toBe(true);
  });

  it('rejeita loopback e localhost', () => {
    expect(isSafeExternalUrl('http://localhost/x')).toBe(false);
    expect(isSafeExternalUrl('http://127.0.0.1:8080/x')).toBe(false);
    expect(isSafeExternalUrl('http://api.localhost/x')).toBe(false);
    expect(isSafeExternalUrl('http://[::1]/x')).toBe(false);
  });

  it('rejeita metadata de nuvem e link-local (169.254.x)', () => {
    expect(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeExternalUrl('http://169.254.0.1/x')).toBe(false);
  });

  it('rejeita faixas privadas (10/8, 172.16/12, 192.168/16, 100.64/10)', () => {
    expect(isSafeExternalUrl('http://10.0.0.5/x')).toBe(false);
    expect(isSafeExternalUrl('http://172.16.3.4/x')).toBe(false);
    expect(isSafeExternalUrl('http://172.31.255.1/x')).toBe(false);
    expect(isSafeExternalUrl('http://192.168.1.1/x')).toBe(false);
    expect(isSafeExternalUrl('http://100.64.0.1/x')).toBe(false);
  });

  it('aceita 172.32.x (fora da faixa privada 172.16-31)', () => {
    expect(isSafeExternalUrl('http://172.32.0.1/x')).toBe(true);
  });

  it('rejeita nomes internos (.local/.internal)', () => {
    expect(isSafeExternalUrl('https://db.internal/x')).toBe(false);
    expect(isSafeExternalUrl('https://printer.local/x')).toBe(false);
  });

  it('rejeita schemes não-http e lixo', () => {
    expect(isSafeExternalUrl('ftp://example.com/x')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl(undefined as any)).toBe(false);
  });

  it('rejeita IPv6 ULA/link-local e IPv4-mapeado privado', () => {
    expect(isSafeExternalUrl('http://[fc00::1]/x')).toBe(false);
    expect(isSafeExternalUrl('http://[fe80::1]/x')).toBe(false);
    expect(isSafeExternalUrl('http://[::ffff:10.0.0.1]/x')).toBe(false);
  });

  it('assertSafeExternalUrl lança em URL insegura, devolve a string em URL ok', () => {
    expect(() => assertSafeExternalUrl('http://10.0.0.1')).toThrow(UnsafeUrlError);
    expect(assertSafeExternalUrl('https://ok.example.com')).toBe('https://ok.example.com');
  });
});
