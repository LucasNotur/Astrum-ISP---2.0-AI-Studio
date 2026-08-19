import { describe, it, expect, vi, beforeEach } from 'vitest';
import { occupancyColor } from './ctoAvailability';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('occupancyColor', () => {
  it('verde quando ocupação baixa', () => {
    expect(occupancyColor(2, 16)).toBe('#8BD164');
  });

  it('amarelo quando ocupação média (>=60%)', () => {
    expect(occupancyColor(10, 16)).toBe('#EECF6D');
  });

  it('vermelho quando quase cheia (>=90%)', () => {
    expect(occupancyColor(15, 16)).toBe('#D64045');
  });

  it('cinza quando total é zero (evita divisão por zero)', () => {
    expect(occupancyColor(0, 0)).toBe('#6a6a70');
  });
});

describe('fetchNearbyCtos', () => {
  beforeEach(() => vi.resetModules());

  it('mapeia colunas do Supabase pro formato do mapa', async () => {
    const eq2 = vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({
          data: [{ id: '1', name: 'CTO-01', latitude: -23.5, longitude: -46.6, total_ports: 16, used_ports: 10, status: 'active' }],
          error: null,
        }),
      }),
    });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });

    vi.doMock('./supabase', () => ({ supabase: { from } }));
    const { fetchNearbyCtos } = await import('./ctoAvailability');

    const result = await fetchNearbyCtos('tenant-1');

    expect(from).toHaveBeenCalledWith('network_ctos');
    expect(result).toEqual([
      { id: '1', name: 'CTO-01', latitude: -23.5, longitude: -46.6, totalPorts: 16, usedPorts: 10, status: 'active' },
    ]);
  });

  it('retorna lista vazia em erro', async () => {
    const eq2 = vi.fn().mockReturnValue({
      not: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      }),
    });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });

    vi.doMock('./supabase', () => ({ supabase: { from } }));
    const { fetchNearbyCtos } = await import('./ctoAvailability');

    await expect(fetchNearbyCtos('tenant-1')).resolves.toEqual([]);
  });
});
