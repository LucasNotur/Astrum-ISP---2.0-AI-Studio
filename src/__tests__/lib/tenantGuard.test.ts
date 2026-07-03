import { describe, it, expect, vi, beforeEach } from 'vitest';

// FZ-5: tenantGuard agora usa o db-compat (Supabase) via firebaseAdmin (seam)
const mockGet = vi.fn();
vi.mock('../../lib/firebaseAdmin.ts', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: mockGet })),
    })),
  },
}));
vi.mock('../../lib/audit.ts', () => ({ logSecurityEvent: vi.fn() }));

import { assertTenantOwnership, assertTenantQuery } from '../../lib/tenantGuard';
import { logSecurityEvent } from '../../lib/audit.ts';

// Filtro no formato legado esperado por assertTenantQuery
const where = (field: string, op: string, value: any) => ({ field, op, value });

describe('tenantGuard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('assertTenantOwnership', () => {
        it('1. assertTenantOwnership com tenant correto → deve retornar dados do doc sem erro', async () => {
            const mockData = { tenant_id: 'tenant-123', some: 'data' };
            mockGet.mockResolvedValueOnce({ exists: true, data: () => mockData });

            const result = await assertTenantOwnership('col', 'doc1', 'tenant-123');
            expect(result).toEqual(mockData);
        });

        it('2. assertTenantOwnership com tenant ERRADO → deve lançar Error(TENANT_MISMATCH) e chamar logSecurityEvent', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ tenant_id: 'other-tenant' }) });

            await expect(assertTenantOwnership('col', 'doc1', 'tenant-123')).rejects.toThrow('TENANT_MISMATCH');
            expect(logSecurityEvent).toHaveBeenCalledWith('TENANT_MISMATCH', {
                collectionName: 'col',
                docId: 'doc1',
                expectedTenantId: 'tenant-123',
                actualTenantId: 'other-tenant'
            });
        });

        it('3. assertTenantOwnership com doc inexistente → deve lançar Error(DOC_NOT_FOUND)', async () => {
            mockGet.mockResolvedValueOnce({ exists: false, data: () => undefined });

            await expect(assertTenantOwnership('col', 'doc1', 'tenant-123')).rejects.toThrow('DOC_NOT_FOUND');
        });

        it('4. aceita tenantId em camelCase (docs legados)', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ tenantId: 'tenant-123' }) });
            const result = await assertTenantOwnership('col', 'doc1', 'tenant-123');
            expect(result).toEqual({ tenantId: 'tenant-123' });
        });
    });

    describe('assertTenantQuery', () => {
        it('5. assertTenantQuery sem filtro tenant_id → deve lançar Error(MISSING_TENANT_FILTER)', () => {
            const badFilters = [where('status', '==', 'active')];
            expect(() => assertTenantQuery('tickets', badFilters, 'tenant-123')).toThrow(/MISSING_TENANT_FILTER/);
        });

        it('6. assertTenantQuery com filtro correto → deve executar sem erro', () => {
            const goodFilters = [where('status', '==', 'active'), where('tenant_id', '==', 'tenant-123')];
            expect(() => assertTenantQuery('tickets', goodFilters, 'tenant-123')).not.toThrow();
        });
    });
});
