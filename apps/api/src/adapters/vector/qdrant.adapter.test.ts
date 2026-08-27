import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantCollection, getCollectionStats, deleteCustomerPoints, ensureCollection, upsertPoints, type VectorPoint } from './qdrant.adapter';

const mockGetCollection = vi.fn();
const mockDelete = vi.fn();
const mockCreateCollection = vi.fn();
const mockCreatePayloadIndex = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    getCollection = mockGetCollection;
    createCollection = mockCreateCollection;
    createPayloadIndex = mockCreatePayloadIndex;
    upsert = mockUpsert;
    search = vi.fn();
    delete = mockDelete;
  }
}));

describe('Qdrant Adapter', () => {
  beforeEach(() => {
    mockGetCollection.mockReset();
    mockDelete.mockReset();
    mockCreateCollection.mockReset();
    mockCreatePayloadIndex.mockReset();
    mockUpsert.mockReset();
    mockDelete.mockResolvedValue({ status: 'ok' });
    mockGetCollection.mockResolvedValue({
      points_count: 42,
      vectors_count: 42,
      status: 'green',
    });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue({ operation_id: 1, status: 'completed' });
    mockUpsert.mockResolvedValue({ operation_id: 1, status: 'completed' });
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

  it('getTenantCollection sem provider mantém o nome SEM sufixo (regressão)', () => {
    expect(getTenantCollection('abc-123')).toBe('tenant_abc_123');
    expect(getTenantCollection('abc-123', 'openai')).toBe('tenant_abc_123');
  });

  it('getTenantCollection com provider google ganha sufixo _google', () => {
    expect(getTenantCollection('abc-123', 'google')).toBe('tenant_abc_123_google');
  });

  it('ensureCollection(tenantId, google, 768) cria a coleção sufixada com o vectorSize passado', async () => {
    mockGetCollection.mockRejectedValueOnce(new Error('not found'));

    await ensureCollection('abc-123', 'google', 768);

    expect(mockCreateCollection).toHaveBeenCalledTimes(1);
    const [collectionName, config] = mockCreateCollection.mock.calls[0]!;
    expect(collectionName).toBe('tenant_abc_123_google');
    expect((config as any).vectors).toEqual({ size: 768, distance: 'Cosine' });
    expect(mockCreatePayloadIndex).toHaveBeenCalledWith('tenant_abc_123_google', expect.anything());
  });

  it('upsertPoints(tenantId, points, google) insere na coleção sufixada', async () => {
    const points: VectorPoint[] = [{
      id: 'p1',
      vector: [0.1, 0.2],
      payload: {
        document_id: 'doc-1',
        tenant_id: 't1',
        filename: 'a.pdf',
        chunk_index: 0,
        chunk_text: 'texto',
        file_type: 'pdf',
        created_at: '2026-08-27T00:00:00.000Z',
        embedding_provider: 'google',
      },
    }];

    await upsertPoints('t1', points, 'google');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [collectionName] = mockUpsert.mock.calls[0]!;
    expect(collectionName).toBe('tenant_t1_google');
  });

  it('upsertPoints sem provider continua batendo na coleção sem sufixo (regressão)', async () => {
    const points: VectorPoint[] = [{
      id: 'p1',
      vector: [0.1, 0.2],
      payload: {
        document_id: 'doc-1',
        tenant_id: 't1',
        filename: 'a.pdf',
        chunk_index: 0,
        chunk_text: 'texto',
        file_type: 'pdf',
        created_at: '2026-08-27T00:00:00.000Z',
      },
    }];

    await upsertPoints('t1', points);

    const [collectionName] = mockUpsert.mock.calls[0]!;
    expect(collectionName).toBe('tenant_t1');
  });
});
