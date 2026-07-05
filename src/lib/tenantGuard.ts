import { adminDb } from './firebaseAdmin.ts';
import { logSecurityEvent } from './audit.ts';

/**
 * FZ-4: guard de isolamento multi-tenant sobre o db-compat (Supabase).
 * Usado pelo backend (gemini.server) via import dinâmico.
 */
export async function assertTenantOwnership(
  collectionName: string,
  docId: string,
  expectedTenantId: string
): Promise<any> {
  const docSnap = await adminDb.collection(collectionName).doc(docId).get();
  if (!docSnap.exists) throw new Error('DOC_NOT_FOUND');
  const data = docSnap.data()!;
  const actualTenantId = data.tenant_id ?? data.tenantId;
  if (actualTenantId !== expectedTenantId) {
    await logSecurityEvent('TENANT_MISMATCH', { collectionName, docId, expectedTenantId, actualTenantId });
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

    // Fallback para formatos legados de filtro
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
