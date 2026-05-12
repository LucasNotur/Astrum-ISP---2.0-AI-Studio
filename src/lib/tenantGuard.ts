import { db } from './firebase';
import { logSecurityEvent } from './audit';
import { getDoc, doc } from 'firebase/firestore';

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
