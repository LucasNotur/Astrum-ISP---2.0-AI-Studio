import { describe, it, expect, afterEach } from 'vitest';
import { isMultiAgentEnabled } from './engine-flags';

describe('engine-flags', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
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
});
