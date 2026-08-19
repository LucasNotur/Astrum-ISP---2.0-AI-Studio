import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// authHeader() do apiClient pega o token do auth PRÓPRIO do apps/api (não do
// Supabase Auth — são sistemas diferentes, ver src/lib/apiAuth.ts), via import
// dinâmico. vi.hoisted: o vi.mock é içado ao topo; a fn precisa existir antes.
const { getApiAccessToken } = vi.hoisted(() => ({ getApiAccessToken: vi.fn() }));
vi.mock('../../lib/apiAuth', () => ({ getApiAccessToken }));

import { api, apiGet, apiPost, apiDelete, ApiError } from '../../lib/apiClient';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiClient (Fase 0 — cliente central)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    getApiAccessToken.mockResolvedValue('tok-123');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('apiGet injeta Authorization: Bearer da sessão e parseia JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, n: 42 }));
    const out = await apiGet<{ ok: boolean; n: number }>('/api/v2/x');
    expect(out).toEqual({ ok: true, n: 42 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v2/x');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('apiPost serializa objeto como JSON + Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }, 201));
    await apiPost('/api/v2/y', { a: 1, b: 'z' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1, b: 'z' }));
  });

  it('FormData passa direto, SEM Content-Type (deixa o browser setar o boundary)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const fd = new FormData();
    fd.append('file', 'conteudo');
    await apiPost('/api/v2/upload', fd);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.body).toBe(fd);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('auth:false NÃO injeta Authorization (rota pública)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ flags: [] }));
    await apiGet('/api/v2/flags/public', { auth: false });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Authorization).toBeUndefined();
    expect(getApiAccessToken).not.toHaveBeenCalled();
  });

  it('status não-2xx lança ApiError com status + corpo', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'proibido' }, 403));
    await expect(apiGet('/api/v2/z')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
    try {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'proibido' }, 403));
      await apiGet('/api/v2/z');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).body).toEqual({ message: 'proibido' });
      expect((e as ApiError).message).toBe('proibido');
    }
  });

  it('204 No Content retorna undefined (não tenta parsear)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const out = await apiDelete('/api/v2/w/1');
    expect(out).toBeUndefined();
  });

  it('raw:true retorna o Response cru sem validar', async () => {
    const r = jsonResponse({ x: 1 }, 500);
    fetchMock.mockResolvedValueOnce(r);
    const out = await api<Response>('/api/v2/raw', { raw: true });
    expect(out).toBe(r);
  });
});
