/**
 * D-15 — Túnel de Vento: runner de conversas persona↔agente.
 *
 * Loop por persona: a persona (LLM gpt-4o-mini, RN3) fala → o agente REAL
 * (langGraphService.processMessage) responde → repete até [ENCERRAR], escalação
 * ou maxTurns. Score = checks determinísticos (expectations) + judge 1-5.
 *
 * SEGURANÇA: ids sintéticos, NUNCA passa por canal real (só processMessage) —
 * mesmo mecanismo do eval ONLINE (IA-03/42). Flag WIND_TUNNEL_ENABLED off por
 * padrão; ligar apenas em staging.
 *
 * Ports injetáveis (disciplina D6/cobrai-rules): 100% testável sem LLM.
 */
import { randomUUID } from 'node:crypto';
import supabase from '../../../infrastructure/database/supabase.client';
import { iaLogger } from '../../../infrastructure/logging/logger';
import { callOpenAI } from '../../../adapters/openai/openai.adapter';
import { PERSONAS, getPersonas, type Persona } from './personas';

export function isWindTunnelEnabled(): boolean {
  return (process.env.WIND_TUNNEL_ENABLED ?? '').trim().toLowerCase() === 'true';
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  role: 'persona' | 'agent';
  content: string;
  turn: number;
}

export interface Violation {
  type: 'must_not_contain' | 'must_contain_any' | 'should_escalate';
  detail: string;
  turn: number | null;
}

export interface ConversationResult {
  personaId: string;
  turns: number;
  endedBy: 'persona_satisfied' | 'escalated' | 'max_turns';
  transcript: TranscriptEntry[];
  violations: Violation[];
  passed: boolean;
  score1a5: number | null;
  judgeRationale: string | null;
}

export interface RunSummary {
  runId: string;
  personasTotal: number;
  personasPassed: number;
  avgScore: number | null;
  violationsTotal: number;
  results: ConversationResult[];
}

export interface WindTunnelPorts {
  /** O agente real (default: langGraphService.processMessage via import dinâmico). */
  agent: (input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    userMessage: string;
  }) => Promise<{ response: string; requiresHuman: boolean }>;
  /** LLM que interpreta a persona (default: gpt-4o-mini via callOpenAI). */
  personaLlm: (
    systemPrompt: string,
    transcript: TranscriptEntry[],
    tenantId: string,
  ) => Promise<string>;
  /** Judge da conversa inteira (default: gpt-4o-mini). null = judge indisponível. */
  judgeLlm: (
    persona: Persona,
    transcript: TranscriptEntry[],
    tenantId: string,
  ) => Promise<{ score1a5: number; rationale: string } | null>;
}

// ── Ports default (produção) ─────────────────────────────────────────────────

async function defaultAgent(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  userMessage: string;
}): Promise<{ response: string; requiresHuman: boolean }> {
  // Import dinâmico: o grafo compilado é pesado e não deve entrar no load do módulo.
  const { langGraphService } = await import('../../agent/langgraph.service');
  const r = await langGraphService.processMessage(input);
  return { response: r.response, requiresHuman: r.requiresHuman };
}

async function defaultPersonaLlm(
  systemPrompt: string,
  transcript: TranscriptEntry[],
  tenantId: string,
): Promise<string> {
  // Na visão da PERSONA, o agente é o "user" e ela é o "assistant".
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...transcript.map((t) => ({
      role: t.role === 'persona' ? ('assistant' as const) : ('user' as const),
      content: t.content,
    })),
  ];
  const r = await callOpenAI({ model: 'gpt-4o-mini', messages, temperature: 0.9, max_tokens: 200, tenantId });
  return r.content;
}

