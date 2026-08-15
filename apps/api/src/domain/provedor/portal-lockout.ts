import redis from '../../infrastructure/cache/redis.client';

/**
 * AUTH-02 (auditoria 2026-08-10): lockout de tentativas no portal do assinante.
 *
 * O login do portal é por CPF + contrato — ambos NÃO-secretos e adivinháveis. Sem
 * lockout, dá para brute-forçar contrato (CPF conhecido) ou fazer credential stuffing
 * (muitos pares CPF+contrato) à vontade. Aqui limitamos por DOIS eixos:
 *   - por CPF   → trava o alvo específico após N falhas (contra brute-force de contrato);
 *   - por IP    → trava o atacante que rotaciona CPFs (contra credential stuffing).
 * Basta um dos dois estourar o limite para bloquear (429). Janela deslizante simples
 * via contador com TTL no Redis; sucesso limpa os contadores.
 */
export const PORTAL_MAX_FAILURES = 5;
export const PORTAL_LOCKOUT_WINDOW_SECONDS = 15 * 60;

const cpfKey = (tenantId: string, cpf: string) => `portal_fail:cpf:${tenantId}:${cpf}`;
const ipKey = (tenantId: string, ip: string) => `portal_fail:ip:${tenantId}:${ip}`;

export async function isPortalLockedOut(tenantId: string, cpf: string, ip: string): Promise<boolean> {
  const [c, i] = await Promise.all([
    redis.get(cpfKey(tenantId, cpf)),
    redis.get(ipKey(tenantId, ip)),
  ]);
  const over = (v: string | null) => v !== null && Number(v) >= PORTAL_MAX_FAILURES;
  return over(c) || over(i);
}

export async function recordPortalFailure(tenantId: string, cpf: string, ip: string): Promise<void> {
  for (const k of [cpfKey(tenantId, cpf), ipKey(tenantId, ip)]) {
    const n = await redis.incr(k);
    if (Number(n) === 1) await redis.expire(k, PORTAL_LOCKOUT_WINDOW_SECONDS);
  }
}

export async function clearPortalFailures(tenantId: string, cpf: string, ip: string): Promise<void> {
  await Promise.all([
    redis.del(cpfKey(tenantId, cpf)),
    redis.del(ipKey(tenantId, ip)),
  ]);
}
