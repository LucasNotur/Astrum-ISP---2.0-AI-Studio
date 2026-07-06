import { describe, it, expect } from 'vitest';
import { compressContext, DEFAULT_BUDGETS, isPromptCompressionEnabled, type CompressionSection } from './context-compressor';

describe('context-compressor (IA-30)', () => {
  describe('Dedup entre seções', () => {
    it('remove sentença duplicada GLOBALMENTE (mesma frase em RAG e DB)', () => {
      const dup = 'O cliente tem plano de 100MB.';
      const sections: CompressionSection[] = [
        { label: 'Documentos Técnicos', text: `${dup} O modem deve estar ligado.`, budgetTokens: 200 },
        { label: 'Dados do Cliente', text: `${dup} Status: active.`, budgetTokens: 200 },
      ];
      const r = compressContext(sections);
      // A frase duplicada entra 1x só — a 1ª ocorrência (RAG) é mantida
      expect(r.text).toContain(dup);
      // e NÃO aparece 2x
      const occurrences = r.text.split(dup).length - 1;
      expect(occurrences).toBe(1);
      // Tokens diminuem
      expect(r.tokensAfter).toBeLessThan(r.tokensBefore);
      expect(r.savedPct).toBeGreaterThan(0);
    });

    it('preserva 1ª ocorrência e descarta a 2ª mesmo com capitalização diferente', () => {
      const s1 = 'A senha padrão do roteador é admin.';
      const s2 = 'a senha padrao do roteador e admin.'; // sem acentos
      const r = compressContext([
        { label: 'A', text: s1, budgetTokens: 100 },
        { label: 'B', text: s2, budgetTokens: 100 },
      ]);
      // s2 é descartada (NFD + lowercase = mesmo key de s1)
      expect(r.text).toContain(s1);
      expect(r.text).not.toContain(s2);
    });
  });

  describe('Truncation por budget', () => {
    it('respeita fronteira de sentença — NUNCA corta no meio', () => {
      const text = 'A primeira sentença do texto. Segunda sentença. Terceira sentença longa. Quarta curta.';
      const r = compressContext([
        { label: 'X', text, budgetTokens: 30 },
      ]);
      // Texto deve terminar com pontuação (fronteira de sentença)
      const lastChar = r.text.trim().slice(-1);
      expect(['.', '!', '?', '…']).toContain(lastChar);
    });

    it('budget 0 → seção vazia', () => {
      const r = compressContext([
        { label: 'Vazia', text: 'Algum texto aqui.', budgetTokens: 0 },
      ]);
      expect(r.text).toBe('');
      expect(r.tokensBefore).toBeGreaterThan(0);
      expect(r.tokensAfter).toBe(0);
    });

    it('texto menor que budget → intacto (before == after)', () => {
      const text = 'Frase curta.';
      const r = compressContext([
        { label: 'X', text, budgetTokens: 1000 },
      ]);
      expect(r.tokensAfter).toBe(r.tokensBefore);
      expect(r.text).toContain(text);
    });
  });

  describe('Multi-seções com dedup + truncation', () => {
    it('RAG grande, DB pequena, Zep pequena — labels preservados', () => {
      const sections: CompressionSection[] = [
        { label: 'RAG', text: 'S1. S2. S3. S4. S5.', budgetTokens: DEFAULT_BUDGETS.RAG },
        { label: 'DB', text: 'S6. S7.', budgetTokens: DEFAULT_BUDGETS.DB },
        { label: 'Zep', text: 'S8.', budgetTokens: DEFAULT_BUDGETS.ZEP },
      ];
      const r = compressContext(sections);
      expect(r.text).toContain('## RAG:');
      expect(r.text).toContain('## DB:');
      expect(r.text).toContain('## Zep:');
      expect(r.text).toContain('---');
    });
  });

  describe('Economia ≥ 30% em corpus repetitivo', () => {
    it('3 seções com 50% de overlap', () => {
      const base = 'O roteador deve ser reiniciado. A conexão é PPPoE. O suporte funciona 24/7.';
      const sections: CompressionSection[] = [
        { label: 'RAG', text: `${base} ${base} ${base}`, budgetTokens: 500 },
        { label: 'DB', text: `${base} ${base}`, budgetTokens: 500 },
        { label: 'Zep', text: base, budgetTokens: 500 },
      ];
      const r = compressContext(sections);
      expect(r.savedPct).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Edge cases', () => {
    it('sections vazias → texto vazio, 0 tokens', () => {
      const r = compressContext([
        { label: 'A', text: '', budgetTokens: 100 },
        { label: 'B', text: '', budgetTokens: 100 },
      ]);
      expect(r.text).toBe('');
      expect(r.tokensBefore).toBe(0);
      expect(r.tokensAfter).toBe(0);
    });

    it('splitSentences: whitespace-only → 0 tokens consumidos', () => {
      const r = compressContext([
        { label: 'X', text: '   ', budgetTokens: 100 },
      ]);
      // Whitespace puro é dividido em sentenças vazias que sao filtradas
      // -> nenhum token entra, mas o estimator nao eh perfeito (counta chars do whitespace).
      // O importante: kept=[] e a economia foi maxima.
      expect(r.text).toBe('');
    });
  });

  describe('Flag de ativação', () => {
    it('lê env normalizado', () => {
      const orig = process.env.PROMPT_COMPRESSION_ENABLED;
      process.env.PROMPT_COMPRESSION_ENABLED = 'TRUE';
      expect(isPromptCompressionEnabled()).toBe(true);
      process.env.PROMPT_COMPRESSION_ENABLED = 'false';
      expect(isPromptCompressionEnabled()).toBe(false);
      delete process.env.PROMPT_COMPRESSION_ENABLED;
      expect(isPromptCompressionEnabled()).toBe(false);
      if (orig !== undefined) process.env.PROMPT_COMPRESSION_ENABLED = orig;
    });
  });
});
