/**
 * Cliente da API pública de feature flags.
 *
 * Segue o mesmo padrão de base URL do apps/web (que será canibalizado na S78):
 * VITE_API_URL ?? http://localhost:3001.
 */

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

export interface PublicFlagsResponse {
  flags: Record<string, boolean>;
}

/**
 * Busca as flags públicas do backend v2.
 * Fail-closed: qualquer erro retorna objeto vazio.
 */
export async function fetchPublicFlags(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v2/flags/public`);
    if (!res.ok) return {};
    const data = (await res.json()) as PublicFlagsResponse;
    return data.flags ?? {};
  } catch {
    return {};
  }
}
