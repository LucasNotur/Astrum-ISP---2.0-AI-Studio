import { describe, it, expect } from 'vitest';
import {
  getPrompt,
  listPrompts,
  resolvePrompt,
  promptHash,
  BASE_PROMPT,
  type PromptId,
} from './prompt-registry';

describe('prompt-registry — IA-03', () => {
  describe('promptHash', () => {
    it('é sha256 truncado em 12 chars', () => {
      // sha256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(promptHash('')).toBe('e3b0c44298fc');
    });

    it('é determinístico — mesma string, mesmo hash', () => {
      expect(promptHash('abc')).toBe(promptHash('abc'));
    });

    it('muda quando o texto muda', () => {
      expect(promptHash('abc')).not.toBe(promptHash('abd'));
    });

    it('sempre 12 chars', () => {
      const h = promptHash('a'.repeat(1000));
      expect(h).toHaveLength(12);
    });
  });

  describe('getPrompt', () => {
    it('retorna todos os ids conhecidos', () => {
      const ids = listPrompts().map((p) => p.id);
      expect(ids.sort()).toEqual(
        ['chat', 'classification', 'technical_diagnostic', 'ticket_report', 'safety_veto'].sort(),
      );
    });

    it('cada PromptVersion tem id/text/version não-vazio', () => {
      for (const p of listPrompts()) {
        expect(p.id.length).toBeGreaterThan(0);
        expect(p.version).toHaveLength(12);
        expect(p.text.length).toBeGreaterThan(50);
      }
    });

    it('lança para id desconhecido', () => {
      expect(() => getPrompt('nonexistent' as PromptId)).toThrow(/unknown prompt id/);
    });
  });

  describe('resolvePrompt (fallback)', () => {
    it('ids conhecidos retornam versão estável do registry', () => {
      const r = resolvePrompt('chat');
      expect(r.id).toBe('chat');
      expect(r.version).toBe(promptHash(r.text));
    });

    it('useCase unknown retorna BASE_PROMPT com hash do BASE', () => {
      const r = resolvePrompt('totally_unknown');
      expect(r.text).toBe(BASE_PROMPT);
      expect(r.version).toBe(promptHash(BASE_PROMPT));
    });
  });

  describe('estabilidade dos textos (IA-03 preserva literal)', () => {
    it('chat começa com o BASE', () => {
      expect(getPrompt('chat').text.startsWith(BASE_PROMPT)).toBe(true);
    });

    it('classification termina com a frase específica', () => {
      expect(getPrompt('classification').text.endsWith('classificar a intenção da mensagem. Seja preciso.')).toBe(true);
    });

    it('hashes entre prompts diferentes são distintos', () => {
      const versions = listPrompts().map((p) => p.version);
      expect(new Set(versions).size).toBe(versions.length);
    });
  });
});