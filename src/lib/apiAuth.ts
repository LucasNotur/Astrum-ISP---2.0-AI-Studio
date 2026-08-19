/**
 * Ponte entre o login legado (Supabase Auth, usado pelo `/src`) e o auth próprio
 * do apps/api (JWT com iss/aud dedicados — ver server.ts `authenticate`). São dois
 * sistemas de auth independentes que compartilham a tabela `users`, mas não o
 * mecanismo de sessão: um login no Supabase Auth NÃO gera um token aceito pelo
 * Fastify. Sem esta ponte, toda chamada de `apiClient` para o apps/api volta 401.
 *
 * Token fica só em memória (mesmo padrão de `src/lib/supabase.ts`: persistSession
 * false) — some ao recarregar a página, o que é aceitável porque o gate real de
 * navegação continua sendo a sessão do Supabase.
 */
import { API_BASE_URL } from './apiClient';

export interface ApiTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos
}

type LoginOutcome =
  | { kind: 'ok' }
  | { kind: 'mfa_required'; mfaToken: string }
  | { kind: 'reset_required'; message: string }
  | { kind: 'error'; message: string };

let tokens: ApiTokenPair | null = null;
let accessTokenExpiresAt = 0; // epoch ms
let refreshInFlight: Promise<boolean> | null = null;

function storeTokens(pair: ApiTokenPair) {
  tokens = pair;
  // Margem de 30s pra não bater o refresh em cima da hora da expiração real.
  accessTokenExpiresAt = Date.now() + (pair.expiresIn * 1000) - 30_000;
}

export function clearApiTokens() {
  tokens = null;
  accessTokenExpiresAt = 0;
}

async function postJson(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** Login no apps/api com a mesma senha usada no Supabase Auth. */
export async function loginToApi(email: string, password: string): Promise<LoginOutcome> {
  try {
    const { status, data } = await postJson('/api/v2/auth/login', { email, password });

    if (status !== 200) {
      return { kind: 'error', message: data?.message || `Falha no login do apps/api (HTTP ${status}).` };
    }
    if (data.kind === 'mfa_required') {
      return { kind: 'mfa_required', mfaToken: data.mfaToken };
    }
    if (data.kind === 'reset_required') {
      return { kind: 'reset_required', message: data.message };
    }
    if (data.kind === 'ok' && data.tokens?.accessToken) {
      storeTokens(data.tokens);
      return { kind: 'ok' };
    }
    return { kind: 'error', message: 'Resposta de login do apps/api em formato inesperado.' };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'apps/api inacessível.' };
  }
}

/** Segunda etapa quando `loginToApi` retorna mfa_required. */
export async function submitApiMfaChallenge(mfaToken: string, code: string): Promise<LoginOutcome> {
  try {
    const { status, data } = await postJson('/api/v2/auth/mfa/challenge', { mfaToken, code });
    if (status !== 200 || data.kind !== 'ok' || !data.tokens?.accessToken) {
      return { kind: 'error', message: data?.message || 'Código inválido.' };
    }
    storeTokens(data.tokens);
    return { kind: 'ok' };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'apps/api inacessível.' };
  }
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refreshToken) return false;
  try {
    const { status, data } = await postJson('/api/v2/auth/refresh', { refreshToken: tokens.refreshToken });
    if (status !== 200 || !data.accessToken) {
      clearApiTokens();
      return false;
    }
    storeTokens(data);
    return true;
  } catch {
    return false;
  }
}

/** Token pronto pra usar no header Authorization, renovando antes se estiver perto de expirar. */
export async function getApiAccessToken(): Promise<string | null> {
  if (!tokens) return null;
  if (Date.now() >= accessTokenExpiresAt) {
    if (!refreshInFlight) refreshInFlight = refreshTokens().finally(() => { refreshInFlight = null; });
    const ok = await refreshInFlight;
    if (!ok) return null;
  }
  return tokens?.accessToken ?? null;
}

export function hasApiSession(): boolean {
  return tokens !== null;
}
