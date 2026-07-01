import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthV2, decodeJwtPayload, userFromToken, type AuthDeps } from './auth-v2';

// JWT de teste (header.payload.sig) — payload base64url
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `h.${b64}.s`;
}

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _map: m,
  };
}

describe('decodeJwtPayload / userFromToken', () => {
  it('decodifica claims', () => {
    const t = makeJwt({ sub: 'u1', email: 'a@b.com', role: 'admin', tenant_id: 't1' });
    expect(decodeJwtPayload(t)).toMatchObject({ sub: 'u1', email: 'a@b.com' });
    expect(userFromToken(t)).toEqual({ uid: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1' });
  });

  it('token inválido → null', () => {
    expect(decodeJwtPayload('lixo')).toBeNull();
    expect(userFromToken(undefined)).toBeNull();
  });
});

describe('AuthV2', () => {
  let storage: ReturnType<typeof memStorage>;
  let http: any;
  let deps: AuthDeps;

  beforeEach(() => {
    storage = memStorage();
    http = vi.fn();
    deps = { storage, http, baseUrl: 'http://api' };
  });

  it('signInWithPassword salva sessão e retorna usuário', async () => {
    const token = makeJwt({ sub: 'u1', email: 'a@b.com', role: 'operator' });
    http.mockResolvedValue({ ok: true, json: async () => ({ accessToken: token, refreshToken: 'r1' }) });
    const auth = new AuthV2(deps);
    const user = await auth.signInWithPassword('a@b.com', 'senha');
    expect(user.email).toBe('a@b.com');
    expect(JSON.parse(storage.getItem('astrum_auth')!).refreshToken).toBe('r1');
  });

  it('signIn com credenciais erradas lança', async () => {
    http.mockResolvedValue({ ok: false, json: async () => ({}) });
    const auth = new AuthV2(deps);
    await expect(auth.signInWithPassword('x', 'y')).rejects.toThrow(/inválidas/);
  });

  it('signOut limpa a sessão', async () => {
    const token = makeJwt({ sub: 'u1', email: 'a@b.com' });
    storage.setItem('astrum_auth', JSON.stringify({ accessToken: token, refreshToken: 'r' }));
    const auth = new AuthV2(deps);
    expect(auth.currentUser()).not.toBeNull();
    await auth.signOut();
    expect(auth.currentUser()).toBeNull();
  });

  it('onAuthStateChanged dispara com estado atual e em mudanças', async () => {
    const token = makeJwt({ sub: 'u1', email: 'a@b.com' });
    http.mockResolvedValue({ ok: true, json: async () => ({ accessToken: token, refreshToken: 'r' }) });
    const auth = new AuthV2(deps);
    const seen: (string | null)[] = [];
    auth.onAuthStateChanged((u) => seen.push(u?.email ?? null));
    expect(seen).toEqual([null]); // estado inicial
    await auth.signInWithPassword('a@b.com', 'senha');
    expect(seen[seen.length - 1]).toBe('a@b.com');
    await auth.signOut();
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('unsubscribe para de notificar', async () => {
    const auth = new AuthV2(deps);
    const cb = vi.fn();
    const unsub = auth.onAuthStateChanged(cb);
    unsub();
    await auth.signOut();
    expect(cb).toHaveBeenCalledTimes(1); // só o disparo inicial
  });
});
