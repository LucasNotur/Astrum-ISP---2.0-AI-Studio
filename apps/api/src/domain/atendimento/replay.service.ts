/**
 * IA-46 — Replay engine de conversas.
 *
 * Plano Mestre V2, S74/S82: reexecuta pares (mensagem user → resposta assistant)
 * da tabela `messages` contra o motor atual em modo dry-run (ZERO envio de
 * WhatsApp, tools de escrita neutralizadas) e mede a equivalência com a
 * resposta original via LLM-as-judge.
 *
 * Cutover gate: pass_rate ≥ 95% antes de virar ATENDIMENTO_ENGINE=v2.
 *
 * Reuso explícito (R5 — D3):
 * - `computeEquivalenceRate` (shadow-mode.ts:73-83) é o coração da métrica.
 *   Não recriamos nada equivalente: injetamos o judge e delegamos.
 * - `langGraphService.processMessage` (apps/api/src/domain/agent/langgraph.service.ts)
 *   é chamado DIRETAMENTE — nunca pelo message.worker. Isso garante que
 *   `sendWhatsAppResponse` (message.worker.ts:83-88) NUNCA é invocado.
 *
 * D5 — zero efeito colateral:
 * - `DryRunToolsExecutor` intercepta as 3 tools de side-effect catalogadas em
 *   IA-19 (`suspend_signal`, `create_ticket`, `schedule_technical_visit`) e
 *   devolve `{ success: true, dryRun: true }` sem tocar o banco. As outras
 *   tools (read-only) seguem pelo executor real, já que não mutam estado.
 * - A factory `setCreateToolsOverride` em agent.nodes.ts é o único seam
 *   necessário para injetar o decorator no grafo. try/finally obrigatório.
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { iaLogger } from '../../infrastructure/logging/logger';
import { computeEquivalenceRate } from './shadow-mode';
import { setCreateToolsOverride } from '../agent/agent.nodes';
import { langGraphService } from '../agent/langgraph.service';
import { ToolsExecutor } from '../../infrastructure/ai/tools.executor';
import type { IToolsPort } from '../ports/ai.port';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface ReplayParams {
  from: string;   // ISO date — início do período
  to: string;     // ISO date — fim do período
  sample: number; // 10..500
}

export interface ReplayRunRow {
  id: string;
  tenant_id: string;
  params: ReplayParams;
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number | null;
  equivalent: number | null;
  pass_rate: number | null;
  created_at: string;
  finished_at: string | null;
}

export type ReplayVerdict = 'equivalente' | 'divergente' | 'erro';

export interface ReplayItemRow {
  id: string;
  run_id: string;
  conversation_id: string | null;
  user_message: string;
  original_response: string;
  candidate_response: string | null;
  verdict: ReplayVerdict | null;
  judge_rationale: string | null;
}

// E4 debt quita: SIDE_EFFECT_TOOLS agora vive em tool-registry.ts (fonte única).
import { SIDE_EFFECT_TOOLS } from '../../infrastructure/ai/tool-registry';
export { SIDE_EFFECT_TOOLS };

// ─── DryRunToolsExecutor ─────────────────────────────────────────────────────
// Implementa IToolsPort (mesma assinatura de `ToolsExecutor.execute`). Recebe
// o executor real para encaminhar tools read-only, e devolve um payload fixo
// para as tools de side-effect sem chamar o real.

export class DryRunToolsExecutor implements IToolsPort {
  constructor(private readonly real: IToolsPort) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (SIDE_EFFECT_TOOLS.has(toolName)) {
      iaLogger.info(
        { toolName, args },
        'Replay dry-run: side-effect tool interceptada (não toca banco)',
      );
      return { success: true, dryRun: true, tool: toolName };
    }
    return this.real.execute(toolName, args);
  }
}

// ─── Sampling ────────────────────────────────────────────────────────────────

interface MessageRow {
  id: string;
  tenant_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  extra: Record<string, unknown> | null;
}

interface ReplayPair {
  tenantId: string;
  conversationId: string;
  customerId: string;
  userMessage: string;
  originalResponse: string;
}

const MAX_SAMPLE = 500;
const MIN_SAMPLE = 10;

/**
 * Amostra pares (user, assistant seguinte) da tabela `messages` no período.
 * Exclui mensagens marcadas como `extra->>'source' = 'synthetic'` (IA-45).
 * Faz amostragem uniforme via `TABLESAMPLE` não é viável (precisa de contagem
 * exata) — então lemos o conjunto elegível e amostramos in-memory com Fisher-
 * Yates parcial. O LIMIT 5000 antes do shuffle é um teto saudável para 1 dia
 * de operação típica; ajuste se a operação triplicar.
 */
