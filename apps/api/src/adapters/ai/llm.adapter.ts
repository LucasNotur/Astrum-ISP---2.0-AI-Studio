import { callOpenAI, getOpenAICircuitStatus } from '../openai/openai.adapter';
import { assertLlmBudget, recordLlmUsage } from '../../infrastructure/ai/llm-budget.service';

export type MessageRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: MessageRole;
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  systemPrompt?: string;
  tenantId: string;
  userId?: string;
  context?: 'support' | 'billing' | 'onboarding' | 'analysis';
  forceModel?: 'gpt-4o-mini' | 'gpt-4o';
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  fromFallback: boolean;
  routingDecision: 'gpt-4o-mini' | 'gpt-4o';
  latencyMs: number;
}

// Termos que indicam necessidade do modelo mais capaz
const COMPLEX_KEYWORDS = [
  'diagnóstico', 'técnico', 'olt', 'fibra', 'splitter', 'onu', 'ont',
  'contrato', 'cancelar', 'rescisão', 'churn', 'inadimplente',
  'analisar', 'relatório', 'configurar', 'problema',
];

export function classifyMessageComplexity(
  messages: LLMMessage[],
  context?: LLMRequest['context']
): 'gpt-4o-mini' | 'gpt-4o' {
  if (context === 'analysis') return 'gpt-4o';

  const lastUserMessage = [...messages]
    .reverse()
    .find(m => m.role === 'user')?.content ?? '';

  const isComplex = COMPLEX_KEYWORDS.some(k =>
    lastUserMessage.toLowerCase().includes(k)
  );
  const isLong = lastUserMessage.length > 200;

  return isComplex || isLong ? 'gpt-4o' : 'gpt-4o-mini';
}

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();

  // COST-01: bloqueia se o tenant já estourou o teto mensal (no-op se desabilitado).
  await assertLlmBudget(request.tenantId);

  const model = request.forceModel ?? classifyMessageComplexity(request.messages, request.context);

  const messages: LLMMessage[] = request.systemPrompt
    ? [{ role: 'system', content: request.systemPrompt }, ...request.messages]
    : request.messages;

  const response = await callOpenAI({
    model,
    messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 1000,
    tenantId: request.tenantId,
    userId: request.userId,
  });

  // COST-01: contabiliza o uso real retornado pelo provider.
  await recordLlmUsage(request.tenantId, response.usage.total_tokens);

  return {
    content: response.content,
    model: response.model,
    tokensUsed: response.usage.total_tokens,
    fromFallback: response.fromFallback ?? false,
    routingDecision: model,
    latencyMs: Date.now() - startTime,
  };
}

export function getLLMStatus() {
  return { openai: getOpenAICircuitStatus(), router: 'active' };
}
