import { describe, it, expect, vi } from 'vitest';
import { withSpan, getTracer } from './otel-span.helper';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

function setupInMemoryTracer() {
  // Reset para garantir estado limpo entre testes
  trace.disable();
  // OTel precisa de um ContextManager real para que startActiveSpan
  // registre o span no async context (NoopContextManager = active span sempre undefined).
  // AsyncLocalStorageContextManager é o default do NodeSDK.
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager);

  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  // Registra como global para que trace.getTracer() retorne esse provider
  trace.setGlobalTracerProvider(provider);
  return { exporter, provider };
}

describe('otel-span.helper — withSpan', () => {
  it('cria span com nome + attrs + status OK em execução bem-sucedida', async () => {
    const { exporter } = setupInMemoryTracer();
    const out = await withSpan('test.op', { tenantId: 't1', count: 3 }, async () => {
      return 'ok';
    });
    expect(out).toBe('ok');
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe('test.op');
    expect(spans[0]!.attributes.tenantId).toBe('t1');
    expect(spans[0]!.attributes.count).toBe(3);
    expect(spans[0]!.status.code).toBe(SpanStatusCode.OK);
  });

  it('span com status ERROR + exception registrada quando fn lança', async () => {
    const { exporter } = setupInMemoryTracer();
    const err = new Error('boom-no-no');
    await expect(
      withSpan('test.fail', { tenantId: 't1' }, async () => {
        throw err;
      }),
    ).rejects.toThrow('boom-no-no');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0]!.status.message).toBe('boom-no-no');
    // exception registrada
    expect(spans[0]!.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('propaga erro após fechar o span (finally sempre roda)', async () => {
    const { exporter } = setupInMemoryTracer();
    let finalized = false;
    try {
      await withSpan('test.finally', { tenantId: 't1' }, async () => {
        throw new Error('always-finalize');
      });
    } catch {
      finalized = exporter.getFinishedSpans().length > 0;
    }
    expect(finalized).toBe(true);
  });

  it('setActiveSpan: trace.getActiveSpan() dentro de fn retorna o span aberto', async () => {
    const { exporter } = setupInMemoryTracer();
    await withSpan('test.active', { tenantId: 't1' }, async () => {
      const active = trace.getActiveSpan();
      expect(active).toBeDefined();
      active?.setAttribute('inside', 42);
      return 1;
    });
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes.inside).toBe(42);
  });

  it('atributo tenantId presente e igual ao informado', async () => {
    const { exporter } = setupInMemoryTracer();
    await withSpan('agent.classify', { tenantId: 'tenant-XYZ' }, async () => 'ok');
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes.tenantId).toBe('tenant-XYZ');
  });

  it('vários spans sequenciais na mesma chain (pai/filho via context)', async () => {
    const { exporter } = setupInMemoryTracer();
    await withSpan('parent', { tenantId: 't1' }, async () => {
      await withSpan('child.a', { tenantId: 't1' }, async () => 'a');
      await withSpan('child.b', { tenantId: 't1' }, async () => 'b');
    });
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);
    const parent = spans.find((s) => s.name === 'parent')!;
    const childA = spans.find((s) => s.name === 'child.a')!;
    const childB = spans.find((s) => s.name === 'child.b')!;
    // Hierarquia: filhos devem ter parentSpanContext apontando para parent
    expect(childA.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    expect(childB.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
  });

  it('getTracer retorna tracer do provider global', () => {
    setupInMemoryTracer();
    const t = getTracer();
    expect(t).toBeDefined();
    // O tracer name é o registrado
    // @ts-expect-check — instrumentationLibrary é interno mas estável
    expect(t.instrumentationLibrary?.name ?? t.instrumentationScope?.name).toBe('astrum-agent');
  });
});
