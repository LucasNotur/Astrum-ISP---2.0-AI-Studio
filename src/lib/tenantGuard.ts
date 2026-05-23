import { db } from './firebase.ts';
import { logSecurityEvent } from './audit.ts';
import { getDoc, doc, collection, query, where, QueryConstraint, Firestore, Query } from 'firebase/firestore';

export async function assertTenantOwnership(
  collectionName: string,
  docId: string,
  expectedTenantId: string
): Promise<any> {
  const docSnap = await getDoc(doc(db, collectionName, docId));
  if (!docSnap.exists()) throw new Error('DOC_NOT_FOUND');
  const data = docSnap.data()!;
  if (data.tenant_id !== expectedTenantId) {
    await logSecurityEvent('TENANT_MISMATCH', { collectionName, docId, expectedTenantId, actualTenantId: data.tenant_id });
    throw new Error('TENANT_MISMATCH');
  }
  return data;
}

export function assertTenantQuery(
  collectionName: string,
  filters: any[],
  tenantId: string
): void {
  const hasTenantFilter = filters.some((f: any) => {
    if (!f) return false;
    if (f.field === 'tenant_id' && f.value === tenantId) return true;
    
    // Fallback for Firebase modular where()
    try {
      if (f._field?.name === 'tenant_id' && f._value === tenantId) return true;
      if (f.operand?._name === 'tenant_id' && f.value === tenantId) return true;
    } catch (e) {
      // Ignorar erros de inspeção de objeto fechado
    }
    
    return false;
  });

  if (!hasTenantFilter) {
    throw new Error(`MISSING_TENANT_FILTER: Query on ${collectionName} rejected. Expected tenant_id === ${tenantId}.`);
  }
}

export function wrapFirestoreCollection(
  dbInstance: Firestore,
  collectionName: string,
  tenantId: string
): { query: (...queryConstraints: QueryConstraint[]) => Query, ref: any } {
  const collRef = collection(dbInstance, collectionName);
  
  return {
    ref: collRef,
    query: (...queryConstraints: QueryConstraint[]): Query => {
      // (1) Injeta automaticamente o filtro de tenant
      return query(collRef, where('tenant_id', '==', tenantId), ...queryConstraints);
    }
  };
}

