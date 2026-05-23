import { adminDb as db } from './firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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

export const logSecurityEvent = async (event_type: string, payload: any) => {
  let type: AuditEventType = 'SECURITY_VIOLATION';
  if (event_type === 'TENANT_MISMATCH') type = 'TENANT_MISMATCH';
  
  await logAuditEvent({
    event_type: type,
    tenant_id: payload?.tenantId || payload?.tenant_id || 'UNKNOWN',
    user_id: payload?.remoteJid || payload?.user_id,
    ip_address: payload?.ip_origin || 'SERVER_OR_APPLET',
    new_value: payload
  });
  
  if (type === 'TENANT_MISMATCH') {
    console.warn('ALERTA: TENANT_MISMATCH detectado e e-mail de segurança acionado.');
  }
};

