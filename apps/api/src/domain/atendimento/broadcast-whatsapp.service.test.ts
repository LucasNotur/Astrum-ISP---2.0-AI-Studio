import { describe, it, expect, vi } from 'vitest';
import { executeBroadcast, BroadcastMessage, WhatsAppBroadcastPorts } from './broadcast-whatsapp.service';

const MSG: BroadcastMessage = {
  id: 'b1', tenantId: 't1', templateName: 'promo_jul', templateParams: { nome: '{{1}}' },
  recipients: ['5511999990001', '5511999990002', '5511999990003'],
  channel: 'whatsapp', status: 'queued', throttlePerSecond: 10,
};

function makePorts(optedOut: string[] = []): WhatsAppBroadcastPorts {
  return {
    isOptedOut: vi.fn().mockImplementation(async (_, phone) => optedOut.includes(phone)),
    sendTemplate: vi.fn().mockResolvedValue(undefined),
    recordDelivery: vi.fn().mockResolvedValue(undefined),
  };
}

describe('broadcast-whatsapp.service', () => {
  it('envia para todos os destinatários', async () => {
    const ports = makePorts();
    const result = await executeBroadcast(MSG, ports);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.optedOut).toBe(0);
    expect(ports.sendTemplate).toHaveBeenCalledTimes(3);
  });

  it('respeita opt-out', async () => {
    const ports = makePorts(['5511999990002']);
    const result = await executeBroadcast(MSG, ports);
    expect(result.sent).toBe(2);
    expect(result.optedOut).toBe(1);
    expect(result.deliveryStatuses.find((d) => d.phone === '5511999990002')?.status).toBe('opted_out');
  });

  it('captura falha sem parar broadcast', async () => {
    const ports = makePorts();
    (ports.sendTemplate as any).mockRejectedValueOnce(new Error('timeout'));
    const result = await executeBroadcast(MSG, ports);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('registra cada delivery', async () => {
    const ports = makePorts();
    await executeBroadcast(MSG, ports);
    expect(ports.recordDelivery).toHaveBeenCalledTimes(3);
  });
});
