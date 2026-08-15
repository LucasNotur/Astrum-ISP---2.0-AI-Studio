import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Guard mockado por-URL: controlamos exatamente quais URLs passam.
vi.mock('./url-guard', () => ({
  guardUrl: vi.fn(),
}));
vi.mock('../cache/redis.client', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') },
}));
vi.mock('../../domain/provedor/site-scrape', () => ({
  extractReadableContent: vi.fn((html: string) => html),
}));
vi.mock('../logging/logger', () => ({
  infraLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { guardUrl } from './url-guard';
import { browseUrl } from './browser.service';

const guard = guardUrl as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}
function okHtml(html: string): Response {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}

describe('browseUrl — SSRF hardening (redirect manual, guard por-hop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BROWSING_ENABLED = 'true';
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BROWSING_ENABLED;
  });

  it('bloqueia redirect para IP interno ANTES de fazer o fetch do destino', async () => {
    // URL inicial (allowlisted) passa; o destino do redirect (metadata) é bloqueado.
    guard.mockImplementation(async (u: string) => {
      if (u.includes('169.254.169.254')) {
        return { ok: false, error: 'Endereço IP privado não permitido (SSRF protection)' };
      }
      return { ok: true, resolvedIp: '93.184.216.34' };
    });
    fetchMock.mockResolvedValueOnce(
      redirectTo('http://169.254.169.254/latest/meta-data/'),
    );

    const result = await browseUrl('https://good.example.com', 't1');

    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/Redirect bloqueado/);
    // A prova do hardening: o fetch NUNCA saiu para o IP interno — só o hop inicial.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://good.example.com');
    // E o fetch inicial usou redirect:'manual' (não 'follow').
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' });
  });

  it('bloqueia a própria URL inicial fora da allowlist sem fazer fetch', async () => {
    guard.mockResolvedValue({ ok: false, error: 'Domínio fora da lista de sites permitidos.' });

    const result = await browseUrl('https://evil.com', 't1');

    expect((result as { error: string }).error).toMatch(/fora da lista/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('segue redirect para destino allowlisted e retorna o conteúdo final', async () => {
    guard.mockResolvedValue({ ok: true, resolvedIp: '93.184.216.34' });
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://good.example.com/final', 301))
      .mockResolvedValueOnce(okHtml('<html><head><title>Olá</title></head><body>corpo</body></html>'));

    const result = await browseUrl('https://good.example.com', 't1');

    expect('error' in result).toBe(false);
    const r = result as { url_final: string; title: string };
    expect(r.title).toBe('Olá');
    expect(r.url_final).toBe('https://good.example.com/final');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Cada hop foi guardado antes do fetch.
    expect(guard).toHaveBeenCalledTimes(2);
  });

  it('aborta quando excede o número máximo de redirects', async () => {
    guard.mockResolvedValue({ ok: true, resolvedIp: '93.184.216.34' });
    // Sempre redireciona para uma nova URL allowlisted → loop infinito barrado pelo cap.
    let n = 0;
    fetchMock.mockImplementation(async () =>
      redirectTo(`https://good.example.com/hop${++n}`),
    );

    const result = await browseUrl('https://good.example.com', 't1');

    expect((result as { error: string }).error).toMatch(/máximo de redirects/i);
    // MAX_REDIRECTS=3 → hops 0..3 = 4 fetches antes de abortar.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('caminho feliz sem redirect retorna título e texto', async () => {
    guard.mockResolvedValue({ ok: true, resolvedIp: '93.184.216.34' });
    fetchMock.mockResolvedValueOnce(
      okHtml('<html><head><title>Status</title></head><body>tudo ok</body></html>'),
    );

    const result = await browseUrl('https://status.example.com', 't1');

    const r = result as { title: string; text: string };
    expect(r.title).toBe('Status');
    expect(r.text).toContain('tudo ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
