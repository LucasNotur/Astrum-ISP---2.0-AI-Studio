import { AIProviderService } from "./ai-provider.service";
import { AIFunction, ProviderConfig } from "./types";
import { db } from "../lib/firebase";
import { collection, doc, getDoc, addDoc } from "firebase/firestore";

const DEFAULT_CONFIGS: Record<AIFunction, ProviderConfig> = {
  orchestrator: { provider: 'openai', model: 'gpt-4o', fallbackProvider: 'gemini', fallbackModel: 'gemini-2.0-flash' },
  chat: { provider: 'openai', model: 'gpt-4o-mini', fallbackProvider: 'gemini', fallbackModel: 'gemini-2.0-flash' },
  embed: { provider: 'openai', model: 'text-embedding-3-small' },
  summary: { provider: 'openai', model: 'gpt-4o-mini', fallbackProvider: 'gemini', fallbackModel: 'gemini-2.0-flash' },
  fallback: { provider: 'gemini', model: 'gemini-2.0-flash' }
};

export const aiProvider = new AIProviderService(
  async (tenantId: string, aiFunction: AIFunction): Promise<ProviderConfig> => {
    try {
      const docRef = doc(db, 'ai_provider_configs', `${tenantId}_${aiFunction}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          provider: data.provider || DEFAULT_CONFIGS[aiFunction].provider,
          model: data.model || DEFAULT_CONFIGS[aiFunction].model,
          fallbackProvider: data.fallback_provider || DEFAULT_CONFIGS[aiFunction].fallbackProvider,
          fallbackModel: data.fallback_model || DEFAULT_CONFIGS[aiFunction].fallbackModel,
          temperature: data.temperature,
          maxTokens: data.max_tokens
        } as ProviderConfig;
      }
    } catch (e) {
      console.error("[AIProvider] Error reading config from Firestore, using default", e);
    }
    return DEFAULT_CONFIGS[aiFunction];
  },
  async (log: any) => {
    try {
      await addDoc(collection(db, 'ai_token_logs'), log);
    } catch (e) {
      console.error("[AIProvider] Error logging tokens to Firestore", e);
    }
  }
);
