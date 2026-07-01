import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getCobraiEngine,
  getAtendimentoEngine,
  isCobraiEngineActive,
  isAtendimentoEngineActive,
  shouldBootWorker,
} from './engine-flags';

describe('engine-flags', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.COBRAI_ENGINE;
    delete process.env.ATENDIMENTO_ENGINE;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  describe('getCobraiEngine', () => {
    it('default é legacy quando a env está ausente', () => {
      expect(getCobraiEngine()).toBe('legacy');
    });

    it('retorna v2 quando COBRAI_ENGINE=v2', () => {
      process.env.COBRAI_ENGINE = 'v2';
      expect(getCobraiEngine()).toBe('v2');
    });

    it('é case-insensitive e tolera espaços', () => {
      process.env.COBRAI_ENGINE = '  V2 ';
      expect(getCobraiEngine()).toBe('v2');
    });

    it('cai para legacy quando o valor é inválido (fail-safe)', () => {
      process.env.COBRAI_ENGINE = 'banana';
      expect(getCobraiEngine()).toBe('legacy');
    });
  });

  describe('getAtendimentoEngine', () => {
    it('default é legacy', () => {
      expect(getAtendimentoEngine()).toBe('legacy');
    });

    it('retorna v2 quando ATENDIMENTO_ENGINE=v2', () => {
      process.env.ATENDIMENTO_ENGINE = 'v2';
      expect(getAtendimentoEngine()).toBe('v2');
    });
  });

  describe('isCobraiEngineActive / isAtendimentoEngineActive', () => {
    it('reflete a engine ativa', () => {
      process.env.COBRAI_ENGINE = 'v2';
      expect(isCobraiEngineActive('v2')).toBe(true);
      expect(isCobraiEngineActive('legacy')).toBe(false);
    });

    it('default legacy para atendimento', () => {
      expect(isAtendimentoEngineActive('legacy')).toBe(true);
      expect(isAtendimentoEngineActive('v2')).toBe(false);
    });
  });

  describe('shouldBootWorker', () => {
    it('permite boot quando a engine bate com o self', () => {
      process.env.COBRAI_ENGINE = 'legacy';
      expect(shouldBootWorker('cobrai', 'legacy')).toBe(true);
    });

    it('bloqueia boot e loga quando a engine diverge', () => {
      process.env.COBRAI_ENGINE = 'v2';
      const log = vi.fn();
      expect(shouldBootWorker('cobrai', 'legacy', log)).toBe(false);
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0][0]).toContain('COBRAI_ENGINE');
    });

    it('impede que as duas engines de cobrança subam juntas', () => {
      // Com uma única env, no máximo uma das duas pode retornar true.
      for (const engine of ['legacy', 'v2'] as const) {
        process.env.COBRAI_ENGINE = engine;
        const legacyBoots = shouldBootWorker('cobrai', 'legacy');
        const v2Boots = shouldBootWorker('cobrai', 'v2');
        expect(legacyBoots && v2Boots).toBe(false);
        expect(legacyBoots || v2Boots).toBe(true);
      }
    });

    it('atendimento usa ATENDIMENTO_ENGINE, não COBRAI_ENGINE', () => {
      process.env.COBRAI_ENGINE = 'v2';
      process.env.ATENDIMENTO_ENGINE = 'legacy';
      expect(shouldBootWorker('atendimento', 'legacy')).toBe(true);
      expect(shouldBootWorker('atendimento', 'v2')).toBe(false);
    });
  });
});
