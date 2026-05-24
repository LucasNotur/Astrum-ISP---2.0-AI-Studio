import { redisClient } from '../lib/redis';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface AIProvider {
  id: string;
  isPrimary: boolean;
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT = 60000; // 60 seconds

  constructor(public provider: AIProvider) {}

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.RESET_TIMEOUT) {
        this.state = CircuitState.HALF_OPEN;
      }
    }
    return this.state;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.FAILURE_THRESHOLD) {
      this.state = CircuitState.OPEN;
    }
  }

  recordSuccess() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
  }
}

export class AIProviderManager {
  private breakers: Map<string, CircuitBreaker>;
  private providers: AIProvider[];

  constructor(providers: AIProvider[]) {
    this.providers = providers;
    this.breakers = new Map(providers.map(p => [p.id, new CircuitBreaker(p)]));
  }

  async getAvailableProvider(tenantId: string): Promise<AIProvider | { error: string, message: string }> {
    let fallbackOccurred = false;
    let selectedProvider: AIProvider | null = null;

    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider.id);
      if (breaker) {
        const state = breaker.getState();
        if (state === CircuitState.CLOSED || state === CircuitState.HALF_OPEN) {
            if (!provider.isPrimary) {
               fallbackOccurred = true;
            }
            selectedProvider = provider;
            break;
        }
      }
    }

    if (!selectedProvider) {
      return { error: 'ALL_PROVIDERS_OPEN', message: 'Serviço temporariamente indisponível' };
    }

    if (fallbackOccurred) {
      const dateStr = new Date().toISOString().split('T')[0];
      await redisClient.incr(`llm_fallbacks:${tenantId}:${dateStr}`);
    }

    return selectedProvider;
  }

  recordFailure(providerId: string) {
    this.breakers.get(providerId)?.recordFailure();
  }

  recordSuccess(providerId: string) {
    this.breakers.get(providerId)?.recordSuccess();
  }

  getState(providerId: string) {
    return this.breakers.get(providerId)?.getState();
  }
}
