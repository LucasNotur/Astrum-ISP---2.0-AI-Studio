import { Request, Response, NextFunction } from "express";
import redis from "../lib/redis";
import { getTenantPlanId } from "../lib/featureFlags";

// FREE=100 req/min, PRO=500, BUSINESS=2000, ENTERPRISE=ilimitado
const PLAN_LIMITS: Record<string, number> = {
  FREE: 100,
  PRO: 500,
  BUSINESS: 2000,
  ENTERPRISE: Infinity,
};

export const tenantRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  let tenantId = (req as any).tenantId || req.headers["x-tenant-id"] || req.query.tenantId || req.body?.tenantId;
  
  if (!tenantId || tenantId === "default" || tenantId === "DEFAULT_TENANT") {
    return next();
  }

  try {
    const rawPlanId = await getTenantPlanId(tenantId as string);
    const planId = rawPlanId.toUpperCase();
    
    const limit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.FREE;

    if (limit === Infinity || limit === -1) {
      res.setHeader('X-RateLimit-Limit', 'unlimited');
      return next();
    }

    const key = `ratelimit:${tenantId}`;
    const windowMs = 60 * 1000;
    const now = Date.now();

    // 1. Remove older requests
    await redis.zremrangebyscore(key, "-inf", (now - windowMs).toString());
    
    // 2. Count current requests
    const count = await redis.zcard(key);

    if (count >= limit) {
      // Find oldest to calculate retry after
      const oldestRequests = await redis.zrangebyscore(key, (now - windowMs).toString(), '+inf');
      let retryAfterSeconds = 1;
      if (oldestRequests.length > 0) {
        const oldest = parseFloat(oldestRequests[0].split(':')[0]); 
        retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      }
      
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', 0);
      return res.status(429).json({ error: "Too Many Requests", retryAfter: retryAfterSeconds });
    }

    // 3. Add current request
    const member = `${now}:${Math.random().toString(36).substring(2)}`;
    await redis.zadd(key, now, member);
    await redis.expire(key, 60);

    // Set Headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit - count - 1);
    
    return next();

  } catch (err) {
    console.error("Rate limiter error:", err);
    return next();
  }
};
