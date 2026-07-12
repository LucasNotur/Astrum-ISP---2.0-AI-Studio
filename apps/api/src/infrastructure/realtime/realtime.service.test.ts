import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado mutável compartilhado com a factory do mock (padrão vi.hoisted).
// Evita o vi.doMock + import dinâmico por teste, que era flaky sob carga
// (o doMock ocasionalmente não substituía a factory hoisted — checkup 2026-07-12).
const mockState = vi.hoisted(() => ({
  url: 'https://real.supabase.co',
  channel: {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  } as { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> },
  channelFn: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    channel: (...args: unknown[]) => mockState.channelFn(...args),
    removeChannel: (...args: unknown[]) => mockState.removeChannel(...args),
  },
  get SUPABASE_URL() {
    return mockState.url;
  },
}));

async function freshService() {
  vi.resetModules();
  return import('./realtime.service');
}

describe('realtime.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.url = 'https://real.supabase.co';
    mockState.channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
    mockState.channelFn.mockReturnValue(mockState.channel);
    mockState.removeChannel.mockResolvedValue(undefined);
  });

  describe('watchTable', () => {
    it('retorna null e avisa quando SUPABASE_URL é placeholder', async () => {
      mockState.url = 'https://placeholder.supabase.co';
      const { watchTable } = await freshService();
      const result = watchTable({ table: 'messages', event: 'INSERT', handler: vi.fn() });
      expect(result).toBeNull();
      expect(mockState.channelFn).not.toHaveBeenCalled();
    });

    it('cria canal e chama subscribe quando URL é real', async () => {
      const { watchTable } = await freshService();
      const channel = watchTable({ table: 'messages', event: 'INSERT', handler: vi.fn() });

      expect(channel).not.toBeNull();
      expect(mockState.channelFn).toHaveBeenCalled();
      expect(mockState.channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({ table: 'messages', event: 'INSERT' }),
        expect.any(Function),
      );
      expect(mockState.channel.subscribe).toHaveBeenCalled();
    });

    it('handler de payload chama o callback do usuário com new/old/eventType', async () => {
      let capturedPayloadHandler: ((p: any) => void) | undefined;
      mockState.channel.on = vi.fn().mockImplementation((_evName: string, _filter: any, cb: any) => {
        capturedPayloadHandler = cb;
        return mockState.channel;
      });

      const userHandler = vi.fn();
      const { watchTable } = await freshService();
      watchTable({ table: 'tickets', event: '*', handler: userHandler });

      await capturedPayloadHandler?.({ new: { id: '1' }, old: {}, eventType: 'INSERT' });
      expect(userHandler).toHaveBeenCalledWith({ new: { id: '1' }, old: {}, eventType: 'INSERT' });
    });

    it('handler de payload absorve erro do callback sem propagar', async () => {
      let capturedPayloadHandler: ((p: any) => void) | undefined;
      mockState.channel.on = vi.fn().mockImplementation((_: string, __: any, cb: any) => {
        capturedPayloadHandler = cb;
        return mockState.channel;
      });

      const { watchTable } = await freshService();
      watchTable({ table: 'messages', event: 'INSERT', handler: async () => { throw new Error('handler-boom'); } });

      await expect(capturedPayloadHandler?.({ new: {}, old: {}, eventType: 'INSERT' })).resolves.toBeUndefined();
    });
  });

  describe('unwatchTable', () => {
    it('não lança para canal inexistente e não chama removeChannel', async () => {
      const { watchTable, unwatchTable } = await freshService();
      watchTable({ table: 'invoices', event: 'UPDATE', handler: vi.fn() });

      await expect(unwatchTable('canal-inexistente')).resolves.toBeUndefined();
      expect(mockState.removeChannel).not.toHaveBeenCalled();
    });
  });

  describe('closeAllChannels', () => {
    it('remove todos os canais ativos e limpa o Map', async () => {
      const { watchTable, closeAllChannels } = await freshService();
      watchTable({ table: 'messages', event: 'INSERT', handler: vi.fn() });
      watchTable({ table: 'invoices', event: 'UPDATE', handler: vi.fn() });

      await closeAllChannels();

      expect(mockState.removeChannel).toHaveBeenCalledTimes(2);
    });
  });
});
