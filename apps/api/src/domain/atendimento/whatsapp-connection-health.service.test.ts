import { describe, it, expect, vi } from 'vitest';
import { checkWhatsAppConnectionHealth, mapEvolutionState } from './whatsapp-connection-health.service';

describe('mapEvolutionState', () => {
  it('mapeia estados conhecidos e cai para unknown no resto', () => {
    expect(mapEvolutionState('open')).toBe('open');
    expect(mapEvolutionState('close')).toBe('close');
    expect(mapEvolutionState('connecting')).toBe('connecting');
    expect(mapEvolutionState('OPEN')).toBe('open');
    expect(mapEvolutionState(undefined)).toBe('unknown');
    expect(mapEvolutionState('lixo')).toBe('unknown');
  });
});

describe('checkWhatsAppConnectionHealth', () => {
  const NOW = new Date('2026-08-17T12:00:00.000Z');

  it('sem instância configurada -> not_configured (não finge "open")', async () => {
    const result = await checkWhatsAppConnectionHealth('t-1', {
      resolveInstance: vi.fn().mockResolvedValue(null),
      resolveKeys: vi.fn(),
      pingConnectionState: vi.fn(),
      now: NOW,
    });
    expect(result).toEqual({ status: 'not_configured', instance: null, checked_at: NOW.toISOString() });
  });

  it('instância configurada + Evolution responde open -> open', async () => {
    const result = await checkWhatsAppConnectionHealth('t-1', {
      resolveInstance: vi.fn().mockResolvedValue('inst-1'),
      resolveKeys: vi.fn().mockResolvedValue({ evolutionUrl: 'https://evo.example.com', evolutionApiKey: 'key' }),
      pingConnectionState: vi.fn().mockResolvedValue({ instance: { instanceName: 'inst-1', state: 'open' } }),
      now: NOW,
    });
    expect(result).toEqual({ status: 'open', instance: 'inst-1', checked_at: NOW.toISOString() });
  });

  it('instância configurada + Evolution fora do ar -> unknown, NUNCA open (evita falso positivo)', async () => {
    const result = await checkWhatsAppConnectionHealth('t-1', {
      resolveInstance: vi.fn().mockResolvedValue('inst-1'),
      resolveKeys: vi.fn().mockResolvedValue({ evolutionUrl: 'https://evo.example.com', evolutionApiKey: 'key' }),
      pingConnectionState: vi.fn().mockRejectedValue(new Error('timeout')),
      now: NOW,
    });
    expect(result.status).toBe('unknown');
    expect(result.instance).toBe('inst-1');
    expect(result.error).toBe('timeout');
  });

  it('instância configurada + Evolution responde close -> close', async () => {
    const result = await checkWhatsAppConnectionHealth('t-1', {
      resolveInstance: vi.fn().mockResolvedValue('inst-1'),
      resolveKeys: vi.fn().mockResolvedValue({ evolutionUrl: 'https://evo.example.com', evolutionApiKey: 'key' }),
      pingConnectionState: vi.fn().mockResolvedValue({ instance: { state: 'close' } }),
      now: NOW,
    });
    expect(result.status).toBe('close');
  });
});
