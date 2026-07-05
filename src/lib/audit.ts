import { adminDb as db } from './firebaseAdmin';
import { FieldValue, CompatTimestamp as Timestamp } from './db-compat';

export type AuditEventType = 
  | 'DATA_ACCESS' 
  | 'DATA_MUTATION' 
  | 'DATA_DELETE' 
  | 'TENANT_MISMATCH' 
  | 'AUTH_FAILURE' 
  | 'BILLING_EVENT' 
  | 'LGPD_FORGET_ME' 
  | 'LGPD_EXPORT' 
  | 'SECURITY_VIOLATION';

export interface AuditLogParams {
  event_type: AuditEventType;
  tenant_id: string;
  user_id?: string;
  ip_address?: string;
  resource_id?: string;
  old_value?: any;
  new_value?: any;
}

export const logAuditEvent = async (params: AuditLogParams) => {
  try {
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 365);

    await db.collection('audit_logs').add({
      ...params,
      timestamp: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expireAt)
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
};

// Legacy compatibility for existing calls
export interface DataAccessLogParams {
  sessionId?: string;
  tenantId: string;
  phoneNumber?: string;
  cpfHash?: string;
  toolName?: string;
  fieldsAccessed?: string[];
  operation?: 'read' | 'write' | 'delete';
  timestamp?: any;
}

export const logDataAccess = async (params: DataAccessLogParams) => {
  await logAuditEvent({
    event_type: 'DATA_ACCESS',
    tenant_id: params.tenantId,
    user_id: params.phoneNumber || params.sessionId,
    resource_id: params.cpfHash || params.toolName,
    new_value: { operation: params.operation, fields: params.fieldsAccessed }
  });
};

import * as crypto from 'crypto';

export const logSecurityEvent = async (event_type: AuditEventType | string, payload: any) => {
  const tId = payload?.tenant_id || payload?.tenantId;
  if (!tId) {
    throw new Error("ValidationError: tenant_id is required");
  }

  const baseLog: any = {
    event_type: event_type as AuditEventType,
    tenant_id: tId,
    timestamp: FieldValue.serverTimestamp(),
  };

  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + 365);
  baseLog.expires_at = Timestamp.fromDate(expireAt);

  if (event_type === 'DATA_ACCESS') {
    baseLog.user_id = payload.user_id;
    baseLog.resource_id = payload.resource_id;
  }

  if (event_type === 'DATA_MUTATION') {
    baseLog.old_value = payload.old_value;
    baseLog.new_value = payload.new_value;
  }

  if (event_type === 'LGPD_FORGET_ME') {
     if (payload.deleted_data) {
         baseLog.hash = crypto.createHash('sha256').update(JSON.stringify(payload.deleted_data)).digest('hex');
     }
  }

  if (event_type === 'TENANT_MISMATCH') {
     console.warn('ALERTA: TENANT_MISMATCH detectado e e-mail de segurança acionado.');
  }

  if (payload.user_id) baseLog.user_id = payload.user_id;
  if (payload.ip_address) baseLog.ip_address = payload.ip_address;
  if (payload.resource_id) baseLog.resource_id = payload.resource_id;

  await db.collection('audit_logs').add(baseLog);
};

export const auditMiddleware = (req: any, res: any, next: any) => {
  const oldSend = res.send;
  res.send = function (body: any) {
    if (this.statusCode >= 200 && this.statusCode < 300) {
        logSecurityEvent('DATA_MUTATION', {
            tenant_id: req.user?.tenantId || req.body?.tenant_id || 'unknown',
            user_id: req.user?.uid || 'unknown',
            ip_address: req.ip || 'unknown',
            resource_id: req.params?.id || 'unknown',
            new_value: req.body,
        }).catch(err => console.error(err));
    }
    return oldSend.call(this, body);
  };
  next();
};

