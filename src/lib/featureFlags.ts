import { adminDb as db } from './firebaseAdmin.ts';
import redis from './redis.ts';

/**
 * Plano/degrau do tenant (cacheado 10 min no Redis).
 *
 * ⚠️ HISTÓRICO: este módulo hospedava o gating do modelo ANTIGO de 4 planos
 * (FREE/PRO/BUSINESS/ENTERPRISE) via `checkFeatureAccess`/`checkLimit`/`requireFeature`,
 * que liam `PLANS`/`PlanFeatures`/`PlanFeatureLimits` de `plans.ts`. A ESCADA ASTRUM
 * (2026-07-13) reescreveu `plans.ts` — removeu `PLANS` e passou a gatilhar acesso
 * por MÓDULO (`ASTRUM_LADDER`/`modulesForTier` + `enabled_modules`/`useEnabledModules`).
 * Aquelas 3 funções ficaram importando exports inexistentes (crashavam ao rodar) e
 * modelavam um esquema já substituído; foram REMOVIDAS. O gating vivo hoje é por módulo.
 *
 * Sobra `getTenantPlanId` — utilitário de leitura+cache do `plan_id` do tenant.
 * Sem consumidor de produção hoje (o `tenantRateLimiter` que o usava foi removido —
 * AUTH-08); mantido como bloco reutilizável para lógica futura ciente de plano.
 */
export const getTenantPlanId = async (tenantId: string): Promise<string> => {
  const cacheKey = `tenant_plan:${tenantId}`;
  let planId = await redis.get(cacheKey);

  if (!planId) {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (tenantDoc.exists) {
      planId = tenantDoc.data()?.plan_id || 'FREE';
    } else {
      planId = 'FREE';
    }
    // 10 minutes cache
    await redis.setex(cacheKey, 600, planId);
  }

  return planId;
}
