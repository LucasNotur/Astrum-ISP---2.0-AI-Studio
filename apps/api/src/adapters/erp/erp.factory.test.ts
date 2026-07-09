import { describe, it, expect } from 'vitest';
import { createErpProvider, isErpImplemented } from './erp.factory';

const creds = { url: 'https://erp.test', token: 'tok' };

describe('erp.factory', () => {
  it.each(['ixc', 'mkauth', 'voalle', 'sgp', 'hubsoft'] as const)(
    'isErpImplemented(%s) === true',
    (provider) => {
      expect(isErpImplemented(provider)).toBe(true);
    },
  );

  it.each(['radiusnet', 'rbx'] as const)(
    'isErpImplemented(%s) === false',
    (provider) => {
      expect(isErpImplemented(provider)).toBe(false);
    },
  );

  it('createErpProvider retorna adapter com .name correto para os 5 implementados', () => {
    const providers = ['ixc', 'mkauth', 'voalle', 'sgp', 'hubsoft'] as const;
    for (const p of providers) {
      const adapter = createErpProvider(p, creds);
      expect(adapter.name).toBe(p);
    }
  });

  it('createErpProvider lança para provider não implementado', () => {
    expect(() => createErpProvider('radiusnet' as any, creds)).toThrow('não implementado');
  });
});
