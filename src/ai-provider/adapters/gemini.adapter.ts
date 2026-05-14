import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider, ProviderConfig, Message, ChatResult, EmbedResult } from "../types";

export class GeminiAdapter implements AIProvider {
  name: 'gemini' = 'gemini';
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
  }

  async chat(messages: Message[], config: ProviderConfig, options?: { tools?: any[] }): Promise<ChatResult> {
    const modelParams: any = { model: config.model || "gemini-2.0-flash" };
    if (options?.tools) {
      modelParams.tools = options.tools;
    }
    const model = this.client.getGenerativeModel(modelParams);

    // Filter out system prompts for strict google gen AI logic or convert them
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const history = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      
    if (systemInstruction) {
        modelParams.systemInstruction = systemInstruction;
    }

    const genModel = this.client.getGenerativeModel(modelParams);

    // Reconstruct parts for gemini input
    const latestMessage = history.pop()?.parts[0].text || "";
    
    const chatSession = genModel.startChat({
        history: history as any,
    });

    const result = await chatSession.sendMessage(latestMessage);
    const response = result.response;

    const content = response.text();
    let toolCalls = undefined;

    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      toolCalls = functionCalls.map(fc => ({
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
    const model = this.client.getGenerativeModel({ model: config.model || "text-embedding-004" });
    const result = await model.embedContent(texts[0]); // Simple single embedding
    const vector = result.embedding.values;

    // We hardcode token estimation since it's not provided usually for embed
    const estimatedTokens = texts[0].length / 4;

    return {
      vector,
      provider: this.name,
      model: config.model || "text-embedding-004",
      usage: {
        input: estimatedTokens,
        output: 0,
        total: estimatedTokens,
        estimatedCostUsd: this.calculateCost(config.model, estimatedTokens, 0)
      }
    };
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    return (inputTokens * 0.075 + outputTokens * 0.3) / 1000000;
  }
}
