import { describe, it, expect, vi } from 'vitest';
import { getCachedOrFetch, type ErpCachePorts } from './erp-cache.service';

function makePorts(cached: string | null = null): ErpCachePorts & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockImplementation(async (k, v) => { store.set(k, v); }),
  };
}

describe('erp-cache', () => {
  it('retorna do cache se existir', async () => {
    const ports = makePorts(JSON.stringify({ boleto: 'url' }));
    const fetchFn = vi.fn();
    const result = await getCachedOrFetch('t1', 'financial', 'c1', fetchFn, ports);
    expect(result).toEqual({ boleto: 'url' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('chama fetchFn e grava no cache quando miss', async () => {
    const ports = makePorts(null);
    const fetchFn = vi.fn().mockResolvedValue({ status: 'online' });
    const result = await getCachedOrFetch('t1', 'connection', 'login1', fetchFn, ports);
    expect(result).toEqual({ status: 'online' });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(ports.set).toHaveBeenCalledWith(
      'erp:t1:connection:login1',
      JSON.stringify({ status: 'online' }),
      'EX',
      60,
    );
  });

  it('usa TTL de 300s para tipo customer', async () => {
    const ports = makePorts(null);
    const fetchFn = vi.fn().mockResolvedValue({ nome: 'João' });
    await getCachedOrFetch('t1', 'customer', 'cpf1', fetchFn, ports);
    expect(ports.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      300,
    );
  });

  it('continua sem cache quando Redis falha no get', async () => {
    const ports = makePorts(null);
    (ports.get as any).mockRejectedValue(new Error('Redis down'));
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const result = await getCachedOrFetch('t1', 'financial', 'c1', fetchFn, ports);
    expect(result).toEqual({ ok: true });
  });

  it('continua sem gravar quando Redis falha no set', async () => {
    const ports = makePorts(null);
    (ports.set as any).mockRejectedValue(new Error('Redis down'));
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const result = await getCachedOrFetch('t1', 'financial', 'c1', fetchFn, ports);
    expect(result).toEqual({ ok: true });
  });
});
