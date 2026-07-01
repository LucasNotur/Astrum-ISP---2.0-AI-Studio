/**
 * Auth v2 Bridge — substitui o Firebase Auth no frontend legado por JWT/Supabase v2.
 * Plano Mestre V2, S77 (R1: auth é mudança permitida no frontend legado).
 *
 * Expõe a MESMA superfície que o App.tsx legado usa do firebase/auth
 * (onAuthStateChanged, signIn, signOut, currentUser), para trocar o import sem
 * reescrever a tela. Sessão em localStorage 'astrum_auth' (mesmo formato do apps/web).
 *
 * Storage e http são injetáveis → testável fora do browser.
 */

export interface AuthUser {
  uid: string;
  email: string;
  role?: string;
  tenantId?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

type Listener = (user: AuthUser | null) => void;

export interface AuthDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  http: (url: string, init: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;
  baseUrl?: string;
}

const STORAGE_KEY = 'astrum_auth';

/** Decodifica o payload de um JWT (sem verificar assinatura — só para claims de UI). Puro. */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Extrai o usuário de UI a partir do access token. Puro. */
export function userFromToken(accessToken: string | undefined): AuthUser | null {
  if (!accessToken) return null;
  const p = decodeJwtPayload(accessToken);
  if (!p) return null;
  return {
    uid: p.sub ?? p.uid ?? p.user_id ?? '',
    email: p.email ?? '',
    role: p.role,
    tenantId: p.tenant_id ?? p.tenantId,
  };
}

export class AuthV2 {
  private listeners = new Set<Listener>();

  constructor(private deps: AuthDeps) {}

  private get baseUrl() { return this.deps.baseUrl ?? ''; }

  private readSession(): Session | null {
    const raw = this.deps.storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  }

  private writeSession(s: Session | null) {
    if (s) this.deps.storage.setItem(STORAGE_KEY, JSON.stringify(s));
    else this.deps.storage.removeItem(STORAGE_KEY);
    this.emit();
  }

  private emit() {
    const user = this.currentUser();
    for (const l of this.listeners) l(user);
  }

  currentUser(): AuthUser | null {
    return userFromToken(this.readSession()?.accessToken);
  }

  onAuthStateChanged(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.currentUser()); // dispara com o estado atual, como o Firebase
    return () => this.listeners.delete(cb);
  }

  async signInWithPassword(email: string, password: string): Promise<AuthUser> {
    const res = await this.deps.http(`${this.baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Credenciais inválidas');
    const data = await res.json();
    this.writeSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    const user = this.currentUser();
    if (!user) throw new Error('Token inválido recebido do servidor');
    return user;
  }

  async signOut(): Promise<void> {
    this.writeSession(null);
  }
}
