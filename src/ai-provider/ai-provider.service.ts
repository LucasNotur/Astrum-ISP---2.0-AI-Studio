import { 
  AIProvider, AIFunction, ProviderConfig, Message, ChatResult, EmbedResult, ProviderName 
} from "./types";
import { OpenAIAdapter } from "./adapters/openai.adapter";
import { GeminiAdapter } from "./adapters/gemini.adapter";
import { AnthropicAdapter } from "./adapters/anthropic.adapter";

export class AIProviderService {
  private adapters: Record<ProviderName, AIProvider>;
  
  constructor(
    private getConfig: (tenantId: string, aiFunction: AIFunction) => Promise<ProviderConfig>,
    private onTokenLog: (log: any) => Promise<void>
  ) {
    this.adapters = {
      openai: new OpenAIAdapter(),
      gemini: new GeminiAdapter(),
      anthropic: new AnthropicAdapter()
    };
  }

  async chat(aiFunction: AIFunction, messages: Message[], tenantId: string, options?: { tools?: any[] }): Promise<ChatResult> {
    const config = await this.getConfig(tenantId, aiFunction);
    let adapter = this.adapters[config.provider];
    
    try {
      if (!adapter) throw new Error(`Provider ${config.provider} not initialized`);
      const result = await adapter.chat(messages, config, tenantId, options);
      
      await this.onTokenLog({
        tenantId, aiFunction, provider: result.provider, model: result.model,
        inputTokens: result.usage.input, outputTokens: result.usage.output,
        estimatedCostUsd: result.usage.estimatedCostUsd, usedFallback: false,
        createdAt: new Date()
      });
      return result;
    } catch (e: any) {
      if (config.fallbackProvider && this.adapters[config.fallbackProvider]) {
         console.warn(`[AIProvider] ${config.provider} failed for ${aiFunction}. Using fallback ${config.fallbackProvider}. Error: ${e.message}`);
         const fallbackAdapter = this.adapters[config.fallbackProvider];
         const fallbackConfig = { ...config, provider: config.fallbackProvider, model: config.fallbackModel || config.model };
         const result = await fallbackAdapter.chat(messages, fallbackConfig, tenantId, options);
         
         await this.onTokenLog({
           tenantId, aiFunction, provider: result.provider, model: result.model,
           inputTokens: result.usage.input, outputTokens: result.usage.output,
           estimatedCostUsd: result.usage.estimatedCostUsd, usedFallback: true,
           createdAt: new Date()
         });
         return result;
      }
      throw e;
    }
  }

  async embed(aiFunction: AIFunction, texts: string[], tenantId: string): Promise<EmbedResult> {
    const config = await this.getConfig(tenantId, aiFunction);
    const adapter = this.adapters[config.provider];
    
    try {
      if (!adapter) throw new Error(`Provider ${config.provider} not initialized`);
      const result = await adapter.embed(texts, config, tenantId);
      
      await this.onTokenLog({
        tenantId, aiFunction, provider: result.provider, model: result.model,
        inputTokens: result.usage.input, outputTokens: result.usage.output,
        estimatedCostUsd: result.usage.estimatedCostUsd, usedFallback: false,
        createdAt: new Date()
      });
      return result;
    } catch (e: any) {
      if (config.fallbackProvider && this.adapters[config.fallbackProvider]) {
         console.warn(`[AIProvider] ${config.provider} failed for embed ${aiFunction}. Using fallback ${config.fallbackProvider}.`);
         const fallbackAdapter = this.adapters[config.fallbackProvider];
         const fallbackConfig = { ...config, provider: config.fallbackProvider, model: config.fallbackModel || config.model };
         const result = await fallbackAdapter.embed(texts, fallbackConfig, tenantId);
         
         await this.onTokenLog({
           tenantId, aiFunction, provider: result.provider, model: result.model,
           inputTokens: result.usage.input, outputTokens: result.usage.output,
           estimatedCostUsd: result.usage.estimatedCostUsd, usedFallback: true,
           createdAt: new Date()
         });
         return result;
      }
      throw e;
    }
  }
}
