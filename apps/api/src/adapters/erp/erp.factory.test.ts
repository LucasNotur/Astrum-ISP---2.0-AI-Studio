import { describe, it, expect } from 'vitest';
import { createErpProvider, isErpImplemented } from './erp.factory';

const creds = { url: 'https://erp.test', token: 'tok' };

describe('erp.factory', () => {
  it.each(['ixc', 'mkauth', 'voalle', 'sgp', 'hubsoft', 'radiusnet', 'rbx'] as const)(
    'isErpImplemented(%s) === true',
    (provider) => {
      expect(isErpImplemented(provider)).toBe(true);
    },
  );

  it('createErpProvider retorna adapter com .name correto para todos os 7', () => {
    const providers = ['ixc', 'mkauth', 'voalle', 'sgp', 'hubsoft', 'radiusnet', 'rbx'] as const;
    for (const p of providers) {
      const adapter = createErpProvider(p, creds);
      expect(adapter.name).toBe(p);
    }
  });
});
