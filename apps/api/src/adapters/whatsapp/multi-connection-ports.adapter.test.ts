import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./whatsapp.adapter', () => ({
  sendMessage: vi.fn(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { sendMessage } from './whatsapp.adapter';
import { makeMultiConnPorts } from './multi-connection-ports.adapter';

type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'maybeSingle', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: Terminal) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

describe('makeMultiConnPorts', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('listConnections', () => {
    it('mapeia status do webhook (open/close/connecting) pro vocabulário do Dossiê #58', async () => {
      mockFrom({
        data: [
          { id: 'c1', tenant_id: 't1', instance_name: 'a', phone_number: '5511', status: 'open', is_primary: true },
          { id: 'c2', tenant_id: 't1', instance_name: 'b', phone_number: null, status: 'close', is_primary: false },
          { id: 'c3', tenant_id: 't1', instance_name: 'c', phone_number: null, status: 'connecting', is_primary: false },
          { id: 'c4', tenant_id: 't1', instance_name: 'd', phone_number: null, status: 'unknown', is_primary: false },
        ],
        error: null,
      });
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1');

      const conns = await ports.listConnections('t1');

      expect(conns.map((c) => c.status)).toEqual(['connected', 'disconnected', 'connecting', 'disconnected']);
    });

    it('preferredInstance sobrepõe isPrimary só na decisão de roteamento, não no banco', async () => {
      mockFrom({
        data: [
          { id: 'c1', tenant_id: 't1', instance_name: 'astrum-primaria', status: 'open', is_primary: true },
          { id: 'c2', tenant_id: 't1', instance_name: 'astrum-origem', status: 'open', is_primary: false },
        ],
        error: null,
      });
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1', 'astrum-origem');

      const conns = await ports.listConnections('t1');

      expect(conns.find((c) => c.instanceName === 'astrum-origem')?.isPrimary).toBe(true);
      expect(conns.find((c) => c.instanceName === 'astrum-primaria')?.isPrimary).toBe(false);
      // Só leu (select) — não escreve nada no banco, é remapeamento em memória.
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  describe('routeMessage', () => {
    it('resolve instance_name pelo id e envia via sendMessage', async () => {
      mockFrom({ data: { instance_name: 'astrum-suporte' }, error: null });
      (sendMessage as any).mockResolvedValue({ status: 'sent', messageId: 'm1', timestamp: 'now' });
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1');

      const result = await ports.routeMessage('c1', '5511999990000', 'oi');

      expect(result).toEqual({ messageId: 'm1' });
      expect(sendMessage).toHaveBeenCalledWith({
        to: '5511999990000',
        content: 'oi',
        tenantId: 't1',
        instanceName: 'astrum-suporte',
        evolutionUrl: 'https://evo.example',
        evolutionApiKey: 'key-1',
      });
    });

    it('conexão inexistente -> lança erro (não tenta enviar)', async () => {
      mockFrom({ data: null, error: null });
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1');

      await expect(ports.routeMessage('c-inexistente', '5511999990000', 'oi')).rejects.toThrow('não encontrada');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('circuit breaker em modo fallback -> lança erro (pra sendViaAvailableConnection fazer failover)', async () => {
      mockFrom({ data: { instance_name: 'astrum-suporte' }, error: null });
      (sendMessage as any).mockResolvedValue({ status: 'fallback', messageId: 'm1', timestamp: 'now' });
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1');

      await expect(ports.routeMessage('c1', '5511999990000', 'oi')).rejects.toThrow('indisponível');
    });
  });

  describe('updateStatus', () => {
    it('não escreve no banco (fonte da verdade é o webhook) — só loga', async () => {
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1');
      await expect(ports.updateStatus('c1', 'error', 'Timeout')).resolves.toBeUndefined();
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    it('filtra por tenant_id (fechado por construção) + id — nunca cross-tenant', async () => {
      mockFrom({ data: { id: 'c1', tenant_id: 't1', instance_name: 'a', status: 'open', is_primary: true }, error: null });
      const ports = makeMultiConnPorts('t1', 'https://evo.example', 'key-1');

      const conn = await ports.getConnection('outro-tenant-qualquer', 'c1');

      expect(conn?.id).toBe('c1');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 't1');
      expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
    });
  });
});
