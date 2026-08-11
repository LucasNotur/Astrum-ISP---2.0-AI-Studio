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

// OBS-09 (auditoria 2026-08-10): scrub de PII antes de enviar ao Sentry (fora do Brasil →
// transferência internacional/LGPD). Antes só headers eram limpos; body/query/extra vazavam.
const SENTRY_SENSITIVE_KEY =
  /(cpf|cnpj|senha|password|passwd|secret|token|api[_-]?key|authorization|bearer|e?mail|phone|telefone|whatsapp|address|endereco|full[_-]?name|nome[_-]?completo|content|body|text|caption|base64|card|cartao|rg\b)/i;

export function scrubSentryPII(value: any, depth = 0): any {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrubSentryPII(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENTRY_SENSITIVE_KEY.test(k) ? '[REDACTED]' : scrubSentryPII(v, depth + 1);
    }
    return out;
  }
  return value;
}

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

    // Nunca capturar dados sensíveis (OBS-09: agora cobre headers, cookies, body, query e extra)
    beforeSend(event) {
      const req = event.request as any;
      if (req?.headers) {
        delete req.headers['authorization'];
        delete req.headers['cookie'];
        delete req.headers['x-api-key'];
        delete req.headers['x-user-id'];
      }
      if (req) {
        delete req.cookies;
        if (req.data !== undefined) req.data = scrubSentryPII(req.data);
        if (req.query_string !== undefined) req.query_string = '[REDACTED]';
      }
      if (event.extra) event.extra = scrubSentryPII(event.extra);
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
