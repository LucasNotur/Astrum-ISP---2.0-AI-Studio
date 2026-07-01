/**
 * Provider Fallback — failover multi-LLM transparente (regra R3).
 *
 * Plano Mestre V2, S72. Port de src/ai-provider/ai-provider.service.ts para o motor
 * novo, com duas mudanças de projeto:
 *  1. Store de circuit-breaker e adapters são INJETÁVEIS → testável sem Redis.
 *  2. Failover DENTRO da request: se o provider primário falha, tenta o próximo da
 *     lista antes de desistir (o legado só trocava entre requests). Isso torna a
 *     queda de um provider imperceptível para o cliente, como especificado.
 *
 * Roteamento (R3): 4o-mini conversa, 4o orquestração — definido por aiFunction/config.
 */

export type ProviderName = 'openai' | 'gemini' | 'anthropic';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  fallbackProvider?: ProviderName;
  fallbackModel?: string;
}

export interface ChatResult {
  content: string;
  provider: ProviderName;
  model: string;
  usedFallback: boolean;
}

export interface ChatAdapter {
  chat(messages: unknown[], model: string, tenantId: string): Promise<{ content: string }>;
}

/** Abstrai o estado do circuit-breaker (Redis em prod, Map em teste). */
export interface CircuitStore {
  getState(provider: ProviderName): Promise<CircuitState>;
  recordFailure(provider: ProviderName): Promise<void>;
  recordSuccess(provider: ProviderName): Promise<void>;
}

/**
 * Monta a lista de prioridade de providers: primário → fallback → gemini (garantia final).
 * Sem duplicatas. Função pura.
 */
export function buildPriorityList(config: ProviderConfig): ProviderName[] {
  const list: ProviderName[] = [config.provider];
  if (config.fallbackProvider && config.fallbackProvider !== config.provider) {
    list.push(config.fallbackProvider);
  }
  if (!list.includes('gemini')) list.push('gemini');
  return list;
}

/** Resolve o modelo para o provider escolhido dentro da priorityList. */
export function resolveModel(config: ProviderConfig, provider: ProviderName): string {
  if (provider === config.provider) return config.model;
  if (provider === config.fallbackProvider && config.fallbackModel) return config.fallbackModel;
  return 'gemini-2.0-flash'; // default de última instância
}

export class ProviderFallback {
  constructor(
    private readonly adapters: Partial<Record<ProviderName, ChatAdapter>>,
    private readonly store: CircuitStore,
  ) {}

  /**
   * Tenta cada provider da lista em ordem, pulando os que estão com circuito OPEN.
   * Failover transparente: só lança se TODOS falharem.
   */
  async chat(config: ProviderConfig, messages: unknown[], tenantId: string): Promise<ChatResult> {
    const priority = buildPriorityList(config);
    let lastError: Error | null = null;

    for (const provider of priority) {
      const state = await this.store.getState(provider);
      if (state === 'OPEN') continue; // circuito aberto: nem tenta

      const adapter = this.adapters[provider];
      if (!adapter) continue;

      try {
        const model = resolveModel(config, provider);
        const res = await adapter.chat(messages, model, tenantId);
        await this.store.recordSuccess(provider);
        return { content: res.content, provider, model, usedFallback: provider !== config.provider };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await this.store.recordFailure(provider);
        // segue para o próximo provider da lista
      }
    }

    throw new Error(`Todos os providers falharam. Último erro: ${lastError?.message ?? 'desconhecido'}`);
  }
}

/**
 * Circuit store em memória — usado em testes e como fallback quando não há Redis.
 * Transições fiéis ao legado: 3 falhas em CLOSED → OPEN; falha em HALF_OPEN → OPEN.
 */
export class InMemoryCircuitStore implements CircuitStore {
  private failures = new Map<ProviderName, number>();
  private openUntil = new Map<ProviderName, number>();
  private recentOpen = new Map<ProviderName, number>();

  constructor(private now: () => number = () => Date.now(), private openMs = 60_000, private halfOpenMs = 120_000) {}

  async getState(provider: ProviderName): Promise<CircuitState> {
    const open = this.openUntil.get(provider) ?? 0;
    if (open > this.now()) return 'OPEN';
    const recent = this.recentOpen.get(provider) ?? 0;
    if (recent > this.now()) return 'HALF_OPEN';
    return 'CLOSED';
  }

  async recordFailure(provider: ProviderName): Promise<void> {
    const state = await this.getState(provider);
    if (state === 'OPEN') return;
    if (state === 'HALF_OPEN') {
      this.trip(provider);
      return;
    }
    const fails = (this.failures.get(provider) ?? 0) + 1;
    this.failures.set(provider, fails);
    if (fails >= 3) this.trip(provider);
  }

  async recordSuccess(provider: ProviderName): Promise<void> {
    this.failures.delete(provider);
    this.openUntil.delete(provider);
    this.recentOpen.delete(provider);
  }

  private trip(provider: ProviderName): void {
    this.openUntil.set(provider, this.now() + this.openMs);
    this.recentOpen.set(provider, this.now() + this.halfOpenMs);
    this.failures.delete(provider);
  }
}
