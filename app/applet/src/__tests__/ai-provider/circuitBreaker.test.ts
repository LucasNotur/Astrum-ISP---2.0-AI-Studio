import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitState, AIProviderManager, AIProvider } from '../../../src/ai-provider/circuitBreaker';
import { redisClient } from '../../../src/lib/redis';

vi.mock('../../../src/lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
    incr: vi.fn()
  }
}));

describe('Circuit Breaker Tests', () => {
  let manager: AIProviderManager;
  let primary: AIProvider;
  let secondary: AIProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    primary = { id: 'openai', isPrimary: true, name: 'OpenAI' };
    secondary = { id: 'gemini', isPrimary: false, name: 'Gemini' };

    manager = new AIProviderManager([primary, secondary]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. 0 falhas -> circuit CLOSED', () => {
    expect(manager.getState('openai')).toBe(CircuitState.CLOSED);
  });

  it('2. 3 falhas em 1 minuto -> circuit OPEN', () => {
    manager.recordFailure('openai');
    manager.recordFailure('openai');
    manager.recordFailure('openai');

    expect(manager.getState('openai')).toBe(CircuitState.OPEN);
  });

  it('3. Circuit OPEN -> getAvailableProvider retorna provider secundário (não o primário)', async () => {
    manager.recordFailure('openai');
    manager.recordFailure('openai');
    manager.recordFailure('openai');

    const provider = await manager.getAvailableProvider('tenant-123');
    
    expect((provider as AIProvider).id).toBe('gemini');
    expect((provider as AIProvider).isPrimary).toBe(false);
  });

  it('4. Após 60s com circuit OPEN -> tenta HALF_OPEN', () => {
    manager.recordFailure('openai');
    manager.recordFailure('openai');
    manager.recordFailure('openai');

    expect(manager.getState('openai')).toBe(CircuitState.OPEN);

    vi.advanceTimersByTime(60001); // 60s + 1ms

    expect(manager.getState('openai')).toBe(CircuitState.HALF_OPEN);
  });

  it('5. HALF_OPEN com sucesso -> volta para CLOSED', () => {
    manager.recordFailure('openai');
    manager.recordFailure('openai');
    manager.recordFailure('openai');

    vi.advanceTimersByTime(60001);

    expect(manager.getState('openai')).toBe(CircuitState.HALF_OPEN);

    manager.recordSuccess('openai');

    expect(manager.getState('openai')).toBe(CircuitState.CLOSED);
  });

  it('6. Todos os providers OPEN -> retorna resposta padrão de indisponibilidade ao cliente (não 500)', async () => {
    manager.recordFailure('openai');
    manager.recordFailure('openai');
    manager.recordFailure('openai');

    manager.recordFailure('gemini');
    manager.recordFailure('gemini');
    manager.recordFailure('gemini');

    const result = await manager.getAvailableProvider('tenant-123');

    expect(result).not.toHaveProperty('id');
    expect(result).toEqual({ error: 'ALL_PROVIDERS_OPEN', message: 'Serviço temporariamente indisponível' });
  });

  it('7. Fallback ocorrido -> Redis llm_fallbacks:{tenantId}:{date} incrementado', async () => {
    const dateStr = new Date().toISOString().split('T')[0];
    
    manager.recordFailure('openai');
    manager.recordFailure('openai');
    manager.recordFailure('openai');

    await manager.getAvailableProvider('tenant-123');

    expect(redisClient.incr).toHaveBeenCalledTimes(1);
    expect(redisClient.incr).toHaveBeenCalledWith(`llm_fallbacks:tenant-123:${dateStr}`);
  });
});
