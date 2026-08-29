/**
 * Idempotência de jobs por messageId.
 *
 * O BullMQ entrega jobs at-least-once: se um job lançar exceção DEPOIS de já ter
 * causado efeito colateral externo (ex.: resposta já enviada pelo canal, mas a
 * conexão caiu / o processo morreu antes do ack), ele é re-executado do zero.
 * Sem guarda, isso re-roda o LangGraph (custo de LLM de novo) e re-envia a mesma
 * resposta ao cliente (mensagem duplicada).
 *
 * Guarda: uma chave "processado" no Redis por (tenant, messageId), gravada logo
 * após o envio ter sucesso. Na re-execução, o worker vê a chave e ignora o job.
 * TTL de 24h cobre a janela de retry do BullMQ com folga (retries acontecem em
 * segundos/minutos) sem vazar chaves pra sempre.
 *
 * Store injetável (interface mínima GET/SET) para testar sem Redis real. Em
 * produção passamos `getRedisClient()` — o client de CACHE, não a `connection`
 * de fila do BullMQ (esta fica ocupada com comandos bloqueantes; ver o comentário
 * #2 em redis.client.ts).
 */
export interface IdempotencyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
}

// 24h — cobre a janela de retry do BullMQ com folga sem acumular chaves eternas.
export const PROCESSED_TTL_SECONDS = 60 * 60 * 24;

export function processedKey(tenantId: string, messageId: string): string {
  return `idem:atendimento:${tenantId}:${messageId}`;
}

export async function isMessageProcessed(
  store: IdempotencyStore,
  tenantId: string,
  messageId: string,
): Promise<boolean> {
  const v = await store.get(processedKey(tenantId, messageId));
  return v !== null && v !== undefined;
}

export async function markMessageProcessed(
  store: IdempotencyStore,
  tenantId: string,
  messageId: string,
): Promise<void> {
  await store.set(processedKey(tenantId, messageId), '1', 'EX', PROCESSED_TTL_SECONDS);
}
