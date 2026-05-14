import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { aiProvider } from '../ai-provider/ai-provider.setup';
import OpenAI from 'openai';

export interface EmbeddingProvider {
  embed(text: string, tenantId?: string): Promise<number[]>;
  embedBatch(texts: string[], tenantId?: string): Promise<number[][]>;
}

function createProviderFromConfig(config: any): EmbeddingProvider {
  const client = new OpenAI({ apiKey: config.api_key, dangerouslyAllowBrowser: true });
  return {
    embed: async (text: string) => {
      const response = await client.embeddings.create({
        input: text,
        model: config.model || 'text-embedding-ada-002'
      });
      return response.data[0].embedding;
    },
    embedBatch: async (texts: string[]) => {
      if (texts.length === 0) return [];
      const response = await client.embeddings.create({
        input: texts,
        model: config.model || 'text-embedding-ada-002'
      });
      return response.data.map(d => d.embedding);
    }
  };
}

function createProviderFromEnv(): EmbeddingProvider {
  return {
    embed: async (text: string, tenantId: string = 'default') => {
      const result = await aiProvider.embed('embed', [text], tenantId);
      return result.vector;
    },
    embedBatch: async (texts: string[], tenantId: string = 'default') => {
      if (texts.length === 0) return [];
      const result = await aiProvider.embed('embed', texts, tenantId);
      // Depending on aiProvider implementation, it might just return one vector or array. 
      // Current AIProvider embed returns { vector } only. So we map.
      return Promise.all(texts.map(async text => {
        const res = await aiProvider.embed('embed', [text], tenantId);
        return res.vector;
      }));
    }
  };
}

export async function getEmbeddingProvider(tenantId?: string): Promise<EmbeddingProvider> {
  if (tenantId && tenantId !== 'default') {
    const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
    if (tenantDoc.exists()) {
      const config = tenantDoc.data()?.embedding_config;
      if (config?.api_key) {
        return createProviderFromConfig(config);
      }
    }
  }
  return createProviderFromEnv();
}

// Deprecated: existing direct Promise resolution for compatibility
export const embeddingProvider: Promise<EmbeddingProvider> = Promise.resolve(createProviderFromEnv());
