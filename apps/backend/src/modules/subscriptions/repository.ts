export interface SubscriptionContext {
  limit_value: number;
  overage_price_per_unit: number;
  current_usage: number;
}

export interface ISubscriptionRepository {
  getSubscriptionContext(tenantId: string, metricType: string): Promise<SubscriptionContext | null>;
  incrementUsage(tenantId: string, metricType: string, amount: number): Promise<void>;
  checkAndSaveIdempotencyKey(key: string): Promise<boolean>;
}

/**
 * Adaptador Secundário da Arquitetura Hexagonal: Representa a comunicação com o Banco de Dados (Supabase/PostgreSQL) 
 * e Cache (Redis ou memcached para Idempotência).
 * Esta implementação atua como stub/mock para satisfazer contratos da domain logic sem conexão real imediata.
 */
export class SubscriptionRepository implements ISubscriptionRepository {
  private idempotencyCache = new Set<string>();

  public async getSubscriptionContext(tenantId: string, metricType: string): Promise<SubscriptionContext | null> {
    // Simulação: Buscando no banco relacional `plans`, `plan_limits` e `usage_counters`
    return {
      limit_value: 1000,
      overage_price_per_unit: 0.5, // 0 significa que não permite overage
      current_usage: 800,
    };
  }

  public async incrementUsage(tenantId: string, metricType: string, amount: number): Promise<void> {
    // Simulação: Incrementa current_usage no banco na tabela `usage_counters` via RPC ou Update atômico 
    console.log(`Incremented usage for tenant ${tenantId} on metric ${metricType} by ${amount}`);
  }

  public async checkAndSaveIdempotencyKey(key: string): Promise<boolean> {
    // Verifica se já passou essa chave no cache há menos de 5 minutos
    if (this.idempotencyCache.has(key)) return true;
    
    this.idempotencyCache.add(key);
    
    // Auto-purga simulando TTL do Redis (5 minutos)
    setTimeout(() => this.idempotencyCache.delete(key), 5 * 60 * 1000);
    
    return false;
  }
}
