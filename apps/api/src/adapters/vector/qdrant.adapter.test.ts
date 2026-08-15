import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantCollection, getCollectionStats, deleteCustomerPoints } from './qdrant.adapter';

const mockGetCollection = vi.fn();
const mockDelete = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    getCollection = mockGetCollection;
    createCollection = vi.fn();
    createPayloadIndex = vi.fn();
    upsert = vi.fn();
    search = vi.fn();
    delete = mockDelete;
  }
}));

describe('Qdrant Adapter', () => {
  beforeEach(() => {
    mockGetCollection.mockReset();
    mockDelete.mockReset();
    mockDelete.mockResolvedValue({ status: 'ok' });
    mockGetCollection.mockResolvedValue({
      points_count: 42,
      vectors_count: 42,
      status: 'green',
    });
  });

  it('getTenantCollection gera nome correto sem hífens', () => {
    const name = getTenantCollection('abc-123-def');
    expect(name).toBe('tenant_abc_123_def');
    expect(name).not.toContain('-');
  });

  it('coleções de tenants diferentes têm nomes diferentes', () => {
    expect(getTenantCollection('tenant-a')).not.toBe(getTenantCollection('tenant-b'));
  });

  it('getCollectionStats retorna dados da coleção', async () => {
    const stats = await getCollectionStats('tenant-test');
    expect(stats.exists).toBe(true);
    expect(stats.pointsCount).toBe(42);
  });

  it('getCollectionStats retorna exists=false quando coleção não existe', async () => {
    mockGetCollection.mockRejectedValueOnce(new Error('Not found'));
    const stats = await getCollectionStats('tenant-inexistente');
    expect(stats.exists).toBe(false);
  });

  it('deleteCustomerPoints (LGPD) filtra por customer_id na coleção do tenant', async () => {
    await deleteCustomerPoints('tenant-a', 'cust-42');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    const [collection, body] = mockDelete.mock.calls[0]!;
    // Escopo de tenant: só a coleção do tenant é tocada.
    expect(collection).toBe(getTenantCollection('tenant-a'));
    // Filtro por cliente: NÃO apaga a base de conhecimento do provedor.
    expect(body.filter).toEqual({
      must: [{ key: 'customer_id', match: { value: 'cust-42' } }],
    });
    expect(body.wait).toBe(true);
  });

  it('deleteCustomerPoints propaga erro do Qdrant (best-effort fica a cargo do chamador)', async () => {
    mockDelete.mockRejectedValueOnce(new Error('qdrant down'));
    await expect(deleteCustomerPoints('tenant-a', 'cust-42')).rejects.toThrow('qdrant down');
  });
});
