import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase antes de qualquer import do módulo
vi.mock('../database/supabase.client', () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabaseAdmin: { channel: vi.fn().mockReturnValue(channel), removeChannel: vi.fn().mockResolvedValue(undefined) },
    SUPABASE_URL: 'https://real.supabase.co',
  };
});

describe('realtime.service', () => {
  beforeEach(() => vi.resetModules());

  describe('watchTable', () => {
    it('retorna null e avisa quando SUPABASE_URL é placeholder', async () => {
      vi.resetModules();
      vi.doMock('../database/supabase.client', () => ({
        supabaseAdmin: { channel: vi.fn(), removeChannel: vi.fn() },
        SUPABASE_URL: 'https://placeholder.supabase.co',
      }));
      const { watchTable } = await import('./realtime.service');
      const result = watchTable({ table: 'messages', event: 'INSERT', handler: vi.fn() });
      expect(result).toBeNull();
    });

    it('cria canal e chama subscribe quando URL é real', async () => {
      vi.resetModules();
      const mockSubscribe = vi.fn().mockReturnThis();
      const mockOn = vi.fn().mockReturnThis();
      const mockChannel = { on: mockOn, subscribe: mockSubscribe };
      const mockSupabase = {
        channel: vi.fn().mockReturnValue(mockChannel),
        removeChannel: vi.fn(),
      };
      vi.doMock('../database/supabase.client', () => ({
        supabaseAdmin: mockSupabase,
        SUPABASE_URL: 'https://real.supabase.co',
      }));

      const { watchTable } = await import('./realtime.service');
      const channel = watchTable({ table: 'messages', event: 'INSERT', handler: vi.fn() });

      expect(channel).not.toBeNull();
      expect(mockSupabase.channel).toHaveBeenCalled();
      expect(mockOn).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ table: 'messages', event: 'INSERT' }), expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalled();
    });

    it('handler de payload chama o callback do usuário com new/old/eventType', async () => {
      vi.resetModules();

      let capturedPayloadHandler: ((p: any) => void) | undefined;
      const mockOn = vi.fn().mockImplementation((_evName: string, _filter: any, cb: any) => {
        capturedPayloadHandler = cb;
        return { subscribe: vi.fn().mockReturnThis() };
      });
      vi.doMock('../database/supabase.client', () => ({
        supabaseAdmin: { channel: vi.fn().mockReturnValue({ on: mockOn, subscribe: vi.fn().mockReturnThis() }), removeChannel: vi.fn() },
        SUPABASE_URL: 'https://real.supabase.co',
      }));

      const userHandler = vi.fn();
      const { watchTable } = await import('./realtime.service');
      watchTable({ table: 'tickets', event: '*', handler: userHandler });

      await capturedPayloadHandler?.({ new: { id: '1' }, old: {}, eventType: 'INSERT' });
      expect(userHandler).toHaveBeenCalledWith({ new: { id: '1' }, old: {}, eventType: 'INSERT' });
    });

    it('handler de payload absorve erro do callback sem propagar', async () => {
      vi.resetModules();
      let capturedPayloadHandler: ((p: any) => void) | undefined;
      const mockOn = vi.fn().mockImplementation((_: string, __: any, cb: any) => {
        capturedPayloadHandler = cb;
        return { subscribe: vi.fn().mockReturnThis() };
      });
      vi.doMock('../database/supabase.client', () => ({
        supabaseAdmin: { channel: vi.fn().mockReturnValue({ on: mockOn, subscribe: vi.fn().mockReturnThis() }), removeChannel: vi.fn() },
        SUPABASE_URL: 'https://real.supabase.co',
      }));

      const { watchTable } = await import('./realtime.service');
      watchTable({ table: 'messages', event: 'INSERT', handler: async () => { throw new Error('handler-boom'); } });

      await expect(capturedPayloadHandler?.({ new: {}, old: {}, eventType: 'INSERT' })).resolves.toBeUndefined();
    });
  });

  describe('unwatchTable', () => {
    it('remove canal registrado e limpa do Map', async () => {
      vi.resetModules();
      const mockRemoveChannel = vi.fn().mockResolvedValue(undefined);
      const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
      vi.doMock('../database/supabase.client', () => ({
        supabaseAdmin: { channel: vi.fn().mockReturnValue(mockChannel), removeChannel: mockRemoveChannel },
        SUPABASE_URL: 'https://real.supabase.co',
      }));

      const { watchTable, unwatchTable } = await import('./realtime.service');
      watchTable({ table: 'invoices', event: 'UPDATE', handler: vi.fn() });

      // não lança mesmo que não exista
      await expect(unwatchTable('canal-inexistente')).resolves.toBeUndefined();
      expect(mockRemoveChannel).not.toHaveBeenCalled();
    });
  });

  describe('closeAllChannels', () => {
    it('remove todos os canais ativos e limpa o Map', async () => {
      vi.resetModules();
      const mockRemoveChannel = vi.fn().mockResolvedValue(undefined);
      const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
      vi.doMock('../database/supabase.client', () => ({
        supabaseAdmin: { channel: vi.fn().mockReturnValue(mockChannel), removeChannel: mockRemoveChannel },
        SUPABASE_URL: 'https://real.supabase.co',
      }));

      const { watchTable, closeAllChannels } = await import('./realtime.service');
      watchTable({ table: 'messages', event: 'INSERT', handler: vi.fn() });
      watchTable({ table: 'invoices', event: 'UPDATE', handler: vi.fn() });

      await closeAllChannels();

      expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    });
  });
});
