/**
 * Saúde de uma conexão WhatsApp (canal core). Funções PURAS e testáveis: a rota
 * injeta os reads do Redis + a contagem da fila; aqui só se computa o shape.
 *
 * As chaves espelham EXATAMENTE o que o rateLimiter legado escreve
 * (`src/lib/rateLimiter.ts`), para que o card leia sinais reais:
 *   - `ban_signals:${instanceId}`            (INCR, TTL 1h) — sinais de banimento
 *   - `pause_jobs:${instanceId}`             (SETEX 30m)    — envios pausados
 *   - `daily_msg_count:${tenantId}:${yyyy-mm-dd}` (INCR)    — envios do dia
 * `messages_in_queue` vem da fila global BullMQ `astrum-messages` (waiting).
 */

export interface HealthStatsDeps {
  /** Redis GET (string | null). */
  get: (key: string) => Promise<string | null>;
  /** Redis EXISTS (0 | 1). */
  exists: (key: string) => Promise<number>;
  /** Contagem de jobs aguardando na fila global de mensagens. */
  queueWaiting: () => Promise<number>;
  /** Injetável para teste; default `new Date()`. */
  now?: Date;
}

export interface WhatsAppHealthStats {
  ban_signals: number;
  is_paused: boolean;
  daily_messages_today: number;
  messages_in_queue: number;
}

export type WhatsAppRiskLevel = 'ok' | 'warning' | 'critical';

/**
 * Classificação de risco de banimento — função PURA (sem I/O), usada tanto pelo
 * card ao vivo quanto pelo worker de snapshot histórico.
 *
 *   critical: ban_signals >= 3 OU envios pausados (rate limiter no teto)
 *   warning:  ban_signals >= 1
 *   ok:       nenhum sinal
 */
export function computeRiskLevel(stats: WhatsAppHealthStats): WhatsAppRiskLevel {
  if (stats.ban_signals >= 3 || stats.is_paused === true) return 'critical';
  if (stats.ban_signals >= 1) return 'warning';
  return 'ok';
}

/** Chave do contador diário — mesmo formato do rateLimiter legado (data LOCAL do servidor). */
export function dailyCountKey(tenantId: string, now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `daily_msg_count:${tenantId}:${yyyy}-${mm}-${dd}`;
}

function toInt(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Lê os sinais do Redis + fila e devolve o shape que o card `WhatsAppPage` consome.
 * Tolerante a falha: se a fila estiver indisponível, `messages_in_queue` cai para 0
 * em vez de derrubar o endpoint (é um indicador, não uma verdade transacional).
 */
export async function computeHealthStats(
  tenantId: string,
  instanceId: string,
  deps: HealthStatsDeps,
): Promise<WhatsAppHealthStats> {
  const now = deps.now ?? new Date();
  const [banRaw, pausedFlag, dailyRaw, queueWaiting] = await Promise.all([
    deps.get(`ban_signals:${instanceId}`),
    deps.exists(`pause_jobs:${instanceId}`),
    deps.get(dailyCountKey(tenantId, now)),
    deps.queueWaiting().catch(() => 0),
  ]);

  return {
    ban_signals: toInt(banRaw),
    is_paused: pausedFlag === 1,
    daily_messages_today: toInt(dailyRaw),
    messages_in_queue: Number.isFinite(queueWaiting) && queueWaiting > 0 ? queueWaiting : 0,
  };
}
