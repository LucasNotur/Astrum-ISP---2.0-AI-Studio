import { Request, Response, NextFunction } from 'express';
import { adminDb as db } from '../lib/firebaseAdmin.ts';
import { verifySupabaseToken } from '../lib/authVerify.ts';
import redis from '../lib/redis.ts';

export const tenantStatusMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const path = req.path;
  
  // Apply only to API routes
  if (!path.startsWith('/api/')) return next();
  
  // Exclude webhooks and health
  if (
    path.startsWith('/api/billing/webhook') || 
    path.startsWith('/api/webhook') || 
    path.startsWith('/api/health') ||
    path.startsWith('/api/super-admin')
  ) {
    return next();
  }

  try {
    let tenantId = req.query.tenantId as string || req.body?.tenantId as string || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      // Try from authorization header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split('Bearer ')[1];
        try {
          const decoded = await verifySupabaseToken(token);
          tenantId = decoded.tenantId;
        } catch (e) {
          // Ignore parse errors here
        }
      }
    }

    // Usually app will fallback to 'default' if not defined, but here we can just skip if we don't have it.
    if (!tenantId || tenantId === 'undefined') {
        return next();
    }

    const cacheKey = `tenant_status:${tenantId}`;
    let statusInfoStr = await redis.get(cacheKey);
    let statusInfo;

    if (statusInfoStr) {
      statusInfo = JSON.parse(statusInfoStr);
    } else {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        const data = tenantDoc.data();
        statusInfo = { 
          status: data?.status || 'active', 
          suspended_reason: data?.suspended_reason || 'billing_overdue' 
        };
      } else {
        statusInfo = { status: 'active', suspended_reason: null };
      }
      
      // Cache for 5 minutes
      await redis.set(cacheKey, JSON.stringify(statusInfo), 'EX', 300);
    }

    if (statusInfo.status === 'suspended') {
      return res.status(402).json({
        error: 'TENANT_SUSPENDED',
        reason: statusInfo.suspended_reason || 'billing_overdue'
      });
    }

    next();
  } catch (err) {
    console.error('Error in tenantStatusMiddleware:', err);
    next();
  }
};
