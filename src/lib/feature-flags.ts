/**
 * Cliente da API pública de feature flags.
 *
 * Fase 0 (unificação de backend): passou a usar o `apiClient` central. Isso REMOVEU
 * o `API_BASE_URL` hardcoded `http://localhost:3001` (que quebraria em produção — bate
 * direto no Fastify em vez de respeitar a mesma origem/proxy). Agora vai por mesma origem.
 */
import { apiGet } from './apiClient';

export interface PublicFlagsResponse {
  flags: Record<string, boolean>;
}

/**
 * Busca as flags públicas do backend v2.
 * Fail-closed: qualquer erro retorna objeto vazio.
 */
export async function fetchPublicFlags(): Promise<Record<string, boolean>> {
  try {
    const data = await apiGet<PublicFlagsResponse>('/api/v2/flags/public', { auth: false });
    return data.flags ?? {};
  } catch {
    return {};
  }
}
