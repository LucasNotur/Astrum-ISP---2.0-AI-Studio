import OpenAI from "openai";
import { AIProvider, ProviderConfig, Message, ChatResult, EmbedResult } from "../types";

export class OpenAIAdapter implements AIProvider {
  name: 'openai' = 'openai';
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key', dangerouslyAllowBrowser: true });
  }

  async chat(messages: Message[], config: ProviderConfig, options?: { tools?: any[] }): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: config.model,
      messages: messages as any,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens,
      tools: options?.tools as any,
    });

    const choice = response.choices[0];
    const content = choice.message.content || '';
    const toolCalls = choice.message.tool_calls?.map((tc: any) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}')
    }));

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    return {
      content,
      toolCalls,
      provider: this.name,
      model: config.model,
      usage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        estimatedCostUsd: this.calculateCost(config.model, inputTokens, outputTokens)
      }
    };
  }

  async embed(texts: string[], config: ProviderConfig): Promise<EmbedResult> {
    const response = await this.client.embeddings.create({
      model: config.model || "text-embedding-3-small",
      input: texts,
    });

    const inputTokens = response.usage.prompt_tokens;
    
    return {
      vector: response.data[0].embedding,
      provider: this.name,
      model: config.model || "text-embedding-3-small",
      usage: {
        input: inputTokens,
        output: 0,
        total: inputTokens,
        estimatedCostUsd: this.calculateCost(config.model || "text-embedding-3-small", inputTokens, 0)
      }
    };
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Rough estimates
    if (model.includes('gpt-4o-mini')) return (inputTokens * 0.15 + outputTokens * 0.6) / 1000000;
    if (model.includes('gpt-4o')) return (inputTokens * 5 + outputTokens * 15) / 1000000;
    if (model.includes('embedding')) return (inputTokens * 0.02) / 1000000;
    return 0;
  }
}
