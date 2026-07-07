import { estimateTokens } from './context-window.service';

/**
 * IA-30 — Compressão determinística de contexto RAG.
 *
 * Estratégia (zero LLM, zero custo):
 * 1. Por seção (ragContext, dbContext, zepContext): split em sentenças via regex
 *    /(?<=[.!?…])\s+/, normaliza (lowercase + trim + colapsa espaços), dedupe
 *    GLOBAL via Set — a MESMA sentença vinda de 2 chunks do RAG entra 1x
 *    (mantém a 1ª ocorrência, ordem preservada entre seções).
 * 2. Trunca cada seção ao budget (corte em FRONTEIRA de sentença, nunca no meio).
 * 3. Monta com os labels originais. Retorna contagens (tokensBefore / tokensAfter).
 *
 * Reavaliar LLMLingua (Python) na Fase 2 se o ganho estagnar abaixo de 30%.
 */

export interface CompressionSection {
  label: string;
  text: string;
  budgetTokens: number;
}

export interface CompressionResult {
  text: string;
  tokensBefore: number;
  tokensAfter: number;
  savedPct: number;
}

export const DEFAULT_BUDGETS = {
  RAG: 2000,
  DB: 500,
  ZEP: 500,
} as const;

function splitSentences(text: string): string[] {
  if (!text) return [];
  // Quebra em fronteiras de sentença (mantém pontuação no token anterior via lookbehind).
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalize(sentence: string): string {
  return sentence
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateToTokens(sentences: string[], budgetTokens: number): string[] {
  if (budgetTokens <= 0 || sentences.length === 0) return [];
  const out: string[] = [];
  let used = 0;
  for (const s of sentences) {
    const tokens = estimateTokens(s);
    if (used + tokens > budgetTokens) break;
    out.push(s);
    used += tokens;
  }
  return out;
}

function compressSection(section: CompressionSection, seen: Set<string>): { kept: string[]; before: number; after: number } {
  if (!section.text) return { kept: [], before: 0, after: 0 };

  const sentences = splitSentences(section.text);
  const unique: string[] = [];
  for (const s of sentences) {
    const key = normalize(s);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }
  const truncated = truncateToTokens(unique, section.budgetTokens);
  return {
    kept: truncated,
    before: estimateTokens(section.text),
    after: estimateTokens(truncated.join(' ')),
  };
}

/**
 * Comprime e remontra o systemContext (RAG + DB + Zep) com dedup global e budget por seção.
 */
export function compressContext(
  sections: CompressionSection[],
): CompressionResult {
  const seen = new Set<string>();
  let tokensBefore = 0;
  let tokensAfter = 0;
  const parts: string[] = [];

  for (const section of sections) {
    const { kept, before, after } = compressSection(section, seen);
    tokensBefore += before;
    tokensAfter += after;
    if (kept.length === 0) continue;
    parts.push(`## ${section.label}:\n${kept.join(' ')}`);
  }

  const text = parts.join('\n\n---\n\n');
  const savedPct = tokensBefore === 0 ? 0 : Math.max(0, Math.round((1 - tokensAfter / tokensBefore) * 100));
  return { text, tokensBefore, tokensAfter, savedPct };
}

export function isPromptCompressionEnabled(): boolean {
  return (process.env.PROMPT_COMPRESSION_ENABLED ?? '').trim().toLowerCase() === 'true';
}
