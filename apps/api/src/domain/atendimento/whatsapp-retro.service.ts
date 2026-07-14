/**
 * D-23 — GÊNESIS ENGINE (núcleo): análise retroativa do histórico de WhatsApp.
 *
 * O botão "Análise Completa WhatsApp Engine": lê TODO o histórico já importado
 * (conversations/messages) + faturas, e constrói o perfil de cada contato —
 * como fala (IA-28), como paga, quais os problemas recorrentes — SEM esperar
 * 30–90 dias de uso. Meses de história viram diagnóstico no dia 1.
 *
 * Fase 1 = heurísticas determinísticas (grátis, auditáveis, rodam em segundos
 * para milhares de contatos). O port `enrichLlm` permite aprofundar contatos
 * de alto valor com 4o-mini depois (opcional, custo controlado).
 *
 * O perfil é gravado em customers.extra.retro_profile (JSONB — sem migration).
 */
import supabase from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface RetroMessage {
  role: string;          // 'user' = o cliente
  content: string;
  created_at: string;
}

export interface RetroInvoice {
  status: string;
  due_date: string;
  paid_at: string | null;
}

export type CommStyle = 'formal' | 'coloquial' | 'tecnico';
export type PayerType = 'pontual' | 'atrasa' | 'inadimplente' | 'sem_historico';

export interface ContactProfile {
  messageCount: number;
  firstContactAt: string | null;
  lastContactAt: string | null;
  commStyle: CommStyle;
  emojiRate: number;            // emojis por mensagem do cliente
  avgMessageLength: number;
  preferredHourBucket: string;  // 'manha' | 'tarde' | 'noite' | 'madrugada'
  topIssues: { issue: string; count: number }[];
  payerType: PayerType;
  paymentStats: { onTime: number; late: number; unpaid: number };
}

export interface RetroReport {
  tenantId: string;
  contactsAnalyzed: number;
  profilesWritten: number;
  payerMix: Record<PayerType, number>;
  styleMix: Record<CommStyle, number>;
  topIssuesGlobal: { issue: string; count: number }[];
  headline: string;
}

// ── Heurísticas (determinísticas, auditáveis, calibráveis) ───────────────────

/** Buckets de problema por palavra-chave — o vocabulário real do assinante BR. */
export const ISSUE_BUCKETS: Record<string, RegExp> = {
  'sem internet / queda': /sem internet|internet caiu|caiu (tudo|a net)|sem sinal|n[aã]o funciona|parou de funcionar|LOS/i,
  'lentidão': /lent[ao]|devagar|arrastando|travando|ping|lag|ruim a internet/i,
  'boleto / 2ª via': /boleto|2.? ?via|segunda via|fatura|pix|pagar|pagamento|vencimento/i,
  'wi-fi / cobertura': /wi-?fi|roteador|senha|alcan[cç]a|sinal fraco|quarto/i,
  'mudança / endereço': /mudan[cç]a|mudar de casa|endere[cç]o|transfer/i,
  'cancelamento / multa': /cancelar|cancelamento|multa|fidelidade/i,
  'upgrade / planos': /upgrade|plano melhor|mais veloc|aumentar|mega|giga/i,
  'religue / suspensão': /religa|desbloque|cortad[ao]|suspens[ao]/i,
};

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const FORMAL_HINTS = /\b(prezad|gostaria|por gentileza|solicito|cordialmente|agrade[cç]o)\b/i;
const TECH_HINTS = /\b(ping|latencia|lat[êe]ncia|dbm|onu|roteador|ip fixo|dns|porta|mbps|fibra|jitter)\b/i;
const SLANG_HINTS = /\b(vc|blz|mano|véi|kkk|pq|tá|oq|aff|net)\b/i;

export function classifyCommStyle(userMessages: RetroMessage[]): CommStyle {
  let formal = 0, tech = 0, slang = 0;
  for (const m of userMessages) {
    if (FORMAL_HINTS.test(m.content)) formal++;
    if (TECH_HINTS.test(m.content)) tech++;
    if (SLANG_HINTS.test(m.content) || EMOJI_RE.test(m.content)) slang++;
  }
  if (tech >= 2 && tech >= formal) return 'tecnico';
  if (formal > slang) return 'formal';
  return 'coloquial';
}

export function classifyPayer(invoices: RetroInvoice[]): { type: PayerType; stats: ContactProfile['paymentStats'] } {
  let onTime = 0, late = 0, unpaid = 0;
  for (const inv of invoices) {
    if (inv.paid_at) {
      const paid = new Date(inv.paid_at).getTime();
      const due = new Date(inv.due_date).getTime();
      if (paid <= due + 86400000) onTime++;
      else late++;
    } else if (inv.status === 'overdue') unpaid++;
  }
  const total = onTime + late + unpaid;
  const stats = { onTime, late, unpaid };
  if (total === 0) return { type: 'sem_historico', stats };
  if (unpaid / total >= 0.25) return { type: 'inadimplente', stats };
  if (late / total >= 0.3) return { type: 'atrasa', stats };
  return { type: 'pontual', stats };
}

