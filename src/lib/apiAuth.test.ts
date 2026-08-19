import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Estado do módulo é global (token em memória) — resetModules + import dinâmico
// por teste garante isolamento, igual ao padrão usado nos outros specs de lib/.
async function freshApiAuth() {
  vi.resetModules();
  return import('./apiAuth');
}

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

describe('apiAuth — ponte de login com o auth próprio do apps/api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login ok guarda o token e getApiAccessToken passa a devolvê-lo', async () => {
    const { loginToApi, getApiAccessToken } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { kind: 'ok', tokens: { accessToken: 'tok-1', refreshToken: 'ref-1', expiresIn: 900 } }),
    );

    const outcome = await loginToApi('a@b.com', 'senha');

    expect(outcome).toEqual({ kind: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/auth/login'),
      expect.objectContaining({ method: 'POST' }),
    );
    await expect(getApiAccessToken()).resolves.toBe('tok-1');
  });

  it('credenciais inválidas → kind error com a mensagem do backend, sem guardar token', async () => {
    const { loginToApi, getApiAccessToken } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Email ou senha incorretos.' }));

    const outcome = await loginToApi('a@b.com', 'errada');

    expect(outcome).toEqual({ kind: 'error', message: 'Email ou senha incorretos.' });
    await expect(getApiAccessToken()).resolves.toBeNull();
  });

  it('usuário com TOTP habilitado → kind mfa_required com o mfaToken', async () => {
    const { loginToApi } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kind: 'mfa_required', mfaToken: 'mfa-tok' }));

    const outcome = await loginToApi('a@b.com', 'senha');

    expect(outcome).toEqual({ kind: 'mfa_required', mfaToken: 'mfa-tok' });
  });

  it('submitApiMfaChallenge com código certo guarda o token da sessão completa', async () => {
    const { submitApiMfaChallenge, getApiAccessToken } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { kind: 'ok', tokens: { accessToken: 'tok-mfa', refreshToken: 'ref-mfa', expiresIn: 900 } }),
    );

    const outcome = await submitApiMfaChallenge('mfa-tok', '123456');

    expect(outcome).toEqual({ kind: 'ok' });
    await expect(getApiAccessToken()).resolves.toBe('tok-mfa');
  });

  it('submitApiMfaChallenge com código errado → error, sem guardar nada', async () => {
    const { submitApiMfaChallenge, getApiAccessToken } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_CODE', message: 'Código inválido.' }));

    const outcome = await submitApiMfaChallenge('mfa-tok', '000000');

    expect(outcome).toEqual({ kind: 'error', message: 'Código inválido.' });
    await expect(getApiAccessToken()).resolves.toBeNull();
  });

  it('token perto de expirar aciona refresh automático antes de devolver', async () => {
    const { loginToApi, getApiAccessToken } = await freshApiAuth();
    // expiresIn curtíssimo → já cai dentro da margem de 30s e força refresh na próxima leitura.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { kind: 'ok', tokens: { accessToken: 'tok-velho', refreshToken: 'ref-1', expiresIn: 1 } }),
    );
    await loginToApi('a@b.com', 'senha');

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'tok-novo', refreshToken: 'ref-2', expiresIn: 900 }),
    );
    const token = await getApiAccessToken();

    expect(token).toBe('tok-novo');
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/v2/auth/refresh'),
      expect.objectContaining({ body: JSON.stringify({ refreshToken: 'ref-1' }) }),
    );
  });

  it('refresh que falha limpa a sessão e devolve null', async () => {
    const { loginToApi, getApiAccessToken, hasApiSession } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { kind: 'ok', tokens: { accessToken: 'tok-velho', refreshToken: 'ref-1', expiresIn: 1 } }),
    );
    await loginToApi('a@b.com', 'senha');

    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'TOKEN_INVALID', message: 'Sessão expirada.' }));
    const token = await getApiAccessToken();

    expect(token).toBeNull();
    expect(hasApiSession()).toBe(false);
  });

  it('clearApiTokens limpa a sessão guardada', async () => {
    const { loginToApi, clearApiTokens, getApiAccessToken, hasApiSession } = await freshApiAuth();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { kind: 'ok', tokens: { accessToken: 'tok-1', refreshToken: 'ref-1', expiresIn: 900 } }),
    );
    await loginToApi('a@b.com', 'senha');
    expect(hasApiSession()).toBe(true);

    clearApiTokens();

    expect(hasApiSession()).toBe(false);
    await expect(getApiAccessToken()).resolves.toBeNull();
  });

  it('apps/api inacessível (fetch rejeita) → kind error, não derruba o login do Supabase', async () => {
    const { loginToApi } = await freshApiAuth();
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const outcome = await loginToApi('a@b.com', 'senha');

    expect(outcome).toEqual({ kind: 'error', message: 'ECONNREFUSED' });
  });
});
