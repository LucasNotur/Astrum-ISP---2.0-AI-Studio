import { GoogleGenAI } from "@google/genai";
import { AIProvider, ProviderConfig, Message, ChatResult, EmbedResult } from "../types";
import { getGeminiKey } from "../../lib/dbAdmin";

export class GeminiAdapter implements AIProvider {
  name: 'gemini' = 'gemini';
  private clients: Map<string, GoogleGenAI> = new Map();

  constructor() {}

  private async getClient(tenantId: string): Promise<GoogleGenAI> {
    const key = await getGeminiKey(tenantId);
    if (this.clients.has(key)) return this.clients.get(key)!;
    
    const client = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    this.clients.set(key, client);
    return client;
  }

  async chat(messages: Message[], config: ProviderConfig, tenantId: string, options?: { tools?: any[], temperature?: number }): Promise<ChatResult> {
    const client = await this.getClient(tenantId);
    const model = config.model || "gemini-3.1-flash-lite"; 

    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => {
         if (m.parts && m.parts.length > 0) {
           return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: m.parts 
           }
         }
         return {
           role: m.role === 'assistant' ? 'model' : 'user',
           parts: [{ text: m.content }]
         };
      });

    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        tools: options?.tools as any,
        systemInstruction,
        temperature: options?.temperature ?? config.temperature,
      }
    });

    const content = response.text;
    let toolCalls = undefined;

    if (response.functionCalls && response.functionCalls.length > 0) {
      toolCalls = response.functionCalls.map((fc: any) => ({
        name: fc.name,
        args: fc.args
      }));
    }

    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    return {
      content,
      toolCalls,
      provider: this.name,
      model,
      usage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
        estimatedCostUsd: this.calculateCost(model, inputTokens, outputTokens)
      }
    };
  }

  async embed(texts: string[], config: ProviderConfig, tenantId: string): Promise<EmbedResult> {
    const client = await this.getClient(tenantId);
    const model = config.model || "text-embedding-004";
    const response = await client.models.embedContent({
      model,
      contents: texts[0]
    });
    
    const vector = response.embeddings[0].values;
    const estimatedTokens = texts[0].length / 4;

    return {
      vector,
      provider: this.name,
      model,
      usage: {
        input: estimatedTokens,
        output: 0,
        total: estimatedTokens,
        estimatedCostUsd: this.calculateCost(model, estimatedTokens, 0)
      }
    };
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    return (inputTokens * 0.075 + outputTokens * 0.3) / 1000000;
  }
}
