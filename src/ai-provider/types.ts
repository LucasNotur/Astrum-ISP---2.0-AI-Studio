export type AIFunction = 'orchestrator' | 'chat' | 'embed' | 'summary' | 'fallback';
export type ProviderName = 'openai' | 'gemini' | 'anthropic';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  parts?: any[];
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  estimatedCostUsd: number;
}

export interface ChatResult {
  content: string;
  toolCalls?: any[];
  provider: ProviderName;
  model: string;
  usage: TokenUsage;
}

export interface EmbedResult {
  vector: number[];
  provider: ProviderName;
  model: string;
  usage: TokenUsage;
}

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  fallbackProvider?: ProviderName;
  fallbackModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TokenLog {
  tenantId: string;
  aiFunction: AIFunction;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  usedFallback: boolean;
  createdAt: Date;
}

export interface AIProvider {
  name: ProviderName;
  chat(messages: Message[], config: ProviderConfig, tenantId: string, options?: { tools?: any[], temperature?: number }): Promise<ChatResult>;
  embed(texts: string[], config: ProviderConfig, tenantId: string): Promise<EmbedResult>;
}