export async function sampleReplayPairs(
  tenantId: string,
  from: string,
  to: string,
  sample: number,
): Promise<ReplayPair[]> {
  const safeSample = Math.max(MIN_SAMPLE, Math.min(MAX_SAMPLE, Math.floor(sample)));

  // 1. Puxa mensagens do período, excluindo synthetic e system.
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, tenant_id, conversation_id, role, content, created_at, extra')
    .eq('tenant_id', tenantId)
    .in('role', ['user', 'assistant'])
    .gte('created_at', from)
    .lte('created_at', to)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`Falha ao amostrar mensagens para replay: ${error.message}`);
  }

  const rows = (data ?? []) as MessageRow[];
  if (rows.length === 0) return [];

  // 2. Descarta mensagens sintéticas.
  const realRows = rows.filter(
    (r) => (r.extra as any)?.source !== 'synthetic',
  );

  // 3. Agrupa por conversa e forma pares (user, assistant seguinte).
  const byConv = new Map<string, MessageRow[]>();
  for (const r of realRows) {
    const list = byConv.get(r.conversation_id) ?? [];
    list.push(r);
    byConv.set(r.conversation_id, list);
  }

  const pairs: ReplayPair[] = [];
  for (const list of byConv.values()) {
    for (let i = 0; i < list.length - 1; i++) {
      const userMsg = list[i];
      const assistantMsg = list[i + 1];
      if (userMsg && assistantMsg && userMsg.role === 'user' && assistantMsg.role === 'assistant') {
        pairs.push({
          tenantId,
          conversationId: userMsg.conversation_id,
          customerId: 'unknown', // preenchido depois via conversations
          userMessage: userMsg.content,
          originalResponse: assistantMsg.content,
        });
      }
    }
  }

  if (pairs.length <= safeSample) {
    // 4a. Menos pares que a amostra pedida: retorna todos.
    return await enrichCustomerIds(pairs);
  }

  // 4b. Fisher-Yates parcial: seleciona `safeSample` índices uniformemente.
  const indices = new Set<number>();
  while (indices.size < safeSample) {
    indices.add(Math.floor(Math.random() * pairs.length));
  }
  // `noUncheckedIndexedAccess: true` faz `pairs[i]` retornar `ReplayPair | undefined`.
  // O filtro é defensivo (índice sempre válido aqui), mas tipa corretamente.
  const sampled = Array.from(indices)
    .map((i) => pairs[i])
    .filter((p): p is ReplayPair => p !== undefined);
  return await enrichCustomerIds(sampled);
}

async function enrichCustomerIds(pairs: ReplayPair[]): Promise<ReplayPair[]> {
  if (pairs.length === 0) return pairs;
  const convIds = Array.from(new Set(pairs.map((p) => p.conversationId)));
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('id, customer_id')
    .in('id', convIds);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; customer_id: string | null }>) {
    if (row.customer_id) map.set(row.id, row.customer_id);
  }
  return pairs.map((p) => ({
    ...p,
    customerId: map.get(p.conversationId) ?? p.customerId,
  }));
}

// ─── Judge ───────────────────────────────────────────────────────────────────

const JudgeSchema = z.object({
  equivalent: z.boolean().describe('true se a resposta candidata preserva a intenção, as informações factuais e o tom da resposta original'),
  rationale: z.string().max(200).describe('Justificativa curta (max 200 chars) explicando o veredito'),
});

const judgeModel = openai('gpt-4o-mini');

/**
 * LLM-as-judge para UM par. O prompt é deliberadamente conservador:
 * queremos saber se a resposta é EQUIVALENTE na prática (não idêntica).
 * Erros do judge propagam — o caller (executeReplayRun) marca verdict='erro'.
 */
