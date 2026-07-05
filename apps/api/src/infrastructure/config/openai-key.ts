import { infraLogger } from '../logging/logger';

/**
 * Resolve a API key da OpenAI com fail-fast em produção.
 * Centralizado aqui para que adapters e services usem a mesma lógica.
 */
export function resolveOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OPENAI_API_KEY ausente em produção — abortando criação do cliente OpenAI.');
  }
  infraLogger.warn('[OPENAI] OPENAI_API_KEY ausente — usando dummy_key (apenas dev/test).');
  return 'dummy_key';
}
