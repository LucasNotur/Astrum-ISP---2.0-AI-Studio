import { createHash } from 'crypto';
import { supabaseAdmin } from '../database/supabase.client';
import { infraLogger } from '../logging/logger';

/**
 * IA-06 — Audit trail imutável de decisões de IA.
 *
 * Toda passada do grafo gera um registro append-only com hash-chain por tenant.
 * UPDATE/DELETE são bloqueados no banco. A verificação da cadeia (`verifyChain`)
 * percorre até `limit` registros e retorna o primeiro elo inválido.
 *
 * Nota de concorrência (MVP): duas escritas simultâneas do mesmo tenant podem ler
 * o mesmo `prev_hash` (fork da corrente). `verifyChain` trata empate por `created_at`
 * e o objetivo é tamper-evidence, não consenso.
 */

export interface AuditDecisionInput {
  tenantId: string;
  conversationId?: string;
  customerId?: string;
  decisionType: 'agent_response' | 'escalation' | 'tool_call' | 'block';
  payload: Record<string, unknown>;
  promptVersion?: string;
}

export interface DecisionRecord {
  id: string;
  tenant_id: string;
  decision_type: string;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  created_at: string;
}

export function isAiAuditEnabled(): boolean {
  return (process.env.AI_AUDIT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Função pura: computa o hash de um registro.
 * hash = sha256(prevHash || payloadJson || createdAtISO)
 */
export function computeHash(prevHash: string, payload: Record<string, unknown>, createdAt: string): string {
  const payloadJson = JSON.stringify(payload);
  return createHash('sha256')
    .update(prevHash + payloadJson + createdAt)
    .digest('hex');
}

/**
 * Verifica a integridade da cadeia de registros de um tenant.
 * Retorna o primeiro elo inválido ou `null` se a cadeia estiver íntegra.
 *
 * Em caso de fork (mesmo prev_hash em registros diferentes por concorrência),
 * considera o mais antigo por `created_at` e reporta os demais como ramo.
 */
export async function verifyChain(
  records: DecisionRecord[],
): Promise<{ valid: boolean; invalidIndex?: number; reason?: string }> {
  if (records.length === 0) return { valid: true };

  // Ordenar por created_at ascendente
  const sorted = [...records].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (let i = 0; i < sorted.length; i++) {
    const record = sorted[i]!;
    const expectedPrev = i === 0 ? 'genesis' : sorted[i - 1]!.hash;

    if (record.prev_hash !== expectedPrev) {
      return {
        valid: false,
        invalidIndex: i,
        reason: `Hash chain broken at index ${i}: expected prev_hash "${expectedPrev.slice(0, 16)}...", got "${record.prev_hash.slice(0, 16)}..."`,
      };
    }

    const expectedHash = computeHash(record.prev_hash, record.payload, record.created_at);
    if (record.hash !== expectedHash) {
      return {
        valid: false,
        invalidIndex: i,
        reason: `Hash mismatch at index ${i}: payload may have been tampered`,
      };
    }
  }

  return { valid: true };
}

// ─── Client-side (requer dependência do supabase) ──────────────────────────

export interface AuditDeps {
  getLastHash: (tenantId: string) => Promise<string | null>;
  insertDecision: (record: {
    tenant_id: string;
    conversation_id?: string;
    customer_id?: string;
    decision_type: string;
    payload: Record<string, unknown>;
    prompt_version?: string;
    prev_hash: string;
    hash: string;
  }) => Promise<void>;
}

/**
 * Registra uma decisão de IA com hash-chain.
 * Fail-open + fire-and-forget: falha loga error mas NÃO quebra o fluxo principal.
 *
 * Implementação real em `ai-audit.service.ts` com dependência do supabase.
 */
export async function recordDecision(
  input: AuditDecisionInput,
  deps: AuditDeps,
): Promise<boolean> {
  if (!isAiAuditEnabled()) return false;

  const createdAt = new Date().toISOString();

  try {
    const lastHash = (await deps.getLastHash(input.tenantId)) ?? 'genesis';
    const hash = computeHash(lastHash, input.payload, createdAt);

    await deps.insertDecision({
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      decision_type: input.decisionType,
      payload: input.payload,
      prompt_version: input.promptVersion,
      prev_hash: lastHash,
      hash,
    });

    return true;
  } catch (err) {
    infraLogger.error({ err, tenantId: input.tenantId, decisionType: input.decisionType }, 'AI Audit: failed to record decision (fail-open)');
    return false;
  }
}

/**
 * Serviço concreto do audit trail com dependência do Supabase.
 * Usa supabaseAdmin para bypass de RLS na escrita.
 */
export class AiAuditService {
  /**
   * Registra uma decisão de IA com hash-chain.
   * Fire-and-forget: não lança exceção, loga erro e retorna false.
   */
  async recordDecision(input: AuditDecisionInput): Promise<boolean> {
    if (!isAiAuditEnabled()) return false;

    try {
      const { data, error } = await supabaseAdmin
        .from('ai_decision_log')
        .select('hash')
        .eq('tenant_id', input.tenantId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        infraLogger.error({ error, tenantId: input.tenantId }, 'AI Audit: failed to fetch last hash (fail-open)');
        return false;
      }

      const prevHash = (data && data.length > 0) ? data[0]!.hash : 'genesis';
      const createdAt = new Date().toISOString();
      const hash = computeHash(prevHash, input.payload, createdAt);

      const { error: insertErr } = await supabaseAdmin
        .from('ai_decision_log')
        .insert({
          tenant_id: input.tenantId,
          conversation_id: input.conversationId ?? null,
          customer_id: input.customerId ?? null,
          decision_type: input.decisionType,
          payload: input.payload,
          prompt_version: input.promptVersion ?? null,
          prev_hash: prevHash,
          hash,
        });

      if (insertErr) {
        infraLogger.error({ error: insertErr, tenantId: input.tenantId }, 'AI Audit: failed to insert decision (fail-open)');
        return false;
      }

      return true;
    } catch (err) {
      infraLogger.error({ err, tenantId: input.tenantId, decisionType: input.decisionType }, 'AI Audit: failed to record decision (fail-open)');
      return false;
    }
  }

  /**
   * Verifica a integridade da cadeia de um tenant.
   * Busca os últimos `limit` registros e verifica a hash-chain.
   */
  async verifyChain(tenantId: string, limit = 1000): Promise<{ valid: boolean; invalidIndex?: number; reason?: string }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('ai_decision_log')
        .select('id, tenant_id, decision_type, payload, prev_hash, hash, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error || !data) {
        return { valid: false, reason: `Failed to fetch records: ${error?.message ?? 'no data'}` };
      }

      return verifyChain(data as DecisionRecord[]);
    } catch (err) {
      return { valid: false, reason: `Unexpected error: ${(err as Error).message}` };
    }
  }
}

export const aiAuditService = new AiAuditService();
