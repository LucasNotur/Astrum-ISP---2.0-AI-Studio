import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) =>
        Promise.resolve(resolve({ data: [{ domain: 'status.example.com' }, { domain: 'prefeitura.gov.br' }], error: null })),
      ),
    })),
  },
}));

vi.mock('dns/promises', () => ({
  resolve: vi.fn(),
}));

import { resolve as mockDnsResolve } from 'dns/promises';
import {
  isPrivateIp,
  extractDomain,
  domainMatches,
  guardUrl,
} from './url-guard';

const dnsResolve = mockDnsResolve as ReturnType<typeof vi.fn>;

describe('url-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects all private IP ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
  });

  it('allows public IPs', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('200.160.0.1')).toBe(false);
  });

  it('extractDomain returns hostname for http/https', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
    expect(extractDomain('http://Sub.Example.COM')).toBe('sub.example.com');
  });

  it('extractDomain rejects non-http protocols', () => {
    expect(extractDomain('ftp://evil.com')).toBe(null);
    expect(extractDomain('file:///etc/passwd')).toBe(null);
  });

  it('domainMatches exact match', () => {
    expect(domainMatches('example.com', 'example.com')).toBe(true);
    expect(domainMatches('other.com', 'example.com')).toBe(false);
  });

  it('domainMatches subdomain match', () => {
    expect(domainMatches('sub.example.com', 'example.com')).toBe(true);
    expect(domainMatches('deep.sub.example.com', 'example.com')).toBe(true);
  });

  it('guardUrl rejects domain not in allowlist', async () => {
    dnsResolve.mockResolvedValue(['8.8.8.8']);
    const result = await guardUrl('https://evil.com/steal', 't1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/fora da lista/);
  });

  it('guardUrl rejects private IP after DNS resolve', async () => {
    dnsResolve.mockResolvedValue(['10.0.0.1']);
    const result = await guardUrl('https://status.example.com', 't1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/privado/i);
  });

  it('guardUrl allows valid public URL in allowlist', async () => {
    dnsResolve.mockResolvedValue(['93.184.216.34']);
    const result = await guardUrl('https://status.example.com/page', 't1');
    expect(result.ok).toBe(true);
    expect(result.resolvedIp).toBe('93.184.216.34');
  });

  it('guardUrl rejects metadata IP 169.254.169.254', async () => {
    dnsResolve.mockResolvedValue(['169.254.169.254']);
    const result = await guardUrl('https://status.example.com', 't1');
    expect(result.ok).toBe(false);
  });
});