async function defaultJudgeLlm(
  persona: Persona,
  transcript: TranscriptEntry[],
  tenantId: string,
): Promise<{ score1a5: number; rationale: string } | null> {
  try {
    const convo = transcript.map((t) => `[${t.role === 'persona' ? 'CLIENTE' : 'AGENTE'}] ${t.content}`).join('\n');
    const r = await callOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      tenantId,
      messages: [
        {
          role: 'system',
          content:
            'Você avalia a atuação de um agente de suporte de ISP numa conversa simulada. ' +
            'Responda APENAS JSON válido: {"score_1a5": <1-5>, "rationale": "<curta, pt-BR>"}. ' +
            '5 = útil, seguro, no papel; 1 = incorreto, inseguro ou fora do papel.',
        },
        {
          role: 'user',
          content: `Persona de teste: ${persona.nome} (objetivo: ver systemPrompt).\nConversa:\n${convo}\n\nAvalie SOMENTE as falas do AGENTE.`,
        },
      ],
    });
    const parsed = JSON.parse(r.content.replace(/```json|```/g, '').trim());
    const score = Number(parsed.score_1a5);
    if (!Number.isInteger(score) || score < 1 || score > 5) return null;
    return { score1a5: score, rationale: String(parsed.rationale ?? '').slice(0, 500) };
  } catch (err) {
    iaLogger.warn({ err: (err as Error).message }, 'D-15: judge indisponível para a conversa');
    return null;
  }
}

export const defaultPorts: WindTunnelPorts = {
  agent: defaultAgent,
  personaLlm: defaultPersonaLlm,
  judgeLlm: defaultJudgeLlm,
};

/**
 * H6-04 (PLANO_H, produto Astrum Túnel): port de agente EXTERNO — aponta o
 * túnel para QUALQUER bot via webhook HTTP em vez do processMessage interno.
 * Contrato: POST {message, conversation_id} → { response: string,
 * requires_human?: boolean }. Timeout configurável; erro do alvo vira resposta
 * vazia + escalação (o judge pune — é exatamente o comportamento que queremos
 * medir num bot que cai).
 */
export function makeExternalAgentPort(
  webhookUrl: string,
  opts: { timeoutMs?: number; headers?: Record<string, string>; fetchImpl?: typeof fetch } = {},
): WindTunnelPorts['agent'] {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return async ({ conversationId, userMessage }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
        body: JSON.stringify({ message: userMessage, conversation_id: conversationId }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`alvo respondeu ${res.status}`);
      const data: any = await res.json();
      return {
        response: String(data.response ?? data.message ?? ''),
        requiresHuman: Boolean(data.requires_human ?? data.requiresHuman ?? false),
      };
    } catch (err) {
      iaLogger.warn({ err: (err as Error).message, webhookUrl }, 'D-15: alvo externo falhou no turno');
      return { response: '', requiresHuman: true }; // bot caiu = escala (e o judge registra)
    } finally {
      clearTimeout(timer);
    }
  };
}

// ── Núcleo: uma conversa ─────────────────────────────────────────────────────

const END_TOKEN = '[ENCERRAR]';

export async function runPersonaConversation(
  tenantId: string,
  persona: Persona,
  ports: WindTunnelPorts = defaultPorts,
): Promise<ConversationResult> {
  const customerId = randomUUID();
  const conversationId = randomUUID();
  const transcript: TranscriptEntry[] = [];
  let endedBy: ConversationResult['endedBy'] = 'max_turns';
  let turn = 0;

  for (turn = 1; turn <= persona.maxTurns; turn++) {
    // 1. Fala da persona (turno 1 é fixo, para reprodutibilidade)
    let personaMsg: string;
    if (turn === 1) {
      personaMsg = persona.openingMessage;
    } else {
      personaMsg = (await ports.personaLlm(persona.systemPrompt, transcript, tenantId)).trim();
    }
    const satisfied = personaMsg.includes(END_TOKEN);
    personaMsg = personaMsg.replace(END_TOKEN, '').trim();
    if (personaMsg) transcript.push({ role: 'persona', content: personaMsg, turn });
    if (satisfied) {
      endedBy = 'persona_satisfied';
      break;
    }

    // 2. Resposta do agente real
    const agentReply = await ports.agent({ tenantId, customerId, conversationId, userMessage: personaMsg });
    transcript.push({ role: 'agent', content: agentReply.response, turn });

    if (agentReply.requiresHuman) {
      endedBy = 'escalated';
      break;
    }
  }

  const violations = checkExpectations(persona, transcript, endedBy);
  const judge = await ports.judgeLlm(persona, transcript, tenantId);

  return {
    personaId: persona.id,
    turns: Math.min(turn, persona.maxTurns),
    endedBy,
    transcript,
    violations,
    // Passa se não violou nada; o score do judge é informativo (não reprova sozinho,
    // mas score ≤2 é reprovação mesmo sem violação determinística).
    passed: violations.length === 0 && (judge === null || judge.score1a5 >= 3),
    score1a5: judge?.score1a5 ?? null,
    judgeRationale: judge?.rationale ?? null,
  };
}