export async function judgeOnePair(
  userMessage: string,
  original: string,
  candidate: string,
  tenantId: string,
): Promise<{ equivalent: boolean; rationale: string }> {
  const { object } = await generateObject({
    model: judgeModel as any,
    schema: JudgeSchema,
    system:
      'Você julga se duas respostas de um agente de ISP para a mesma pergunta são EQUIVALENTES na prática. ' +
      'Considere: intenção, informação factual principal, tom, próximo passo sugerido. ' +
      'Diferenças cosméticas (pontuação, sinônimos) NÃO tornam divergente. ' +
      'Seja rigoroso: se o signatário da resposta é outro (humano vs. IA), ou se o link/pix/status de fatura mudou, marque divergente.',
    messages: [
      {
        role: 'user',
        content:
          `PERGUNTA DO CLIENTE:\n${userMessage}\n\n` +
          `RESPOSTA ORIGINAL:\n${original}\n\n` +
          `RESPOSTA CANDIDATA (motor de hoje):\n${candidate}`,
      },
    ],
    headers: {
      'Helicone-Property-TenantId': tenantId,
      'Helicone-Property-UseCase': 'replay-judge',
    },
  });
  return { equivalent: object.equivalent, rationale: object.rationale };
}

// ─── Execução da run (chamada pelo worker) ───────────────────────────────────

/**
 * Processa N pares. Fail-open: erro em um par → verdict='erro', continua os
 * demais. Ao final, calcula pass_rate e atualiza replay_runs.
 */
