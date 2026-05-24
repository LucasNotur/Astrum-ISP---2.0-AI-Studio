import redis from './redis.ts';
import { getTenantPlanId } from './featureFlags.ts';
import { PLANS } from './plans.ts';
import { adminDb as db } from './firebaseAdmin.ts';
import admin from './firebaseAdmin.ts';
import { logger } from './logger.ts';

export const acquireSendSlot = async (tenantId: string, instanceId: string, limitPerSecond?: number): Promise<{ allowed: boolean, retryAfter?: number }> => {
  if (!redis) {
    return { allowed: true };
  }

  let finalLimit = limitPerSecond;
  if (!finalLimit) {
    // try to get from tenant custom rate limit if not provided
    const tenantSnap = await db.collection('tenants').doc(tenantId).get();
    if (tenantSnap.exists) {
      const tData = tenantSnap.data() as any;
      finalLimit = tData.rate_limit || 30;
    } else {
      finalLimit = 30;
    }
  }

  const key = `rate_limit:instance:${tenantId}:${instanceId}`;
  const now = Date.now();
  const windowStart = now - 1000;
  
  // Limpar entradas antigas
  await redis.zremrangebyscore(key, 0, windowStart);
  
  // Obter contagem atual
  const count = await redis.zcard(key);
  
  if (count < finalLimit) {
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

export async function checkBanSignal(res: Response | undefined, tenantId: string, instanceId: string) {
  if (!res) return;
  let isBanned = false;
  if (res.status === 403) {
    isBanned = true;
  } else {
    try {
      const clone = res.clone();
      const bodyStr = await clone.text();
      if (bodyStr.toLowerCase().includes('banned') || bodyStr.toLowerCase().includes('blocked')) {
        isBanned = true;
      }
    } catch (e) {}
  }

  if (isBanned && redis) {
    const key = `ban_signals:${instanceId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600);
    
    if (count >= 3) {
      await redis.setex(`pause_jobs:${instanceId}`, 1800, 'paused');
      
      await db.collection('notifications').add({
        tenantId,
        title: 'Risco de Banimento no WhatsApp',
        message: `A instância ${instanceId} recebeu múltiplos sinais de banimento. Envios pausados por 30 min.`,
        type: 'warning',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('audit_logs').add({
        tenantId,
        action: 'WHATSAPP_BAN_RISK',
        details: `Instância ${instanceId} pode ter sido banida/bloqueada.`,
        user: 'system',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.warn('whatsapp_ban_risk', { tenant_id: tenantId, data: { instanceId, signals: count } });
    }
  }
}


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
