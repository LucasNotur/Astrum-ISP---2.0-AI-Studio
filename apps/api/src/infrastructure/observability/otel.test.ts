import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted garante que as refs existam antes das factories vi.mock.
// IMPORTANTE: vi.fn() chamado com `new` precisa de implementation `function`
// ou `class` (arrow function não é constructable e retorna undefined).
const mocks = vi.hoisted(() => ({
  NodeSDKMock: vi.fn(),
  OTLPTraceExporterMock: vi.fn(),
}));

vi.mock('../logging/logger', () => ({
  infraLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: mocks.NodeSDKMock,
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: mocks.OTLPTraceExporterMock,
}));

import {
  initOtel,
  isOtelEnabled,
  getOtelState,
  _resetOtelState,
  shutdownOtel,
} from './otel';

function makeSdkMock(overrides: { start?: any; shutdown?: any } = {}) {
  return {
    start: overrides.start ?? vi.fn(),
    shutdown: overrides.shutdown ?? vi.fn().mockResolvedValue(undefined),
  };
}

function makeExporterMock(overrides: { export?: any; shutdown?: any } = {}) {
  return {
    export: overrides.export ?? vi.fn(),
    shutdown: overrides.shutdown ?? vi.fn().mockResolvedValue(undefined),
  };
}

describe('otel — boot condicional', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetOtelState();
    mocks.NodeSDKMock.mockReset();
    mocks.OTLPTraceExporterMock.mockReset();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('flag off → SDK NÃO é instanciado e enabled=false', async () => {
    const mod = await import('./otel');
    await mod.initOtel();

    expect(mocks.NodeSDKMock).not.toHaveBeenCalled();
    expect(mocks.OTLPTraceExporterMock).not.toHaveBeenCalled();
    expect(mod.isOtelEnabled()).toBe(false);
    expect(mod.getOtelState().endpoint).toBeNull();
  });

  it('flag on + endpoint default → SDK carregado, estado preenchido', async () => {
    process.env.OTEL_ENABLED = 'true';
    const startMock = vi.fn();
    const exporterMock = makeExporterMock();
    // `function` (não arrow) para que `new mocks.NodeSDKMock(...)` funcione.
    mocks.NodeSDKMock.mockImplementation(function () {
      return makeSdkMock({ start: startMock });
    });
    mocks.OTLPTraceExporterMock.mockImplementation(function () {
      return exporterMock;
    });

    const mod = await import('./otel');
    await mod.initOtel();

    expect(mocks.NodeSDKMock).toHaveBeenCalledTimes(1);
    expect(mocks.OTLPTraceExporterMock).toHaveBeenCalledWith({ url: 'http://localhost:4318/v1/traces' });
    expect(mod.isOtelEnabled()).toBe(true);
    expect(mod.getOtelState().endpoint).toBe('http://localhost:4318/v1/traces');
    expect(mod.getOtelState().endpointMasked).toBe('http://localhost:****/v1/traces');
    expect(mod.getOtelState().serviceName).toBe('astrum-api');
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('flag on + endpoint custom → mascarado preservando host+path', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.com:54321/custom/path';
    process.env.OTEL_SERVICE_NAME = 'astrum-test';

    mocks.NodeSDKMock.mockImplementation(function () { return makeSdkMock(); });
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return makeExporterMock(); });

    const mod = await import('./otel');
    await mod.initOtel();
    const s = mod.getOtelState();
    expect(s.endpoint).toBe('https://otel.example.com:54321/custom/path');
    expect(s.endpointMasked).toBe('https://otel.example.com:****/custom/path');
    expect(s.serviceName).toBe('astrum-test');
  });

  it('flag on → SDK lançar erro → enabled=false + lastError preenchido (fail-open)', async () => {
    process.env.OTEL_ENABLED = 'true';
    // OTLPTraceExporter é construído ANTES de NodeSDK no initOtel — precisa de mock
    // válido para que a linha do erro (NodeSDK) seja atingida.
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return makeExporterMock(); });
    mocks.NodeSDKMock.mockImplementation(function () {
      throw new Error('sdk-boom');
    });

    const mod = await import('./otel');
    await mod.initOtel();
    expect(mod.isOtelEnabled()).toBe(false);
    expect(mod.getOtelState().lastError).toBe('sdk-boom');
  });

  it('idempotência: 2ª initOtel() não recarrega o SDK', async () => {
    process.env.OTEL_ENABLED = 'true';
    const startMock = vi.fn();
    mocks.NodeSDKMock.mockImplementation(function () { return makeSdkMock({ start: startMock }); });
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return makeExporterMock(); });

    const mod = await import('./otel');
    await mod.initOtel();
    await mod.initOtel();
    expect(mocks.NodeSDKMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('erro do exporter → counter de spans incrementa + exporterHealthy=false (1x/min throttle)', async () => {
    process.env.OTEL_ENABLED = 'true';

    const exporterInst = {
      export: vi.fn((spans: any[], cb: any) => {
        cb({ code: 1, error: { message: 'network down' } });
      }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mocks.NodeSDKMock.mockImplementation(function () { return makeSdkMock(); });
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return exporterInst; });

    const mod = await import('./otel');
    await mod.initOtel();

    // initOtel substituiu exporter.export pelo wrapper. Capturamos a referência
    // wrapped DIRETO do mock (que é o mesmo objeto retornado pelo constructor).
    const wrapped = exporterInst.export as any;
    let lastCallback: any = null;
    wrapped([{ name: 's1' }], (r: any) => { lastCallback = r; });
    wrapped([{ name: 's2' }], (r: any) => { lastCallback = r; });
    wrapped([{ name: 's3' }], (r: any) => { lastCallback = r; });

    expect(mod.getOtelState().spansInSession).toBe(3);
    expect(mod.getOtelState().lastError).toBe('network down');
    expect(mod.getOtelState().exporterHealthy).toBe(false);
    expect(lastCallback).toEqual({ code: 0 });
  });

  it('shutdown limpa estado e zera sdk interno', async () => {
    process.env.OTEL_ENABLED = 'true';
    const shutdownMock = vi.fn().mockResolvedValue(undefined);
    mocks.NodeSDKMock.mockImplementation(function () {
      return makeSdkMock({ shutdown: shutdownMock });
    });
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return makeExporterMock(); });

    const mod = await import('./otel');
    await mod.initOtel();
    expect(mod.isOtelEnabled()).toBe(true);

    await mod.shutdownOtel();
    expect(shutdownMock).toHaveBeenCalled();
    expect(mod.isOtelEnabled()).toBe(false);
  });

  it('endpoint inválido é marcado como tal no mask', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'not-a-url';
    mocks.NodeSDKMock.mockImplementation(function () { return makeSdkMock(); });
    mocks.OTLPTraceExporterMock.mockImplementation(function () { return makeExporterMock(); });

    const mod = await import('./otel');
    await mod.initOtel();
    expect(mod.getOtelState().endpointMasked).toBe('invalid-endpoint');
  });
});
