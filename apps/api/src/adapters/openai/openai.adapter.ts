import CircuitBreaker from 'opossum';
import OpenAI from 'openai';
import { OPENAI_CIRCUIT_BREAKER_CONFIG } from './circuit-breaker.config';
import { iaLogger } from '../../infrastructure/logging/logger';

const isHeliconeEnabled = !!process.env.HELICONE_API_KEY;

/**
 * Resolve a API key da OpenAI com fail-fast em produção.
 * - produção sem chave → lança (não deixa subir cliente inútil que só falha em runtime)
 * - dev/test sem chave  → 'dummy_key' + warn (permite rodar local/CI sem segredo real)
 */
function resolveOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OPENAI_API_KEY ausente em produção — abortando criação do cliente OpenAI.');
  }
  iaLogger.warn('[OPENAI] OPENAI_API_KEY ausente — usando dummy_key (apenas dev/test).');
  return 'dummy_key';
}

/**
 * Cliente OpenAI roteado via Helicone quando API key disponível.
 * Em desenvolvimento sem HELICONE_API_KEY → chama OpenAI diretamente.
 * Em produção → sempre via Helicone para rastreamento de custos.
 */
export function createOpenAIClient(tenantId?: string, userId?: string) {
  const baseConfig = {
    apiKey: resolveOpenAIKey(),
    defaultHeaders: tenantId ? {
      'Helicone-Property-TenantId': tenantId,
      'Helicone-Property-UserId': userId ?? 'unknown',
      'Helicone-Property-Environment': process.env.NODE_ENV ?? 'development',
    } : undefined,
  };

  if (isHeliconeEnabled) {
    return new OpenAI({
      ...baseConfig,
      baseURL: 'https://oai.helicone.ai/v1',
      defaultHeaders: {
        ...baseConfig.defaultHeaders,
        'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
      },
    });
  }

  return new OpenAI(baseConfig);
}

// Cliente padrão (sem tenant — para operações internas)
const defaultOpenAI = createOpenAIClient();

export interface OpenAICallOptions {
  model: 'gpt-4o-mini' | 'gpt-4o';
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  tenantId?: string;   // NOVO — para rastreamento no Helicone
  userId?: string;     // NOVO — para rastreamento no Helicone
}

export interface OpenAIResponse {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  fromFallback?: boolean;
}

async function callOpenAIAPI(options: OpenAICallOptions): Promise<OpenAIResponse> {
  const client = options.tenantId
    ? createOpenAIClient(options.tenantId, options.userId)
    : defaultOpenAI;

  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages as any,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
  });

  return {
    content: response.choices[0]?.message?.content || '',
    model: response.model,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    },
    fromFallback: false,
  };
}

const breaker = new CircuitBreaker(callOpenAIAPI, OPENAI_CIRCUIT_BREAKER_CONFIG);

breaker.fallback(() => {
  return {
    content: "Estou com dificuldades técnicas no momento. Seu atendimento foi registrado e nossa equipe entrará em contato em breve.",
    model: 'fallback',
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    fromFallback: true,
  } as OpenAIResponse;
});

breaker.on('open', () => iaLogger.error('[CIRCUIT_BREAKER] OpenAI ABERTO. Usando fallback.'));
breaker.on('close', () => iaLogger.info('[CIRCUIT_BREAKER] OpenAI FECHADO'));

export function callOpenAI(options: OpenAICallOptions): Promise<OpenAIResponse> {
  return breaker.fire(options) as Promise<OpenAIResponse>;
}

export function getOpenAICircuitStatus(): 'closed' | 'open' | 'halfOpen' {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'halfOpen';
  return 'closed';
}
