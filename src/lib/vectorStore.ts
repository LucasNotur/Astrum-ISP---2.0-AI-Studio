import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    tenant_id: string;
    category: string;
    title: string;
    source?: string;
  };
}

export interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: VectorDocument['metadata'];
}

export interface VectorStore {
  upsert(doc: VectorDocument, tenantId?: string): Promise<void>;
  upsertBatch(docs: VectorDocument[], tenantId?: string): Promise<void>;
  search(embedding: number[], tenantId: string, limit?: number): Promise<VectorSearchResult[]>;
  delete(id: string, tenantId?: string): Promise<void>;
}

function getQdrantClient(config: any) {
  if (!config.url) throw new Error("Vector Store URL not configured");
  return new QdrantClient({
    url: config.url,
    apiKey: config.apiKey ?? undefined,
  });
}

function createStoreFromConfig(config: any): VectorStore {
  return {
    upsert: async (doc: VectorDocument, tenantId?: string) => {
      const client = getQdrantClient(config);
      await client.upsert(config.collection, {
        points: [{
          id: doc.id,
          vector: doc.embedding,
          payload: { text: doc.text, ...doc.metadata }
        }]
      });
    },
    upsertBatch: async (docs: VectorDocument[], tenantId?: string) => {
      if (docs.length === 0) return;
      const client = getQdrantClient(config);
      await client.upsert(config.collection, {
        points: docs.map(doc => ({
          id: doc.id,
          vector: doc.embedding,
          payload: { text: doc.text, ...doc.metadata }
        }))
      });
    },
    search: async (embedding: number[], tenantId: string, limit = 3) => {
      const client = getQdrantClient(config);
      const res = await client.search(config.collection, {
        vector: embedding,
        limit,
        with_payload: true,
        filter: {
          must: [{ key: 'tenant_id', match: { value: tenantId } }]
        }
      });
      return res.map((r: any) => ({
        id: String(r.id),
        text: r.payload?.text as string,
        score: r.score,
        metadata: r.payload as VectorDocument['metadata']
      }));
    },
    delete: async (id: string, tenantId?: string) => {
      const client = getQdrantClient(config);
      await client.delete(config.collection, {
        wait: true,
        points: [id]
      });
    }
  };
}

function createStoreFromEnv(): VectorStore {
  const config = {
    provider: process.env.VECTOR_STORE_PROVIDER ?? 'qdrant',
    url: process.env.VECTOR_STORE_URL,
    apiKey: process.env.VECTOR_STORE_API_KEY,
    collection: process.env.VECTOR_STORE_COLLECTION ?? 'astrum_knowledge'
  };
  return createStoreFromConfig(config);
}

export async function getVectorStore(tenantId?: string): Promise<VectorStore> {
  if (tenantId && tenantId !== 'default') {
    const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
    if (tenantDoc.exists()) {
      const config = tenantDoc.data()?.vector_store_config;
      if (config?.url) {
        return createStoreFromConfig({
          provider: config.provider || 'qdrant',
          url: config.url,
          apiKey: config.apiKey,
          collection: config.collection || 'astrum_knowledge'
        });
      }
    }
  }
  return createStoreFromEnv();
}

// Deprecated directly exported store
export const vectorStore: Promise<VectorStore> = Promise.resolve(createStoreFromEnv());
