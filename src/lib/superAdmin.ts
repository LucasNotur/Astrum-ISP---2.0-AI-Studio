import { adminDb as db } from './firebaseAdmin.ts';
import { FieldValue } from './db-compat/index.ts';

export interface SuperAdmin {
  uid: string;
  email: string;
  name: string;
  created_at?: any;
}

export interface TenantUpdateFields {
  plan?: 'free' | 'pro' | 'enterprise';
  status?: 'active' | 'suspended' | 'cancelled';
  billing_status?: 'paid' | 'overdue' | 'trial';
  trial_ends_at?: any;
  mrr_value?: number;
  monthly_message_count?: number;
  [key: string]: any;
}

export const getSuperAdmins = async () => {
  const snapshot = await db.collection('super_admins').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getSuperAdmin = async (uid: string) => {
  const doc = await db.collection('super_admins').doc(uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

export const createSuperAdmin = async (data: SuperAdmin) => {
  const { uid, ...rest } = data;
  await db.collection('super_admins').doc(uid).set({
    ...rest,
    uid,
    created_at: FieldValue.serverTimestamp()
  });
  return uid;
};

export const updateSuperAdmin = async (uid: string, data: Partial<SuperAdmin>) => {
  await db.collection('super_admins').doc(uid).update(data);
};

export const deleteSuperAdmin = async (uid: string) => {
  await db.collection('super_admins').doc(uid).delete();
};

export const getTenants = async () => {
  const snapshot = await db.collection('tenants').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateTenantBillingMetadata = async (tenantId: string, data: TenantUpdateFields) => {
  await db.collection('tenants').doc(tenantId).set(data, { merge: true });
};
