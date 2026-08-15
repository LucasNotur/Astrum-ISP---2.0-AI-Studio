import redis from '../cache/redis.client';

/**
 * COST-01 (auditoria 2026-08-10): teto de orçamento LLM por tenant.
 *
 * Sem um teto, um tenant (ou um loop/abuso) pode gerar custo ilimitado de API de LLM
 * — DoS financeiro. Aqui: um cap MENSAL de tokens por tenant, contado no Redis, com
 * kill-switch. **Desabilitado por padrão** (`LLM_MONTHLY_TOKEN_BUDGET` ausente/0) →
 * no-op total, sem mudar o comportamento atual; o dono habilita quando quiser.
 *
 * Padrão soft-cap: checa ANTES (bloqueia se já estourou) e registra DEPOIS (o uso real
 * volta do provider). Pode-se exceder por no máximo 1 chamada — aceitável e simples.
 */

export function getMonthlyTokenBudget(): number {
  const n = Number(process.env.LLM_MONTHLY_TOKEN_BUDGET ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function isLlmBudgetEnabled(): boolean {
  return getMonthlyTokenBudget() > 0;
}

function monthKey(tenantId: string, now: Date): string {
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `llm_budget:${tenantId}:${ym}`;
}

export interface LlmBudgetStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export class LlmBudgetExceededError extends Error {
  readonly status: number;
  readonly budget: LlmBudgetStatus;
  constructor(tenantId: string, budget: LlmBudgetStatus) {
    super(`Orçamento mensal de LLM esgotado para o tenant ${tenantId} (${budget.used}/${budget.limit} tokens).`);
    this.name = 'LlmBudgetExceededError';
    this.status = 429;
    this.budget = budget;
  }
}

/** Estado do orçamento do tenant no mês corrente. Budget desabilitado → sempre allowed. */
export async function checkLlmBudget(tenantId: string, now: Date = new Date()): Promise<LlmBudgetStatus> {
  const limit = getMonthlyTokenBudget();
  if (limit <= 0) return { allowed: true, used: 0, limit: 0, remaining: Number.POSITIVE_INFINITY };
  const raw = await redis.get(monthKey(tenantId, now));
  const used = raw ? Number(raw) : 0;
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
}

/** Contabiliza tokens gastos no mês. No-op se o budget está desabilitado. */
export async function recordLlmUsage(tenantId: string, tokens: number, now: Date = new Date()): Promise<void> {
  if (!isLlmBudgetEnabled() || !Number.isFinite(tokens) || tokens <= 0) return;
  const k = monthKey(tenantId, now);
  const total = await redis.incrby(k, Math.round(tokens));
  // Primeira gravação do mês → TTL de ~40 dias (cobre o mês + folga p/ relatórios).
  if (total === Math.round(tokens)) {
    await redis.expire(k, 40 * 24 * 60 * 60);
  }
}

/** Lança LlmBudgetExceededError se o tenant já estourou o teto. */
export async function assertLlmBudget(tenantId: string, now: Date = new Date()): Promise<void> {
  const status = await checkLlmBudget(tenantId, now);
  if (!status.allowed) throw new LlmBudgetExceededError(tenantId, status);
}
