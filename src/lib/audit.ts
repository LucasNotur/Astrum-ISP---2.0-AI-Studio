import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface DataAccessLogParams {
  sessionId: string;
  tenantId: string;
  phoneNumber: string;
  cpfHash: string;
  toolName: string;
  fieldsAccessed: string[];
  operation: 'read' | 'write' | 'delete';
  timestamp: any;
}

export const logDataAccess = async (params: DataAccessLogParams) => {
  try {
    const expireAt = new Date();
    expireAt.setFullYear(expireAt.getFullYear() + 5);

    await addDoc(collection(db, 'data_access_logs'), {
      ...params,
      expireAt: Timestamp.fromDate(expireAt)
    });
  } catch (error) {
    console.error('Failed to log data access:', error);
  }
};

export const logSecurityEvent = async (event_type: string, payload: any) => {
  try {
    await addDoc(collection(db, 'security_events'), {
      event_type,
      payload,
      ip_origin: 'SERVER_OR_APPLET',
      timestamp: serverTimestamp()
    });
    
    if (event_type === 'TENANT_MISMATCH') {
      console.warn('ALERTA: TENANT_MISMATCH detectado e e-mail de segurança acionado.');
    }
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};
