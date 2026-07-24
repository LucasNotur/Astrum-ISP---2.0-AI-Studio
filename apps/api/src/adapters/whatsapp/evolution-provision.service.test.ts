import { describe, it, expect, vi } from 'vitest';
import { provisionEvolutionInstance, type EvolutionProvisionPorts } from './evolution-provision.service';

function makePorts(overrides: Partial<EvolutionProvisionPorts> = {}): EvolutionProvisionPorts {
  return {
    createInstance: vi.fn().mockResolvedValue({ instanceId: 'inst-123', qrCode: 'base64qr...' }),
    setWebhook: vi.fn().mockResolvedValue(undefined),
    getQrCode: vi.fn().mockResolvedValue('base64qr...'),
    saveTenantInstance: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('provisionEvolutionInstance', () => {
  it('cria instância, configura webhook e salva no tenant', async () => {
    const ports = makePorts();
    const result = await provisionEvolutionInstance('t1', 'isp-alpha', ports);

    expect(result.instanceName).toBe('astrum-isp-alpha');
    expect(result.instanceId).toBe('inst-123');
    expect(result.qrCode).toBe('base64qr...');
    expect(result.webhookConfigured).toBe(true);
    expect(ports.createInstance).toHaveBeenCalledWith('astrum-isp-alpha', expect.stringContaining('/api/v2/webhook/evolution'));
    expect(ports.saveTenantInstance).toHaveBeenCalledWith('t1', 'astrum-isp-alpha', 'inst-123');
  });

  it('continua mesmo se webhook falhar (configuração manual posterior)', async () => {
    const ports = makePorts({
      setWebhook: vi.fn().mockRejectedValue(new Error('webhook config failed')),
    });
    const result = await provisionEvolutionInstance('t1', 'isp-beta', ports);

    expect(result.webhookConfigured).toBe(false);
    expect(result.instanceId).toBe('inst-123');
    expect(ports.saveTenantInstance).toHaveBeenCalled();
  });

  it('propaga erro se createInstance falhar', async () => {
    const ports = makePorts({
      createInstance: vi.fn().mockRejectedValue(new Error('Evolution down')),
    });

    await expect(provisionEvolutionInstance('t1', 'isp-gamma', ports)).rejects.toThrow('Evolution down');
    expect(ports.saveTenantInstance).not.toHaveBeenCalled();
  });

  it('nome da instância segue padrão astrum-{slug}', async () => {
    const ports = makePorts();
    const result = await provisionEvolutionInstance('t5', 'meu-provedor-net', ports);
    expect(result.instanceName).toBe('astrum-meu-provedor-net');
  });
});
