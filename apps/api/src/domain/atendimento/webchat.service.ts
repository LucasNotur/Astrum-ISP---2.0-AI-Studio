/**
 * Fase 3 — port de `src/routes/webchat.ts` (nunca montado em `server.ts`, bug
 * pré-existente inventariado no PLANO_MIGRACAO_EXPRESS_FASTIFY.md §5).
 * `src/pages/WebchatPage.tsx` (widget embeddable no site do ISP) chama
 * `/api/webchat/config` e `/api/webchat/message` desde sempre — 404 hoje.
 *
 * Público por natureza: visitante anônimo no site do ISP não tem JWT, então
 * `tenantId` vem do próprio request (query/body), não do header Authorization
 * — diferente de toda rota operador-facing do resto do apps/api. A defesa aqui
 * é o rate-limit global por IP (`rate-limit.plugin.ts`, já cobre todo /api/*)
 * + validação de shape.
 *
 * Lógica pura, sem I/O — a rota Fastify só faz I/O + chama isto.
 */

export interface TenantThemeRow {
  extra?: Record<string, unknown> | null;
}

export interface WebchatConfig {
  primary_color: string;
  logo_url: string;
  agent_name: string;
}

/** Extrai a config pública e segura do widget a partir da linha do tenant. Pura. */
export function extractWebchatConfig(tenantRow: TenantThemeRow | null): WebchatConfig | null {
  if (!tenantRow) return null;
  const extra = (tenantRow.extra ?? {}) as Record<string, any>;
  const theme = (extra.theme ?? {}) as Record<string, any>;
  return {
    primary_color: theme.primary_color || '#00C896',
    logo_url: theme.logo_url || '',
    agent_name: extra.agent_name || 'Agente',
  };
}

export class WebchatMessageValidationError extends Error {}

export interface WebchatMessageInput {
  tenantId: string;
  sessionId: string;
  text: string;
}

const MAX_MESSAGE_LENGTH = 4000;

/** Valida e normaliza o body de POST /webchat/message. Pura. */
export function validateWebchatMessage(body: any): WebchatMessageInput {
  const tenantId = String(body?.tenantId ?? '').trim();
  const sessionId = String(body?.sessionId ?? '').trim();
  const text = String(body?.text ?? '').trim();

  if (!tenantId) throw new WebchatMessageValidationError('tenantId is required');
  if (!sessionId) throw new WebchatMessageValidationError('sessionId is required');
  if (!text) throw new WebchatMessageValidationError('text is required');
  if (text.length > MAX_MESSAGE_LENGTH) throw new WebchatMessageValidationError('text too long');

  return { tenantId, sessionId, text };
}
