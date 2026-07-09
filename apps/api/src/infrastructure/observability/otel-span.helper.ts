/**
 * IA-32 — Helper de span manual.
 *
 * `withSpan(name, attrs, fn)` abre um span, executa `fn`, seta status
 * (OK/ERROR) e fecha o span. Idempotente: se o SDK não estiver
 * registrado (OTEL_ENABLED=false), `fn` é executado normalmente —
 * `tracer.startActiveSpan` vira no-op nesse caso.
 *
 * Para setar atributos DEPOIS (ex.: tokens consumidos pelo LLM),
 * use `trace.getActiveSpan()` dentro de `fn` — `startActiveSpan`
 * registra o span aberto como ativo no contexto.
 *
 * Atributos obrigatórios: incluir `tenantId` para que a query no
 * collector possa filtrar por tenant sem precisar de baggage.
 */

import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

export const TRACER_NAME = 'astrum-agent';
export const TRACER_VERSION = '1.0.0';

export type SpanAttrs = Record<string, string | number | boolean>;

export function getTracer() {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

export async function withSpan<T>(
  name: string,
  attrs: SpanAttrs,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { attributes: attrs as Record<string, string | number> }, async (span) => {
    try {
      const result = await fn();
      setSpanOk(span);
      return result;
    } catch (err) {
      setSpanError(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
}

function setSpanOk(span: Span): void {
  try {
    span.setStatus({ code: SpanStatusCode.OK });
  } catch {
    /* no-op se span já foi finalizado */
  }
}

function setSpanError(span: Span, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
    if (err instanceof Error) {
      span.recordException(err);
    }
  } catch {
    /* no-op */
  }
}
