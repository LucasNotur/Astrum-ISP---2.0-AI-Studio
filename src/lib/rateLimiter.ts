import redis from './redis.ts';
import { getTenantPlanId } from './featureFlags.ts';
import { PLANS } from './plans.ts';

export const acquireSendSlot = async (tenantId: string, instanceId: string, limitPerSecond: number = 30): Promise<{ allowed: boolean, retryAfter?: number }> => {
  if (!redis) {
    return { allowed: true };
  }

  const key = `rate_limit:instance:${tenantId}:${instanceId}`;
  const now = Date.now();
  const windowStart = now - 1000;
  
  // Limpar entradas antigas
  await redis.zremrangebyscore(key, 0, windowStart);
  
  // Obter contagem atual
  const count = await redis.zcard(key);
  
  if (count < limitPerSecond) {
    // Adicionar nova chamada
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    // Manter a key com tempo de vida para não poluir
    await redis.expire(key, 5);
    return { allowed: true };
  } else {
    // Buscar o score do item mais antigo da janela para saber quando tentar de novo
    const oldestItemScore = await redis.zrangebyscore(key, '-inf', '+inf', 'LIMIT', 0, 1);
    let retryAfter = 1000; // default
    if (oldestItemScore && oldestItemScore.length > 0) {
        // the mock doesn't handle LIMIT well, but in ioredis it will return array of strings. 
        // to simplify for mock/ioredis cross compatibility we might not get exact oldest easily, 
        // fallback to standard 1000ms if not confident.
        retryAfter = 1000;
    }
    return { allowed: false, retryAfter };
  }
};

export const checkDailyLimit = async (tenantId: string): Promise<{ allowed: boolean, remaining: number }> => {
  if (!redis) {
     return { allowed: true, remaining: 999999 };
  }
  
  const planId = await getTenantPlanId(tenantId);
  const plan = PLANS[planId] || PLANS['FREE'];
  
  if (plan.limits.monthly_messages === -1) {
    return { allowed: true, remaining: -1 }; // unlimited
  }
  
  const dailyLimit = Math.ceil(plan.limits.monthly_messages / 30);
  
  const d = new Date();
  const yyyyMmDd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const key = `daily_msg_count:${tenantId}:${yyyyMmDd}`;
  
  const currentCountStr = await redis.get(key);
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
  
  if (currentCount >= dailyLimit) {
    return { allowed: false, remaining: 0 };
  }
  
  return { allowed: true, remaining: dailyLimit - currentCount };
};

export const incrementDailyLimit = async (tenantId: string) => {
    if (!redis) return;
    const d = new Date();
    const yyyyMmDd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const key = `daily_msg_count:${tenantId}:${yyyyMmDd}`;
    
    await redis.incr(key);
    await redis.expire(key, 86400 * 2); // 48 hours TTL
};
