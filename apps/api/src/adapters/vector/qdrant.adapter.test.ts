import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantCollection, getCollectionStats } from './qdrant.adapter';

const mockGetCollection = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    getCollection = mockGetCollection;
    createCollection = vi.fn();
    createPayloadIndex = vi.fn();
    upsert = vi.fn();
    search = vi.fn();
    delete = vi.fn();
  }
}));

describe('Qdrant Adapter', () => {
  beforeEach(() => {
    mockGetCollection.mockReset();
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
});