function hourBucket(dates: string[]): string {
  const buckets = { manha: 0, tarde: 0, noite: 0, madrugada: 0 };
  for (const d of dates) {
    const h = new Date(d).getUTCHours() - 3; // BRT
    const hh = (h + 24) % 24;
    if (hh >= 6 && hh < 12) buckets.manha++;
    else if (hh >= 12 && hh < 18) buckets.tarde++;
    else if (hh >= 18 && hh < 24) buckets.noite++;
    else buckets.madrugada++;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * H6-02 (PLANO_H): vocabulário configurável por tenant. O default é o de ISP;
 * uma academia grava {"matrícula": "matricul|inscri", ...} em
 * tenants.extra.issue_buckets e o MESMO motor lê o negócio dela — sem fork.
 * Regex inválida do tenant é ignorada (nunca derruba a análise).
 */
export function resolveIssueBuckets(tenantBuckets?: Record<string, string> | null): Record<string, RegExp> {
  if (!tenantBuckets || typeof tenantBuckets !== 'object') return ISSUE_BUCKETS;
  const out: Record<string, RegExp> = {};
  for (const [issue, pattern] of Object.entries(tenantBuckets)) {
    try {
      out[issue] = new RegExp(String(pattern), 'i');
    } catch { /* regex inválida do tenant: pula */ }
  }
  return Object.keys(out).length ? out : ISSUE_BUCKETS;
}

/** O perfil de UM contato — função pura sobre o histórico dele. */
export function buildContactProfile(
  messages: RetroMessage[],
  invoices: RetroInvoice[],
  buckets: Record<string, RegExp> = ISSUE_BUCKETS,
): ContactProfile {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const dates = messages.map((m) => m.created_at).sort();

  const issueCounts = new Map<string, number>();
  for (const m of userMsgs) {
    for (const [issue, re] of Object.entries(buckets)) {
      if (re.test(m.content)) issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
    }
  }

  const emojiCount = userMsgs.filter((m) => EMOJI_RE.test(m.content)).length;
  const payer = classifyPayer(invoices);

  return {
    messageCount: messages.length,
    firstContactAt: dates[0] ?? null,
    lastContactAt: dates[dates.length - 1] ?? null,
    commStyle: classifyCommStyle(userMsgs),
    emojiRate: userMsgs.length ? Math.round((emojiCount / userMsgs.length) * 100) / 100 : 0,
    avgMessageLength: userMsgs.length
      ? Math.round(userMsgs.reduce((s, m) => s + m.content.length, 0) / userMsgs.length)
      : 0,
    preferredHourBucket: userMsgs.length ? hourBucket(userMsgs.map((m) => m.created_at)) : 'tarde',
    topIssues: [...issueCounts.entries()]
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    payerType: payer.type,
    paymentStats: payer.stats,
  };
}

// ── Orquestração: o botão "Análise Completa" ─────────────────────────────────

export interface RetroPorts {
  db: typeof supabase;
}
export const defaultPorts: RetroPorts = { db: supabase };

export async function runRetroAnalysis(
  tenantId: string,
  ports: RetroPorts = defaultPorts,
): Promise<RetroReport> {
  const db = ports.db;

  // H6-02: vocabulário do tenant (default ISP) — a chave da multi-verticalidade
  const { data: tenantRow } = await db
    .from('tenants').select('extra').eq('id', tenantId).maybeSingle();
  const buckets = resolveIssueBuckets(tenantRow?.extra?.issue_buckets ?? null);

  // Clientes que têm conversa (o retroativo só analisa quem falou)
  const { data: convs, error: convErr } = await db
    .from('conversations')
    .select('id, customer_id')
    .eq('tenant_id', tenantId)
    .not('customer_id', 'is', null);
  if (convErr) throw new Error(`D-23 retro: ${convErr.message}`);

  const byCustomer = new Map<string, string[]>();
  for (const c of convs ?? []) {
    if (!byCustomer.has(c.customer_id)) byCustomer.set(c.customer_id, []);
    byCustomer.get(c.customer_id)!.push(c.id);
  }

  const payerMix: RetroReport['payerMix'] = { pontual: 0, atrasa: 0, inadimplente: 0, sem_historico: 0 };
  const styleMix: RetroReport['styleMix'] = { formal: 0, coloquial: 0, tecnico: 0 };
  const globalIssues = new Map<string, number>();
  let written = 0;

  for (const [customerId, convIds] of byCustomer) {
    const [{ data: msgs }, { data: invs }] = await Promise.all([
      db.from('messages')
        .select('role, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true }),
      db.from('invoices')
        .select('status, due_date, paid_at')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId),
    ]);

    const profile = buildContactProfile(
      (msgs ?? []) as RetroMessage[],
      (invs ?? []) as RetroInvoice[],
      buckets,
    );
    payerMix[profile.payerType]++;
    styleMix[profile.commStyle]++;
    for (const i of profile.topIssues) {
      globalIssues.set(i.issue, (globalIssues.get(i.issue) ?? 0) + i.count);
    }

    // Grava no JSONB extra do cliente (merge preservando o que já existe)
    const { data: current } = await db
      .from('customers').select('extra')
      .eq('id', customerId).eq('tenant_id', tenantId).maybeSingle();
    const { error: upErr } = await db
      .from('customers')
      .update({ extra: { ...(current?.extra ?? {}), retro_profile: profile } })
      .eq('id', customerId)
      .eq('tenant_id', tenantId);
    if (!upErr) written++;
  }

  const topIssuesGlobal = [...globalIssues.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const report: RetroReport = {
    tenantId,
    contactsAnalyzed: byCustomer.size,
    profilesWritten: written,
    payerMix,
    styleMix,
    topIssuesGlobal,
    headline:
      `Analisei ${byCustomer.size} contatos do seu histórico: ` +
      `${payerMix.pontual} pontuais, ${payerMix.atrasa} atrasam, ${payerMix.inadimplente} inadimplentes. ` +
      `Problema nº 1: ${topIssuesGlobal[0]?.issue ?? 'nenhum recorrente'}. ` +
      'Isso normalmente levaria 60–90 dias de operação para descobrir.',
  };

  atendimentoLogger.info(
    { tenantId, contacts: report.contactsAnalyzed, written },
    'D-23: análise retroativa concluída',
  );
  return report;
}
