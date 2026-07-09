import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { otelRoutes } from './otel.routes';
import { _resetOtelState, isOtelEnabled, getOtelState } from '../../infrastructure/observability/otel';

// vi.hoisted garante que as refs existam quando as factories forem chamadas.
const mocks = vi.hoisted(() => ({
  NodeSDKMock: vi.fn(),
  OTLPTraceExporterMock: vi.fn(),
}));

vi.mock('../../infrastructure/observability/otel', async () => {
  const actual = await vi.importActual<any>('../../infrastructure/observability/otel');
  return {
    ...actual,
  };
});

vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: mocks.NodeSDKMock,
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: mocks.OTLPTraceExporterMock,
}));

function makeSdkMock() {
  return { start: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
}

function makeExporterMock() {
  return { export: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
}

describe('GET /api/v2/ia/otel/status', () => {
  let app: any;

  beforeEach(async () => {
    _resetOtelState();
    mocks.NodeSDKMock.mockReset();
    mocks.OTLPTraceExporterMock.mockReset();
    mocks.NodeSDKMock.mockImplementation(function () { return makeSdkMock(); });
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return makeExporterMock(); });
    app = Fastify({ logger: false });
    await app.register(otelRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('flag off → enabled=false, endpoint_mascarado=null, spans_sessao=0, ultimo_erro=null', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/otel/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      enabled: false,
      endpoint_mascarado: null,
      spans_sessao: 0,
      ultimo_erro: null,
    });
  });

  it('estado preenchido pelo initOtel → reflete no payload', async () => {
    process.env.OTEL_ENABLED = 'true';
    const mod = await import('../../infrastructure/observability/otel');
    await mod.initOtel();

    const s = getOtelState();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/otel/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(s.enabled);
    expect(body.endpoint_mascarado).toBe(s.endpointMasked);
    expect(body.spans_sessao).toBe(s.spansInSession);
    expect(body.ultimo_erro).toBe(s.lastError);
    expect(isOtelEnabled()).toBe(true);

    delete process.env.OTEL_ENABLED;
  });

  it('payload NUNCA expõe o endpoint bruto (apenas mascarado)', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://collector-interno.acme.com:4318/secret/path';
    const mod = await import('../../infrastructure/observability/otel');
    await mod.initOtel();

    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/otel/status' });
    const body = res.json();
    expect(body.endpoint_mascarado).not.toContain('4318');
    expect(body.endpoint_mascarado).toContain('****');

    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });
});
