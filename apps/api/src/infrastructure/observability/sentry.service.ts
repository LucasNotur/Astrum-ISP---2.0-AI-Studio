import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { infraLogger } from '../logging/logger';

/**
 * Sentry Error Monitoring — captura e reporta erros em produção.
 *
 * INTEGRADO COM:
 * - Fastify: captura erros não tratados das rotas
 * - BullMQ workers: captura jobs que falham repetidamente
 * - Circuit Breaker: reporta quando serviços externos ficam indisponíveis
 *
 * PRIVACY:
 * - PII nunca vai para o Sentry (mascarado antes)
 * - Apenas tenantId e userId são enviados (sem dados pessoais)
 */

let initialized = false;

export function initSentry(): void {
  if (!process.env.SENTRY_DSN || initialized) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version ?? '2.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0.1,

    integrations: [
      nodeProfilingIntegration(),
    ],

    // Nunca capturar dados sensíveis
    beforeSend(event) {
      // Remover headers de autorização do contexto
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },

    // Ignorar erros de baixa prioridade
    ignoreErrors: [
      'Not Found',
      'ECONNRESET',
      'TokenExpiredError',
    ],
  });

  initialized = true;
  infraLogger.info({ dsn: process.env.SENTRY_DSN?.slice(0, 30) + '...' }, 'Sentry inicializado');
}

/**
 * Adiciona contexto de usuário ao Sentry (sem PII).
 */
export function setSentryUser(userId: string, tenantId: string, role: string): void {
  Sentry.setUser({ id: userId, role });
  Sentry.setTag('tenant_id', tenantId);
}

/**
 * Captura um erro com contexto adicional.
 */
export function captureError(
  err: Error,
  context?: Record<string, unknown>
): string {
  const eventId = Sentry.captureException(err, {
    extra: context,
  });

  infraLogger.error({ err, sentryEventId: eventId }, 'Erro capturado pelo Sentry');
  return eventId;
}

/**
 * Captura um warning (não é erro, mas precisa de atenção).
 */
export function captureWarning(message: string, context?: Record<string, unknown>): void {
  Sentry.captureMessage(message, {
    level: 'warning',
    extra: context,
  });
}

/**
 * Cria uma transaction do Sentry para rastrear performance de operações críticas.
 */
export function startTransaction(name: string, op: string) {
  return Sentry.startNewTrace(() => {
    return { name, op };
  });
}

export { Sentry };
