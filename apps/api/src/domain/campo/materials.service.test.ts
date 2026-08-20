import { describe, it, expect } from 'vitest';
import { aggregateMaterials } from './materials.service';

describe('aggregateMaterials', () => {
  it('lista vazia → []', () => {
    expect(aggregateMaterials([])).toEqual([]);
  });

  it('soma quantidades do mesmo item (nome + unidade)', () => {
    const out = aggregateMaterials([
      { name: 'ONU', quantity: 1, unit: 'un' },
      { name: 'ONU', quantity: 1, unit: 'un' },
      { name: 'Cabo drop', quantity: 100, unit: 'm' },
      { name: 'Cabo drop', quantity: 50, unit: 'm' },
    ]);
    expect(out).toEqual([
      { name: 'Cabo drop', quantity: 150, unit: 'm' },
      { name: 'ONU', quantity: 2, unit: 'un' },
    ]);
  });

  it('não mistura mesmo nome com unidades diferentes', () => {
    const out = aggregateMaterials([
      { name: 'Cabo', quantity: 2, unit: 'un' },
      { name: 'Cabo', quantity: 100, unit: 'm' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('trata quantidade string/null e ignora linha sem nome', () => {
    const out = aggregateMaterials([
      { name: 'Conector', quantity: '2', unit: 'un' },
      { name: 'Conector', quantity: null, unit: 'un' },
      { name: '', quantity: 5, unit: 'un' } as any,
    ]);
    expect(out).toEqual([{ name: 'Conector', quantity: 2, unit: 'un' }]);
  });

  it('ordena por nome', () => {
    const out = aggregateMaterials([
      { name: 'Roteador', quantity: 1, unit: 'un' },
      { name: 'Conector', quantity: 1, unit: 'un' },
      { name: 'ONU', quantity: 1, unit: 'un' },
    ]);
    expect(out.map((m) => m.name)).toEqual(['Conector', 'ONU', 'Roteador']);
  });
});
