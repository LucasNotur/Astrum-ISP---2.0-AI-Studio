import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./whatsapp.adapter', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../lib/tenant-keys', () => ({
  resolveTenantKeys: vi.fn().mockResolvedValue({ evolutionUrl: 'https://evo.example', evolutionApiKey: 'key-1' }),
}));

vi.mock('./multi-connection-ports.adapter', () => ({
  makeMultiConnPorts: vi.fn(),
}));

vi.mock('../../domain/atendimento/multi-connection.service', () => ({
  sendViaAvailableConnection: vi.fn(),
}));

import { sendMessage } from './whatsapp.adapter';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { makeMultiConnPorts } from './multi-connection-ports.adapter';
import { sendViaAvailableConnection } from '../../domain/atendimento/multi-connection.service';
import { sendWhatsAppResponse } from './message-sender.service';

function makePorts(connections: any[] = []) {
  const ports = {
    listConnections: vi.fn().mockResolvedValue(connections),
    getConnection: vi.fn(),
    updateStatus: vi.fn(),
    routeMessage: vi.fn(),
  };
  (makeMultiConnPorts as any).mockReturnValue(ports);
  return ports;
}

describe('sendWhatsAppResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveTenantKeys as any).mockResolvedValue({ evolutionUrl: 'https://evo.example', evolutionApiKey: 'key-1' });
  });

  it('resolve as chaves BYOK do tenant e constrói os ports com a instância de origem', async () => {
    makePorts([]);
    (sendMessage as any).mockResolvedValue({ status: 'sent', messageId: 'm1', timestamp: 'now' });

    await sendWhatsAppResponse({ to: '5511999990000', content: 'oi', tenantId: 't1', instanceName: 'astrum-suporte' });

    expect(resolveTenantKeys).toHaveBeenCalledWith('t1');
    expect(makeMultiConnPorts).toHaveBeenCalledWith('t1', 'https://evo.example', 'key-1', 'astrum-suporte');
  });

  it('tenant sem conexões registradas -> envia direto (fail-open), não usa roteamento multi-conexão', async () => {
    makePorts([]);
    (sendMessage as any).mockResolvedValue({ status: 'sent', messageId: 'm1', timestamp: 'now' });

    await sendWhatsAppResponse({ to: '5511999990000', content: 'oi', tenantId: 't1', instanceName: 'astrum-suporte' });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: '5511999990000', content: 'oi', tenantId: 't1', instanceName: 'astrum-suporte' }),
    );
    expect(sendViaAvailableConnection).not.toHaveBeenCalled();
  });

  it('tenant com conexões registradas -> roteia via sendViaAvailableConnection (Dossiê #58)', async () => {
    const ports = makePorts([{ id: 'c1', instanceName: 'astrum-suporte', status: 'connected' }]);
    (sendViaAvailableConnection as any).mockResolvedValue({ ok: true, messageId: 'm1', connectionId: 'c1' });

    await sendWhatsAppResponse({ to: '5511999990000', content: 'oi', tenantId: 't1', instanceName: 'astrum-suporte' });

    expect(sendViaAvailableConnection).toHaveBeenCalledWith('t1', '5511999990000', 'oi', ports);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('nenhuma conexão saudável (ok:false) -> não lança, apenas registra fallback', async () => {
    makePorts([{ id: 'c1', instanceName: 'astrum-suporte', status: 'disconnected' }]);
    (sendViaAvailableConnection as any).mockResolvedValue({ ok: false, error: 'Nenhuma conexão WhatsApp disponível' });

    await expect(
      sendWhatsAppResponse({ to: '5511999990000', content: 'oi', tenantId: 't1', instanceName: 'astrum-suporte' }),
    ).resolves.toBeUndefined();
  });

  it('mensagem multi-parte -> chama o roteamento uma vez por parte', async () => {
    const ports = makePorts([{ id: 'c1', instanceName: 'astrum-suporte', status: 'connected' }]);
    (sendViaAvailableConnection as any).mockResolvedValue({ ok: true, messageId: 'm1', connectionId: 'c1' });
    const longContent = 'a'.repeat(5000);

    await sendWhatsAppResponse({ to: '5511999990000', content: longContent, tenantId: 't1', instanceName: 'astrum-suporte' });

    expect((sendViaAvailableConnection as any).mock.calls.length).toBeGreaterThan(1);
    (sendViaAvailableConnection as any).mock.calls.forEach((call: any[]) => {
      expect(call[0]).toBe('t1');
      expect(call[1]).toBe('5511999990000');
      expect(call[3]).toBe(ports);
    });
  }, 10000);
});
