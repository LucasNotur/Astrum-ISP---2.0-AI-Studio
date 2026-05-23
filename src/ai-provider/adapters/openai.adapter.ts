import OpenAI from "openai";
import { AIProvider, ProviderConfig, Message, ChatResult, EmbedResult } from "../types";
import { getOpenAIKey } from "../../lib/dbAdmin";

export class OpenAIAdapter implements AIProvider {
  name: 'openai' = 'openai';
  private clients: Map<string, OpenAI> = new Map();

  constructor() {}

  private async getClient(tenantId: string): Promise<OpenAI> {
    const key = await getOpenAIKey(tenantId);
    if (this.clients.has(key)) return this.clients.get(key)!;
    
    const client = new OpenAI({ 
      apiKey: key,
      dangerouslyAllowBrowser: true 
    });
    this.clients.set(key, client);
    return client;
  }

  async chat(messages: Message[], config: ProviderConfig, tenantId: string, options?: { tools?: any[], temperature?: number }): Promise<ChatResult> {
    const client = await this.getClient(tenantId);
    const openaiMessages = messages.map(m => {
       if (m.parts && m.parts.length > 0) {
          const content = m.parts.map((p: any) => {
             if (p.inlineData) {
                return { type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` }};
             }
             return { type: "text", text: p.text };
          });
          return { role: m.role, content };
       }
       return { role: m.role, content: m.content };
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: openaiMessages as any,
      temperature: options?.temperature ?? config.temperature ?? 0.7,
      max_tokens: config.maxTokens,
      tools: options?.tools as any,
    });

    const choice = response.choices[0];
    const content = choice.message.content || '';
    const toolCalls = choice.message.tool_calls?.map((tc: any) => ({
      id: tc.id,
      type: tc.type || 'function',
      function: tc.function,
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

  async embed(texts: string[], config: ProviderConfig, tenantId: string): Promise<EmbedResult> {
    const client = await this.getClient(tenantId);
    const response = await client.embeddings.create({
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
