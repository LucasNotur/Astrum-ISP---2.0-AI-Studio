import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertTenantOwnership, assertTenantQuery, wrapFirestoreCollection } from '../../lib/tenantGuard';
import { getDoc, query, where } from 'firebase/firestore';
import { logSecurityEvent } from '../../lib/audit.ts';

vi.mock('../../lib/firebase.ts', () => ({ db: {} }));
vi.mock('../../lib/audit.ts', () => ({ logSecurityEvent: vi.fn() }));

vi.mock('firebase/firestore', () => {
    return {
        getDoc: vi.fn(),
        doc: vi.fn((db, coll, id) => ({ isDoc: true, path: `${coll}/${id}` })),
        collection: vi.fn((db, coll) => ({ isColl: true, coll })),
        query: vi.fn((ref, ...args) => ({ isQuery: true, ref, filters: args })),
        where: vi.fn((field, op, value) => ({ field, op, value, _field: { name: field }, _value: value })),
    };
});

describe('tenantGuard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('assertTenantOwnership', () => {
        it('1. assertTenantOwnership com tenant correto → deve retornar dados do doc sem erro', async () => {
            const mockData = { tenant_id: 'tenant-123', some: 'data' };
            (getDoc as any).mockResolvedValueOnce({
                exists: () => true,
                data: () => mockData
            });

            const result = await assertTenantOwnership('col', 'doc1', 'tenant-123');
            expect(result).toEqual(mockData);
        });

        it('2. assertTenantOwnership com tenant ERRADO → deve lançar Error(TENANT_MISMATCH) e chamar logSecurityEvent', async () => {
            (getDoc as any).mockResolvedValueOnce({
                exists: () => true,
                data: () => ({ tenant_id: 'other-tenant' })
            });

            await expect(assertTenantOwnership('col', 'doc1', 'tenant-123')).rejects.toThrow('TENANT_MISMATCH');
            expect(logSecurityEvent).toHaveBeenCalledWith('TENANT_MISMATCH', {
                collectionName: 'col',
                docId: 'doc1',
                expectedTenantId: 'tenant-123',
                actualTenantId: 'other-tenant'
            });
        });

        it('3. assertTenantOwnership com doc inexistente → deve lançar Error(DOC_NOT_FOUND)', async () => {
            (getDoc as any).mockResolvedValueOnce({
                exists: () => false
            });

            await expect(assertTenantOwnership('col', 'doc1', 'tenant-123')).rejects.toThrow('DOC_NOT_FOUND');
        });
    });

    describe('assertTenantQuery', () => {
        it('4. assertTenantQuery sem filtro tenant_id → deve lançar Error(MISSING_TENANT_FILTER)', () => {
            const badFilters = [where('status', '==', 'active')];
            expect(() => assertTenantQuery('tickets', badFilters, 'tenant-123')).toThrow(/MISSING_TENANT_FILTER/);
        });

        it('5. assertTenantQuery com filtro correto → deve executar sem erro', () => {
            const goodFilters = [where('status', '==', 'active'), where('tenant_id', '==', 'tenant-123')];
            expect(() => assertTenantQuery('tickets', goodFilters, 'tenant-123')).not.toThrow();
        });
    });

    describe('wrapFirestoreCollection', () => {
        it('6. wrapFirestoreCollection: query sem tenantId no wrapper → deve injetar automaticamente o filtro', () => {
            const wrapper = wrapFirestoreCollection({} as any, 'tickets', 'tenant-XYZ');
            
            wrapper.query();
            
            expect(query).toHaveBeenCalledWith(
              expect.anything(),
              expect.objectContaining({ field: 'tenant_id', value: 'tenant-XYZ', op: '==' })
            );
        });

        it('7. Dois tenants diferentes consultando mesma collection → nunca retornar dados do outro tenant', () => {
            const wrapper1 = wrapFirestoreCollection({} as any, 'tickets', 'tenant-A');
            const wrapper2 = wrapFirestoreCollection({} as any, 'tickets', 'tenant-B');
            
            wrapper1.query(where('status', '==', 'open'));
            expect(query).toHaveBeenCalledWith(
              expect.anything(),
              expect.objectContaining({ field: 'tenant_id', value: 'tenant-A', op: '==' }),
              expect.objectContaining({ field: 'status', value: 'open', op: '==' })
            );

            (query as any).mockClear();

            wrapper2.query(where('status', '==', 'open'));
            expect(query).toHaveBeenCalledWith(
              expect.anything(),
              expect.objectContaining({ field: 'tenant_id', value: 'tenant-B', op: '==' }),
              expect.objectContaining({ field: 'status', value: 'open', op: '==' })
            );
        });
    });
});
