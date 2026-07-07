import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn().mockReturnValue('sentry-event-id-123'),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  startNewTrace: vi.fn(),
}));

vi.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: vi.fn().mockReturnValue({}),
}));

describe('Sentry Service', () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/1234';
    vi.resetModules();
    // O factory do vi.mock é cacheado entre testes — limpar o histórico das
    // fns para asserções de "não foi chamado" não verem chamadas do teste anterior.
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it('initSentry não lança erro quando DSN está configurado', async () => {
    const { initSentry } = await import('./sentry.service');
    expect(() => initSentry()).not.toThrow();
  });

  it('captureError retorna eventId', async () => {
    const { captureError } = await import('./sentry.service');
    const id = captureError(new Error('Erro de teste'));
    expect(id).toBe('sentry-event-id-123');
  });

  it('initSentry é no-op sem SENTRY_DSN', async () => {
    delete process.env.SENTRY_DSN;
    vi.resetModules();
    const { initSentry } = await import('./sentry.service');
    expect(() => initSentry()).not.toThrow();

    const { Sentry } = await import('./sentry.service');
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('setSentryUser define user e tag de tenant', async () => {
    const { setSentryUser, Sentry } = await import('./sentry.service');
    setSentryUser('user-1', 'tenant-1', 'admin');
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-1', role: 'admin' });
    expect(Sentry.setTag).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });
});