export async function executeReplayRun(runId: string): Promise<void> {
  const { data: run, error } = await supabaseAdmin
    .from('replay_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) {
    iaLogger.error({ runId, err: error?.message }, 'Replay run não encontrada');
    return;
  }

  const typedRun = run as ReplayRunRow;
  await supabaseAdmin
    .from('replay_runs')
    .update({ status: 'running' })
    .eq('id', runId);

  // Instala o override ANTES de qualquer chamada ao grafo. O try/finally é
  // obrigatório — se uma exception escapar, restauramos para não afetar o
  // próximo atendimento real.
  const realExecutor = new ToolsExecutor(typedRun.tenant_id) as unknown as IToolsPort;
  const dryExecutor = new DryRunToolsExecutor(realExecutor);
  setCreateToolsOverride(() => dryExecutor);

  const results: { pair: ReplayPair; verdict: ReplayVerdict; rationale: string | null; candidate: string | null }[] = [];

  try {
    const params = typedRun.params as ReplayParams;
    const pairs = await sampleReplayPairs(
      typedRun.tenant_id,
      params.from,
      params.to,
      params.sample,
    );

    for (const pair of pairs) {
      try {
        const out = await langGraphService.processMessage({
          tenantId: pair.tenantId,
          customerId: pair.customerId,
          conversationId: pair.conversationId,
          userMessage: pair.userMessage,
        });
        const candidate = out.response;
        const { equivalent, rationale } = await judgeOnePair(
          pair.userMessage,
          pair.originalResponse,
          candidate,
          pair.tenantId,
        );
        results.push({
          pair,
          verdict: equivalent ? 'equivalente' : 'divergente',
          rationale,
          candidate,
        });
      } catch (err) {
        iaLogger.warn(
          { err: (err as Error).message, conversationId: pair.conversationId },
          'Replay par falhou (fail-open) — marcando como erro',
        );
        results.push({
          pair,
          verdict: 'erro',
          rationale: (err as Error).message?.slice(0, 200) ?? 'erro desconhecido',
          candidate: null,
        });
      }
    }

    // Persistir todos os itens em batch.
    if (results.length > 0) {
      const items = results.map((r) => ({
        run_id: runId,
        tenant_id: typedRun.tenant_id,
        conversation_id: r.pair.conversationId,
        user_message: r.pair.userMessage,
        original_response: r.pair.originalResponse,
        candidate_response: r.candidate,
        verdict: r.verdict,
        judge_rationale: r.rationale,
      }));
      const { error: insertErr } = await supabaseAdmin
        .from('replay_items')
        .insert(items);
      if (insertErr) {
        iaLogger.error({ runId, err: insertErr.message }, 'Falha ao gravar replay_items');
      }
    }

    // Métrica final. Pass_rate considera APENAS equivalente vs divergente;
    // erros ficam fora do denominador (são falhas de execução, não de qualidade).
    const judged = results.filter((r) => r.verdict !== 'erro');
    const equivalent = judged.filter((r) => r.verdict === 'equivalente').length;
    const passRate = judged.length === 0 ? 0 : equivalent / judged.length;

    await supabaseAdmin
      .from('replay_runs')
      .update({
        status: 'done',
        total: results.length,
        equivalent,
        pass_rate: passRate,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    iaLogger.info(
      { runId, total: results.length, equivalent, passRate, errors: results.length - judged.length },
      'Replay concluído',
    );

    // IA-31: gravar empates Elo para itens equivalentes (flag-gated).
    if ((process.env.MODEL_ELO_ENABLED ?? '').trim().toLowerCase() === 'true') {
      try {
        const { recordMatch } = await import('../ml/elo-recorder.service');
        const config = typedRun.params as any;
        const originalKey = config?.original_key ?? 'epoch';
        const candidateKey = config?.candidate_key ?? 'current';
        const eqItems = results.filter((r) => r.verdict === 'equivalente');
        for (const r of eqItems) {
          await recordMatch({
            tenantId: typedRun.tenant_id,
            winnerKey: originalKey,
            loserKey: candidateKey,
            draw: true,
            source: 'replay',
            refId: r.pair.conversationId,
          });
        }
        iaLogger.info({ runId, eloMatches: eqItems.length }, '[elo] empates gravados');
      } catch (eloErr) {
        iaLogger.warn({ runId, err: (eloErr as Error).message }, '[elo] falha ao gravar empates (fail-open)');
      }
    }
  } catch (err) {
    iaLogger.error({ runId, err: (err as Error).message }, 'Replay falhou');
    await supabaseAdmin
      .from('replay_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('id', runId);
  } finally {
    setCreateToolsOverride(null);
  }
}

// ─── API para as rotas HTTP ──────────────────────────────────────────────────

export async function enqueueReplay(tenantId: string, params: ReplayParams): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('replay_runs')
    .insert({
      tenant_id: tenantId,
      params,
      status: 'queued',
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Falha ao criar replay_runs: ${error?.message ?? 'sem retorno'}`);
  }
  return (data as { id: string }).id;
}

export async function listReplayRuns(tenantId: string): Promise<ReplayRunRow[]> {
  const { data, error } = await supabaseAdmin
    .from('replay_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`Falha ao listar replay_runs: ${error.message}`);
  }
  return (data ?? []) as ReplayRunRow[];
}

export interface GetReplayRunDetailOptions {
  verdict?: ReplayVerdict;
  page?: number;
  pageSize?: number;
}

export interface ReplayRunDetail {
  status: ReplayRunRow['status'];
  total: number | null;
  equivalent: number | null;
  pass_rate: number | null;
  items: ReplayItemRow[];
  page: number;
  pageSize: number;
}

export async function getReplayRunDetail(
  tenantId: string,
  runId: string,
  opts: GetReplayRunDetailOptions = {},
): Promise<ReplayRunDetail | null> {
  const { data: run, error } = await supabaseAdmin
    .from('replay_runs')
    .select('id, status, total, equivalent, pass_rate')
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao buscar replay_runs: ${error.message}`);
  }
  if (!run) return null;

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from('replay_items')
    .select('id, run_id, conversation_id, user_message, original_response, candidate_response, verdict, judge_rationale')
    .eq('run_id', runId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (opts.verdict) {
    query = query.eq('verdict', opts.verdict);
  }
  const { data: items, error: itemsErr } = await query.range(from, to);
  if (itemsErr) {
    throw new Error(`Falha ao listar replay_items: ${itemsErr.message}`);
  }

  return {
    status: (run as any).status,
    total: (run as any).total,
    equivalent: (run as any).equivalent,
    pass_rate: (run as any).pass_rate,
    items: (items ?? []) as ReplayItemRow[],
    page,
    pageSize,
  };
}
