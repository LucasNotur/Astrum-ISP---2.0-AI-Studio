/**
 * Cliente de API central do frontend — Fase 0 da unificação de backend
 * (ver .astrum-progress/PLANO_MIGRACAO_EXPRESS_FASTIFY.md).
 *
 * PROBLEMA que isto resolve: hoje cada tela faz `fetch('/api/...')` cru, hardcoded,
 * cada uma montando o header de auth do seu jeito (ou esquecendo), e misturando os
 * prefixos `/api/*` (Express legado) e `/api/v2/*` (Fastify). Resultado: chamadas ao
 * backend errado e 404s silenciosos. Este módulo é o PONTO ÚNICO por onde toda
 * chamada deve passar — base URL, `Authorization: Bearer`, JSON e erro num só lugar.
 *
 * Uso:
 *   import { apiGet, apiPost } from '@/src/lib/apiClient';
 *   const data = await apiGet<Dashboard>('/api/v2/valor/dashboard?period=30d');
 *   await apiPost('/api/v2/ia/tools/foo', { enabled: true });
 *
 * O `path` é passado COMO ESTÁ (inclusive o prefixo). A correção dos prefixos
 * errados (`/api/x` → `/api/v2/x`) é a Fase 1 — aqui só centralizamos o mecanismo.
 */
import { supabase } from './supabase';

/** Base URL da API. Vazio = mesma origem (o Express na :3000 roteia /api/v2 → Fastify). */
export const API_BASE_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Header de auth a partir da sessão Supabase ativa (persistSession:false → em memória). */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  /** Objeto vira JSON automaticamente; FormData passa direto (multipart). */
  body?: unknown;
  /** Injeta Authorization: Bearer da sessão. Default true. Use false em rotas públicas. */
  auth?: boolean;
  /** Retorna o Response cru (não parseia/valida). Default false. */
  raw?: boolean;
}

/**
 * Chamada central. Resolve base URL + auth + JSON + erro estruturado.
 * Lança `ApiError` em status não-2xx (com o corpo do erro anexado).
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, auth = true, raw = false, headers, ...rest } = opts;

  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string> | undefined) };
  if (auth) Object.assign(finalHeaders, await authHeader());

  let finalBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData || typeof body === 'string') {
      finalBody = body as BodyInit; // multipart/texto: não forçar content-type
    } else {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json';
      finalBody = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: finalHeaders, body: finalBody });

  if (raw) return res as unknown as T;

  if (!res.ok) {
    let errBody: unknown;
    try {
      errBody = await res.clone().json();
    } catch {
      errBody = await res.text().catch(() => undefined);
    }
    const msg =
      (errBody && typeof errBody === 'object' && 'message' in errBody && (errBody as any).message) ||
      `Erro ${res.status} em ${path}`;
    throw new ApiError(res.status, String(msg), errBody);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  return (contentType.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const apiGet = <T = unknown>(path: string, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'GET' });

export const apiPost = <T = unknown>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'POST', body });

export const apiPut = <T = unknown>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'PUT', body });

export const apiPatch = <T = unknown>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'PATCH', body });

export const apiDelete = <T = unknown>(path: string, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: 'DELETE' });
