import { Request, Response, NextFunction } from 'express';
import { adminDb as db } from '../lib/firebaseAdmin.ts';
import { logAuditEvent, AuditEventType } from '../lib/audit.ts';

export const auditMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const method = req.method;
  
  if (!['PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  // Regex to match /api/customers/:id, /api/tickets/:id, /api/knowledge/articles/:id
  const match = req.path.match(/^\/api\/(customers|tickets|knowledge\/articles)\/([^/]+)/);
  if (!match) {
    return next();
  }

  const resourceType = match[1];
  const resourceId = match[2];

  let collectionName = '';
  if (resourceType === 'customers') collectionName = 'customers';
  else if (resourceType === 'tickets') collectionName = 'tickets';
  else if (resourceType === 'knowledge/articles') collectionName = 'knowledge_base';

  let oldData = null;
  const tenantId = req.body?.tenantId || req.query?.tenantId || 'default';

  try {
    if (collectionName && resourceId) {
       const docRef = db.collection(collectionName).doc(resourceId);
       const docSnap = await docRef.get();
       if (docSnap.exists) {
         oldData = docSnap.data();
       }
    }
  } catch (error) {
    console.error('[AuditMiddleware] Error fetching old data:', error);
  }

  // Override res.json to capture response finish
  const originalJson = res.json;
  
  res.json = function (body) {
    res.json = originalJson; // Restore
    const ret = res.json(body);
    
    // Determine event type
    let eventType: AuditEventType = 'DATA_MUTATION';
    if (method === 'DELETE') {
      eventType = 'DATA_DELETE';
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      logAuditEvent({
        event_type: eventType,
        tenant_id: tenantId,
        resource_id: resourceId,
        old_value: oldData,
        new_value: method === 'DELETE' ? null : req.body,
        ip_address: req.ip,
        user_id: (req.headers['x-user-id'] as string) || 'system'
      }).catch(err => console.error('[AuditMiddleware] Failed to log event:', err));
    }

    return ret;
  };
  
  // Also override res.send if they use that instead
  const originalSend = res.send;
  res.send = function (body) {
    res.send = originalSend; // Restore
    const ret = res.send(body);

    if (!res.locals.audited) {
      res.locals.audited = true;
      let eventType: AuditEventType = 'DATA_MUTATION';
      if (method === 'DELETE') {
        eventType = 'DATA_DELETE';
      }

      if (res.statusCode >= 200 && res.statusCode < 300) {
        logAuditEvent({
          event_type: eventType,
          tenant_id: tenantId,
          resource_id: resourceId,
          old_value: oldData,
          new_value: method === 'DELETE' ? null : req.body,
          ip_address: req.ip,
          user_id: (req.headers['x-user-id'] as string) || 'system'
        }).catch(err => console.error('[AuditMiddleware] Failed to log event:', err));
      }
    }
    
    return ret;
  };

  next();
};