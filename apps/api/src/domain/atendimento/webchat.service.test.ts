import { describe, it, expect } from 'vitest';
import {
  extractWebchatConfig,
  validateWebchatMessage,
  WebchatMessageValidationError,
} from './webchat.service';

describe('webchat.service', () => {
  describe('extractWebchatConfig', () => {
    it('tenant inexistente -> null', () => {
      expect(extractWebchatConfig(null)).toBeNull();
    });

    it('sem theme/agent_name -> defaults seguros', () => {
      expect(extractWebchatConfig({ extra: {} })).toEqual({
        primary_color: '#00C896',
        logo_url: '',
        agent_name: 'Agente',
      });
    });

    it('extra ausente -> defaults seguros', () => {
      expect(extractWebchatConfig({})).toEqual({
        primary_color: '#00C896',
        logo_url: '',
        agent_name: 'Agente',
      });
    });

    it('usa theme/agent_name quando presentes', () => {
      expect(extractWebchatConfig({
        extra: { theme: { primary_color: '#FF0000', logo_url: 'https://x/logo.png' }, agent_name: 'Sofia' },
      })).toEqual({
        primary_color: '#FF0000',
        logo_url: 'https://x/logo.png',
        agent_name: 'Sofia',
      });
    });
  });

  describe('validateWebchatMessage', () => {
    it('body válido passa', () => {
      expect(validateWebchatMessage({ tenantId: 't-1', sessionId: 's-1', text: 'oi' }))
        .toEqual({ tenantId: 't-1', sessionId: 's-1', text: 'oi' });
    });

    it('sem tenantId -> lança', () => {
      expect(() => validateWebchatMessage({ sessionId: 's-1', text: 'oi' })).toThrow(WebchatMessageValidationError);
    });

    it('sem sessionId -> lança', () => {
      expect(() => validateWebchatMessage({ tenantId: 't-1', text: 'oi' })).toThrow(WebchatMessageValidationError);
    });

    it('sem text -> lança', () => {
      expect(() => validateWebchatMessage({ tenantId: 't-1', sessionId: 's-1', text: '  ' })).toThrow(WebchatMessageValidationError);
    });

    it('text além do limite -> lança', () => {
      const big = 'a'.repeat(4001);
      expect(() => validateWebchatMessage({ tenantId: 't-1', sessionId: 's-1', text: big })).toThrow(WebchatMessageValidationError);
    });

    it('faz trim dos campos', () => {
      expect(validateWebchatMessage({ tenantId: ' t-1 ', sessionId: ' s-1 ', text: ' oi ' }))
        .toEqual({ tenantId: 't-1', sessionId: 's-1', text: 'oi' });
    });
  });
});
