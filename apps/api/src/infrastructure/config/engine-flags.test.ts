import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getCobraiEngine,
  getAtendimentoEngine,
  isCobraiEngineActive,
  isAtendimentoEngineActive,
  shouldBootWorker,
  resolveAtendimentoEngineForTenant,
  resolveEvolutionWebhookMode,
  isMultiAgentEnabled,
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

  describe('isMultiAgentEnabled (IA-10)', () => {
    it('default é false', () => {
      delete process.env.MULTI_AGENT_ENABLED;
      expect(isMultiAgentEnabled()).toBe(false);
    });

    it('retorna true apenas quando env = true', () => {
      process.env.MULTI_AGENT_ENABLED = 'true';
      expect(isMultiAgentEnabled()).toBe(true);
    });

    it('qualquer outro valor é false (fail-safe)', () => {
      process.env.MULTI_AGENT_ENABLED = 'on';
      expect(isMultiAgentEnabled()).toBe(false);
    });
  });

  describe('resolveAtendimentoEngineForTenant (cutover canário S74)', () => {
    it('valor do tenant vence o default da env', () => {
      expect(resolveAtendimentoEngineForTenant('v2', 'legacy')).toBe('v2');
      expect(resolveAtendimentoEngineForTenant('legacy', 'v2')).toBe('legacy');
    });

    it('tenant sem valor (null) usa o default da env', () => {
      expect(resolveAtendimentoEngineForTenant(null, 'legacy')).toBe('legacy');
      expect(resolveAtendimentoEngineForTenant(undefined, 'v2')).toBe('v2');
    });

    it('valor inválido no tenant cai para o default (fail-safe)', () => {
      expect(resolveAtendimentoEngineForTenant('banana', 'legacy')).toBe('legacy');
    });

    it('permite 1 ISP em v2 enquanto os demais seguem legacy (canário)', () => {
      process.env.ATENDIMENTO_ENGINE = 'legacy'; // default global
      expect(resolveAtendimentoEngineForTenant('v2')).toBe('v2');       // ISP piloto
      expect(resolveAtendimentoEngineForTenant(null)).toBe('legacy');   // demais
    });
  });

  describe('resolveEvolutionWebhookMode (S74 — webhook Evolution legado)', () => {
    it('global legacy, tenant sem override -> legacy_and_shadow_mirror', () => {
      expect(resolveEvolutionWebhookMode(null, 'legacy')).toBe('legacy_and_shadow_mirror');
    });

    it('global legacy, tenant com override v2 -> proxy_to_v2 (canário)', () => {
      expect(resolveEvolutionWebhookMode('v2', 'legacy')).toBe('proxy_to_v2');
    });

    it('global v2, tenant sem override -> proxy_to_v2', () => {
      expect(resolveEvolutionWebhookMode(null, 'v2')).toBe('proxy_to_v2');
    });

    it('global v2, tenant com override legacy -> legacy_and_shadow_mirror (rollback fino)', () => {
      expect(resolveEvolutionWebhookMode('legacy', 'v2')).toBe('legacy_and_shadow_mirror');
    });

    it('override inválido no tenant cai pro default global (fail-safe)', () => {
      expect(resolveEvolutionWebhookMode('banana', 'v2')).toBe('proxy_to_v2');
      expect(resolveEvolutionWebhookMode('banana', 'legacy')).toBe('legacy_and_shadow_mirror');
    });

    it('sem 2º argumento, usa getAtendimentoEngine() (env real)', () => {
      process.env.ATENDIMENTO_ENGINE = 'v2';
      expect(resolveEvolutionWebhookMode(null)).toBe('proxy_to_v2');
    });
  });
});