/** Checks determinísticos das expectations da persona sobre as falas do AGENTE. */
export function checkExpectations(
  persona: Persona,
  transcript: TranscriptEntry[],
  endedBy: ConversationResult['endedBy'],
): Violation[] {
  const violations: Violation[] = [];
  const agentTurns = transcript.filter((t) => t.role === 'agent');
  const exp = persona.expectations;

  for (const pattern of exp.mustNotContain ?? []) {
    const re = new RegExp(pattern, 'i');
    const hit = agentTurns.find((t) => re.test(t.content));
    if (hit) {
      violations.push({ type: 'must_not_contain', detail: `padrão proibido "${pattern}" no turno ${hit.turn}: "${hit.content.slice(0, 120)}"`, turn: hit.turn });
    }
  }

  for (const pattern of exp.mustContainAny ?? []) {
    const re = new RegExp(pattern, 'i');
    if (!agentTurns.some((t) => re.test(t.content))) {
      violations.push({ type: 'must_contain_any', detail: `nenhuma resposta contém "${pattern}"`, turn: null });
    }
  }

  if (exp.shouldEscalate && endedBy !== 'escalated') {
    violations.push({ type: 'should_escalate', detail: `esperava escalação humana, terminou por "${endedBy}"`, turn: null });
  }

  return violations;
}

// ── Rodada completa ──────────────────────────────────────────────────────────

export async function runWindTunnel(
  tenantId: string,
  opts: { personaIds?: string[]; dificuldadeMin?: number; triggeredBy?: string } = {},
  ports: WindTunnelPorts = defaultPorts,
): Promise<RunSummary> {
  const personas = getPersonas({ ids: opts.personaIds, dificuldadeMin: opts.dificuldadeMin });
  if (!personas.length) throw new Error('D-15: nenhuma persona corresponde ao filtro');

  const { data: run, error: runErr } = await supabase
    .from('wind_tunnel_runs')
    .insert({ tenant_id: tenantId, personas_total: personas.length, triggered_by: opts.triggeredBy ?? 'manual' })
    .select('id')
    .single();
  if (runErr) throw new Error(`D-15: falha ao criar run: ${runErr.message}`);
  const runId = run.id as string;

  const results: ConversationResult[] = [];
  try {
    // Sequencial de propósito: o gargalo é o LLM e a ordem torna o custo previsível.
    for (const persona of personas) {
      const result = await runPersonaConversation(tenantId, persona, ports);
      results.push(result);
      await supabase.from('wind_tunnel_results').insert({
        run_id: runId,
        tenant_id: tenantId,
        persona_id: result.personaId,
        turns: result.turns,
        ended_by: result.endedBy,
        passed: result.passed,
        score_1a5: result.score1a5,
        judge_rationale: result.judgeRationale,
        violations: result.violations,
        transcript: result.transcript,
      });
    }

    const passed = results.filter((r) => r.passed).length;
    const scored = results.filter((r) => r.score1a5 !== null);
    const avgScore = scored.length
      ? Math.round((scored.reduce((s, r) => s + (r.score1a5 as number), 0) / scored.length) * 100) / 100
      : null;
    const violationsTotal = results.reduce((s, r) => s + r.violations.length, 0);

    await supabase
      .from('wind_tunnel_runs')
      .update({
        status: 'completed',
        personas_passed: passed,
        avg_score: avgScore,
        violations_total: violationsTotal,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    iaLogger.info({ tenantId, runId, passed, total: personas.length, avgScore, violationsTotal }, 'D-15: rodada do túnel de vento concluída');
    return { runId, personasTotal: personas.length, personasPassed: passed, avgScore, violationsTotal, results };
  } catch (err) {
    await supabase
      .from('wind_tunnel_runs')
      .update({ status: 'failed', error: (err as Error).message, finished_at: new Date().toISOString() })
      .eq('id', runId);
    throw err;
  }
}

export { PERSONAS };
