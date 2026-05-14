import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, ProviderConfig, Message, ChatResult, EmbedResult } from "../types";

export class AnthropicAdapter implements AIProvider {
  name: 'anthropic' = 'anthropic';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key', dangerouslyAllowBrowser: true });
  }

  async chat(messages: Message[], config: ProviderConfig, options?: { tools?: any[] }): Promise<ChatResult> {
    const system = messages.find(m => m.role === 'system')?.content;
    const coreMessages = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
    })) as any;

    const response = await this.client.messages.create({
      model: config.model || "claude-3-haiku-20240307",
      max_tokens: config.maxTokens || 1024,
      temperature: config.temperature ?? 0.7,
      system,
      messages: coreMessages,
    });

    const contentBlock = response.content.find((c: any) => c.type === 'text') as any;
    const content = contentBlock ? contentBlock.text : '';

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    return {
      content,
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
    throw new Error('Anthropic does not natively support embeddings currently');
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    if (model.includes('haiku')) return (inputTokens * 0.25 + outputTokens * 1.25) / 1000000;
    if (model.includes('sonnet')) return (inputTokens * 3 + outputTokens * 15) / 1000000;
    return 0;
  }
}
