/**
 * Flags públicas expostas ao frontend via GET /api/v2/flags/public.
 *
 * Regras:
 * - Whitelist explícita: NUNCA iterar process.env.
 * - Cada sessão IA-XX adiciona uma entrada: '<chave client>': '<ENV_SERVER>'.
 * - Valores são normalizados para boolean (apenas 'true' ativa).
 */

const PUBLIC_FLAGS: Record<string, string> = {
  hub: 'INTELLIGENCE_HUB_ENABLED',
  toolreg: 'TOOL_REGISTRY_ENABLED',
};

export function getPublicFlags(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(PUBLIC_FLAGS).map(([key, env]) => [
      key,
      (process.env[env] ?? '').trim().toLowerCase() === 'true',
    ]),
  );
}
