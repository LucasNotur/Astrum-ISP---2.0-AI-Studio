/**
 * IA-14 — Detector de idioma heurístico.
 *
 * Puro, zero custo, sem LLM. Lista de stopwords por idioma (pt, en, es),
 * contagem por palavra-tokenizado em minúsculas, score vencedor, empate ou
 * menos de 2 hits → 'pt' (conservador — fail-safe).
 *
 * 12 fixtures do plano: 4 por idioma (incluindo "hi, my internet is down",
 * "hola no tengo internet", "oi quero falar sobre minha fatura").
 */

export type SupportedLanguage = 'pt' | 'en' | 'es';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  pt: 'português',
  en: 'inglês',
  es: 'espanhol',
};

const STOPWORDS: Record<SupportedLanguage, string[]> = {
  // pt — 30 stopwords comuns (sem acentos para tolerar digitação relaxada)
  pt: [
    'a','o','as','os','um','uma','uns','umas','de','do','da','dos','das','no','na','nos','nas',
    'em','por','para','com','sem','que','se','e','ou','mas','ja','nao','sim','eu','voce','meu','minha',
  ],
  // en — 30
  en: [
    'the','a','an','and','or','but','if','is','are','was','were','be','been','have','has','had',
    'i','you','he','she','it','we','they','my','your','his','her','its','our','their','this','that',
  ],
  // es — 30
  es: [
    'el','la','los','las','un','una','unos','unas','de','del','en','por','para','con','sin','que','si',
    'no','se','es','son','estoy','estas','este','esta','yo','tu','mi','mis','tu','tengo','tienes',
  ],
};

const MIN_HITS = 2;

export function isLiveTranslationEnabled(): boolean {
  return (process.env.LIVE_TRANSLATION_ENABLED ?? '').trim().toLowerCase() === 'true';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function detectLanguage(text: string): SupportedLanguage {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 'pt';

  const scores: Record<SupportedLanguage, number> = { pt: 0, en: 0, es: 0 };
  for (const tok of tokens) {
    for (const lang of Object.keys(STOPWORDS) as SupportedLanguage[]) {
      if (STOPWORDS[lang].includes(tok)) scores[lang] += 1;
    }
  }

  const entries = Object.entries(scores) as Array<[SupportedLanguage, number]>;
  const max = Math.max(...entries.map(([, v]) => v));
  if (max < MIN_HITS) return 'pt';

  // desempate: o primeiro empatado vence (pt > en > es na ordem de Object.keys)
  // mas se dois empatados no topo, pt vence (conservador)
  const winners = entries.filter(([, v]) => v === max);
  if (winners.length > 1) {
    if (winners.some(([k]) => k === 'pt')) return 'pt';
    return winners[0]![0];
  }
  return winners[0]![0];
}
