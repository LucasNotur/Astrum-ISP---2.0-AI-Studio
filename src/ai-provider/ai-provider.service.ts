import { 
  AIProvider, AIFunction, ProviderConfig, Message, ChatResult, EmbedResult, ProviderName 
} from "./types";
import { OpenAIAdapter } from "./adapters/openai.adapter";
import { GeminiAdapter } from "./adapters/gemini.adapter";
import { AnthropicAdapter } from "./adapters/anthropic.adapter";
import redis from "../lib/redis";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

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

  private calculateCost(provider: string, model: string, inputTokens: number, completionTokens: number): number {
    let cost = 0;
    if (provider === 'openai' || model.includes('gpt-4o')) {
      cost = (inputTokens / 1000) * 0.005 + (completionTokens / 1000) * 0.015; // Assumption for output cost
    } else if (provider === 'gemini' || model.includes('flash')) {
      cost = ((inputTokens + completionTokens) / 1000000) * 0.075;
    } else if (provider === 'anthropic' || model.includes('haiku')) {
      cost = ((inputTokens + completionTokens) / 1000000) * 0.25;
    }
    return cost;
  }

  private async interceptAndCalculateCost(tenantId: string, result: ChatResult | EmbedResult) {
    if (!result.usage) return;
    const input = result.usage.input || 0;
    const output = result.usage.output || 0;
    const cost = this.calculateCost(result.provider, result.model, input, output);
    result.usage.estimatedCostUsd = cost;

    if (cost > 0) {
      const yyyyMm = new Date().toISOString().slice(0, 7);
      try {
        await redis.incrbyfloat(`token_cost:${tenantId}:${yyyyMm}`, cost);
        await redis.incrby(`token_count:${tenantId}:${yyyyMm}`, input + output);
        await redis.hincrby(`token_provider:${tenantId}:${yyyyMm}`, result.provider, input + output);
      } catch (e) {
        console.error("Failed to accumulate token usage:", e);
      }
    }
  }

  async getCircuitState(provider: ProviderName): Promise<CircuitState> {
    const val = await redis.get(`llm_circuit:${provider}`);
    if (val === 'OPEN') return 'OPEN';

    const recent = await redis.get(`llm_circuit:recent_open:${provider}`);
    if (recent) return 'HALF_OPEN';

    return 'CLOSED';
  }

  async checkExtendedOutage(provider: ProviderName) {
    const firstOpenStr = await redis.get(`llm_circuit:first_open_time:${provider}`);
    if (firstOpenStr) {
      const firstOpen = parseInt(firstOpenStr, 10);
      const now = Date.now();
      if (now - firstOpen > 5 * 60 * 1000) {
        const alertSent = await redis.get(`llm_circuit:alert_sent:${provider}`);
        if (!alertSent) {
          try {
            const email = await import("../lib/email");
            await email.sendEmail(
              "noturcursos1@gmail.com", // Super-Admin
              "Alerta Crítico: Provedor LLM Fora do Ar", 
              `O provedor ${provider} está com o circuit breaker aberto (indisponível) há mais de 5 minutos.`
            );
            await redis.set(`llm_circuit:alert_sent:${provider}`, '1', 'EX', 3600); // 1 email per hour
          } catch (e) {
            console.error("Failed to send outage alert:", e);
          }
        }
      }
    } else {
      await redis.setnx(`llm_circuit:first_open_time:${provider}`, Date.now().toString());
    }
  }

  async recordFailure(provider: ProviderName) {
    const state = await this.getCircuitState(provider);
    if (state === 'OPEN') return;

    if (state === 'HALF_OPEN') {
      await redis.set(`llm_circuit:${provider}`, 'OPEN', 'EX', 60);
      await redis.set(`llm_circuit:recent_open:${provider}`, '1', 'EX', 120);
      await this.checkExtendedOutage(provider);
      return;
    }

    const failsKey = `llm_circuit:failures:${provider}`;
    const fails = await redis.incr(failsKey);
    if (fails === 1) {
      await redis.expire(failsKey, 60);
    }

    if (fails >= 3) {
      await redis.set(`llm_circuit:${provider}`, 'OPEN', 'EX', 60);
      await redis.set(`llm_circuit:recent_open:${provider}`, '1', 'EX', 120);
      await redis.del(failsKey);
      await redis.setnx(`llm_circuit:first_open_time:${provider}`, Date.now().toString());
    }
  }

  async recordSuccess(provider: ProviderName) {
    await redis.del(`llm_circuit:${provider}`);
    await redis.del(`llm_circuit:recent_open:${provider}`);
    await redis.del(`llm_circuit:failures:${provider}`);
    await redis.del(`llm_circuit:first_open_time:${provider}`);
    await redis.del(`llm_circuit:alert_sent:${provider}`);
  }

  async getAvailableProvider(tenantId: string, priorityList: ProviderName[]): Promise<ProviderName> {
    for (const provider of priorityList) {
      const state = await this.getCircuitState(provider);
      if (state === 'CLOSED' || state === 'HALF_OPEN') {
        return provider;
      }
    }
    // Fallback if all are open
    return priorityList[0];
  }

  async chat(aiFunction: AIFunction, messages: Message[], tenantId: string, options?: { tools?: any[], overrideProvider?: ProviderName, temperature?: number }): Promise<ChatResult> {
    const config = await this.getConfig(tenantId, aiFunction);
    
    // If overrideProvider is passed, we force it. Otherwise we just use the configured one.
    const priorityList: ProviderName[] = [config.provider];
    if (config.fallbackProvider && config.fallbackProvider !== config.provider) {
      priorityList.push(config.fallbackProvider);
    }
    if (!priorityList.includes('gemini')) priorityList.push('gemini');

    const targetProvider = options?.overrideProvider 
      ? options.overrideProvider 
      : await this.getAvailableProvider(tenantId, priorityList);
    
    const activeModel = targetProvider === config.provider ? config.model : (targetProvider === config.fallbackProvider ? config.fallbackModel : 'gemini-2.0-flash') || 'gemini-2.0-flash';
    const activeConfig: ProviderConfig = { ...config, provider: targetProvider, model: activeModel };
    
    let adapter = this.adapters[activeConfig.provider];
    
    try {
      if (!adapter) throw new Error(`Provider ${activeConfig.provider} not initialized`);
      const result = await adapter.chat(messages, activeConfig, tenantId, options);
      
      await this.recordSuccess(activeConfig.provider);
      await this.interceptAndCalculateCost(tenantId, result);

      await this.onTokenLog({
        tenantId, aiFunction, provider: result.provider, model: result.model,
        inputTokens: result.usage.input, outputTokens: result.usage.output,
        estimatedCostUsd: result.usage.estimatedCostUsd, usedFallback: activeConfig.provider !== config.provider,
        createdAt: new Date()
      });
      return result;
    } catch (e: any) {
      await this.recordFailure(activeConfig.provider);
      console.warn(`[AIProvider] ${activeConfig.provider} failed for ${aiFunction}. Error: ${e.message}`);
      throw e;
    }
  }

  async embed(aiFunction: AIFunction, texts: string[], tenantId: string, options?: { overrideProvider?: ProviderName }): Promise<EmbedResult> {
    const config = await this.getConfig(tenantId, aiFunction);
    
    // If overrideProvider is passed, we force it. Otherwise we just use the configured one.
    const priorityList: ProviderName[] = [config.provider];
    if (config.fallbackProvider && config.fallbackProvider !== config.provider) {
      priorityList.push(config.fallbackProvider);
    }
    if (!priorityList.includes('gemini')) priorityList.push('gemini');

    const targetProvider = options?.overrideProvider
      ? options.overrideProvider
      : await this.getAvailableProvider(tenantId, priorityList);
    
    const activeModel = targetProvider === config.provider ? config.model : (targetProvider === config.fallbackProvider ? config.fallbackModel : 'text-embedding-004') || 'text-embedding-004';
    const activeConfig: ProviderConfig = { ...config, provider: targetProvider, model: activeModel };
    
    const adapter = this.adapters[activeConfig.provider];
    
    try {
      if (!adapter) throw new Error(`Provider ${activeConfig.provider} not initialized`);
      const result = await adapter.embed(texts, activeConfig, tenantId);
      
      await this.recordSuccess(activeConfig.provider);
      await this.interceptAndCalculateCost(tenantId, result);

      await this.onTokenLog({
        tenantId, aiFunction, provider: result.provider, model: result.model,
        inputTokens: result.usage.input, outputTokens: result.usage.output,
        estimatedCostUsd: result.usage.estimatedCostUsd, usedFallback: activeConfig.provider !== config.provider,
        createdAt: new Date()
      });
      return result;
    } catch (e: any) {
      await this.recordFailure(activeConfig.provider);
      console.warn(`[AIProvider] ${activeConfig.provider} failed for embed ${aiFunction}. Error: ${e.message}`);
      throw e;
    }
  }
}
