/**
 * D-05 Fase 2 — Sinal de confirmação do cliente acelera a KB viva.
 *
 * Na Fase 1 toda conversa resolvida espera 7 dias de quarentena (prova de que não
 * reabriu) antes de virar rascunho de artigo. Isso é lento quando o próprio cliente
 * já confirmou que resolveu ("funcionou!", 👍). Aqui a quarentena encurta e a fila
 * é priorizada pelo sinal — o artigo bom nasce mais rápido.
 *
 * Lógica 100% pura: sem I/O, testável isoladamente.
 */

/** Sinais observáveis de uma conversa resolvida. */
export interface ConversationSignals {
  resolvedAt: string;              // ISO
  messageCount: number;
  reopened: boolean;               // reabriu depois de resolvida → desqualifica
  explicitConfirmation: boolean;   // cliente confirmou que resolveu
  csatScore?: number | null;       // 1..5, se houver
}

export interface EligibilityOptions {
  /** "Agora" (ISO) — injetável para testes determinísticos. */
  now?: string;
  /** Quarentena padrão, em dias. Default 7. */
  quarantineDaysDefault?: number;
  /** Quarentena quando o cliente confirmou. Default 1. */
  quarantineDaysConfirmed?: number;
  /** Mínimo de mensagens para valer um artigo. Default 3. */
  minMessages?: number;
}

export interface Eligibility {
  eligible: boolean;
  reason: string;
  /** 0..100 — maior gera antes. */
  priority: number;
  quarantineDaysRequired: number;
  ageDays: number;
}

/** Normaliza texto: minúsculas, sem acentos. */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Padrões de confirmação explícita do cliente (PT-BR + emojis). */
const CONFIRMATION_PATTERNS: RegExp[] = [
  /\bresolveu\b/, /\bresolvido\b/, /\bfuncionou\b/, /\bdeu certo\b/,
  /\bconsegui\b/, /\bera isso\b/, /\bperfeito\b/, /\bvoltou\b/,
  /\btudo certo\b/, /\bja esta funcionando\b/, /\bnormalizou\b/,
];
const CONFIRMATION_EMOJIS = ['👍', '👌', '✅', '🙏'];

/**
 * Negações que invalidam a confirmação ("NÃO resolveu", "continua sem").
 * Conservador de propósito: um falso POSITIVO publicaria artigo de uma conversa
 * que não resolveu — bem pior que um falso negativo (que só espera a quarentena).
 */
const NEGATION_PATTERNS: RegExp[] = [
  /\bnao\b/, /\bnunca\b/, /\bnenhum/, /\bpiorou\b/, /\bpersiste\b/,
  /\bcontinua sem\b/, /\bcontinua ruim\b/, /\bvoltou a cair\b/,
];

/**
 * Detecta confirmação explícita numa mensagem do cliente. Puro.
 * Só conta mensagem do CLIENTE — elogio do agente não vale como prova.
 * Qualquer negação no texto derruba o sinal.
 */
export function detectConfirmationSignal(text: string | null | undefined): boolean {
  if (!text) return false;
  const norm = normalize(text);
  if (NEGATION_PATTERNS.some((re) => re.test(norm))) return false;
  if (CONFIRMATION_EMOJIS.some((e) => text.includes(e))) return true;
  return CONFIRMATION_PATTERNS.some((re) => re.test(norm));
}

/** Varre as mensagens do cliente procurando confirmação. Puro. */
export function hasCustomerConfirmation(
  messages: { role: string; content: string }[],
): boolean {
  return messages.some((m) => m.role === 'user' && detectConfirmationSignal(m.content));
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000;
}

/**
 * Decide se a conversa já pode virar rascunho e com que prioridade.
 * Quarentena encurta de 7d → 1d quando o cliente confirmou explicitamente.
 */
export function evaluateCandidate(
  signals: ConversationSignals,
  opts: EligibilityOptions = {},
): Eligibility {
  const now = opts.now ?? new Date().toISOString();
  const quarantineDefault = opts.quarantineDaysDefault ?? 7;
  const quarantineConfirmed = opts.quarantineDaysConfirmed ?? 1;
  const minMessages = opts.minMessages ?? 3;

  const ageDays = Math.round(daysBetween(signals.resolvedAt, now) * 100) / 100;
  const quarantineDaysRequired = signals.explicitConfirmation ? quarantineConfirmed : quarantineDefault;

  const base: Omit<Eligibility, 'eligible' | 'reason'> = {
    priority: 0, quarantineDaysRequired, ageDays,
  };

  if (signals.reopened) {
    return { ...base, eligible: false, reason: 'Conversa reabriu — a solução não se sustentou.' };
  }
  if (signals.messageCount < minMessages) {
    return { ...base, eligible: false, reason: `Conversa curta demais (< ${minMessages} mensagens).` };
  }
  if (ageDays < quarantineDaysRequired) {
    return {
      ...base,
      eligible: false,
      reason: `Em quarentena: faltam ${Math.max(0, Math.round((quarantineDaysRequired - ageDays) * 10) / 10)} dia(s).`,
    };
  }

  // Prioridade: confirmação explícita é o sinal mais forte; CSAT ajusta.
  let priority = 50;
  if (signals.explicitConfirmation) priority += 30;
  if (signals.csatScore != null) {
    if (signals.csatScore >= 4) priority += 15;
    else if (signals.csatScore <= 2) priority -= 30;
  }
  // Conversa mais rica tende a render artigo melhor (teto pequeno para não dominar).
  priority += Math.min(10, Math.floor(signals.messageCount / 5));
  priority = Math.max(0, Math.min(100, priority));

  return {
    ...base,
    eligible: true,
    priority,
    reason: signals.explicitConfirmation
      ? 'Cliente confirmou a solução — quarentena curta.'
      : 'Resolvida e estável pela quarentena padrão.',
  };
}

export interface RankedCandidate<T> {
  item: T;
  eligibility: Eligibility;
}

/** Filtra os elegíveis e ordena por prioridade (maior primeiro). Puro. */
export function rankCandidates<T>(
  entries: { item: T; signals: ConversationSignals }[],
  opts: EligibilityOptions = {},
): RankedCandidate<T>[] {
  return entries
    .map((e) => ({ item: e.item, eligibility: evaluateCandidate(e.signals, opts) }))
    .filter((r) => r.eligibility.eligible)
    .sort((a, b) => b.eligibility.priority - a.eligibility.priority);
}
