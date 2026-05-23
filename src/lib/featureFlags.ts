import { Request, Response, NextFunction } from 'express';
import { adminDb as db, adminAuth as auth } from './firebaseAdmin.ts';
import redis from './redis.ts';
import { PLANS, PlanFeatures, PlanFeatureLimits } from './plans.ts';

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

export const checkFeatureAccess = async (tenantId: string, feature: keyof PlanFeatures): Promise<boolean> => {
  const planId = await getTenantPlanId(tenantId);
  const plan = PLANS[planId] || PLANS['FREE'];
  
  return !!plan.features[feature];
};

export const checkLimit = async (tenantId: string, limitType: keyof PlanFeatureLimits): Promise<number> => {
  const planId = await getTenantPlanId(tenantId);
  const plan = PLANS[planId] || PLANS['FREE'];
  
  return plan.limits[limitType];
};

export const requireFeature = (feature: keyof PlanFeatures) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let tenantId = req.query.tenantId as string || req.body?.tenantId as string || req.headers['x-tenant-id'] as string;
      
      if (!tenantId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split('Bearer ')[1];
          try {
            const decoded = await auth.verifyIdToken(token);
            tenantId = decoded.tenantId as string;
          } catch (e) {
            // Ignore parse errors here
          }
        }
      }

      if (!tenantId || tenantId === 'undefined') {
        tenantId = 'default';
      }

      const hasAccess = await checkFeatureAccess(tenantId, feature);
      
      if (!hasAccess) {
        return res.status(403).json({
          error: 'FEATURE_NOT_AVAILABLE',
          reason: feature,
          upgrade_url: '/billing'
        });
      }
      
      next();
    } catch (err) {
      console.error('Error in requireFeature middleware:', err);
      // Fallback
      next();
    }
  };
};
