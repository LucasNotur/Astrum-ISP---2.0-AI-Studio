import { describe, it, expect } from 'vitest';
import {
  isMessageProcessed,
  markMessageProcessed,
  processedKey,
  PROCESSED_TTL_SECONDS,
  type IdempotencyStore,
} from './idempotency.service';

// Store fake espelhando o comportamento GET/SET+EX do client (ioredis/mock).
function makeStore(): IdempotencyStore & { raw: Map<string, { value: string; expiresAt: number | null }>; setCalls: any[][] } {
  const raw = new Map<string, { value: string; expiresAt: number | null }>();
  const setCalls: any[][] = [];
  return {
    raw,
    setCalls,
    async get(key: string) {
      const item = raw.get(key);
      return item ? item.value : null;
    },
    async set(key: string, value: string, ...args: any[]) {
      setCalls.push([key, value, ...args]);
      let expiresAt: number | null = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === 'EX') expiresAt = Number(args[i + 1]);
      }
      raw.set(key, { value, expiresAt });
      return 'OK';
    },
  };
}

describe('idempotency.service', () => {
  it('processedKey isola por tenant e por messageId', () => {
    expect(processedKey('t1', 'm1')).toBe('idem:atendimento:t1:m1');
    expect(processedKey('t1', 'm1')).not.toBe(processedKey('t2', 'm1'));
    expect(processedKey('t1', 'm1')).not.toBe(processedKey('t1', 'm2'));
  });

  it('mensagem nunca vista → não está processada', async () => {
    const store = makeStore();
    expect(await isMessageProcessed(store, 't1', 'm1')).toBe(false);
  });

  it('marcar → passa a estar processada', async () => {
    const store = makeStore();
    await markMessageProcessed(store, 't1', 'm1');
    expect(await isMessageProcessed(store, 't1', 'm1')).toBe(true);
  });

  it('marca com TTL de 24h (EX) para não vazar chaves pra sempre', async () => {
    const store = makeStore();
    await markMessageProcessed(store, 't1', 'm1');
    expect(store.setCalls[0]).toEqual([processedKey('t1', 'm1'), '1', 'EX', PROCESSED_TTL_SECONDS]);
    expect(PROCESSED_TTL_SECONDS).toBe(60 * 60 * 24);
  });

  it('marcar um messageId não afeta outro (nem outro tenant)', async () => {
    const store = makeStore();
    await markMessageProcessed(store, 't1', 'm1');
    expect(await isMessageProcessed(store, 't1', 'm2')).toBe(false);
    expect(await isMessageProcessed(store, 't2', 'm1')).toBe(false);
  });
});
