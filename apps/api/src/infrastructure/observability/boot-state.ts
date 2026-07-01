/**
 * Boot State — estado de inicialização do servidor Fastify (apps/api).
 *
 * Contexto (S68): durante a transição Strangler Fig, o Fastify sobe como processo
 * de fundo do Express e seu erro de boot era ENGOLIDO (catch vazio) para "não
 * derrubar o Express". Isso escondia falhas do motor novo. Este módulo registra a
 * falha para que o health-check do Express a exponha (`fastify_boot_failed`).
 *
 * O `process.exit(1)` em falha de boot só volta na S82, quando o Fastify vira o
 * processo principal. Até lá, a visibilidade é o mecanismo de alerta.
 */

export interface BootState {
  fastifyBooted: boolean;
  fastifyBootFailed: boolean;
  lastError: string | null;
  failedAt: string | null;
}

const state: BootState = {
  fastifyBooted: false,
  fastifyBootFailed: false,
  lastError: null,
  failedAt: null,
};

export function markFastifyBooted(): void {
  state.fastifyBooted = true;
  state.fastifyBootFailed = false;
  state.lastError = null;
  state.failedAt = null;
}

export function markFastifyBootFailed(err: unknown): void {
  state.fastifyBooted = false;
  state.fastifyBootFailed = true;
  state.lastError = err instanceof Error ? err.message : String(err);
  state.failedAt = new Date().toISOString();
}

export function getBootState(): Readonly<BootState> {
  return { ...state };
}

/** Reset — uso em testes. */
export function _resetBootState(): void {
  state.fastifyBooted = false;
  state.fastifyBootFailed = false;
  state.lastError = null;
  state.failedAt = null;
}
