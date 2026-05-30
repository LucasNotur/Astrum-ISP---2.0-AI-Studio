import { InvoiceContext } from './domain';

export interface IBillingRepository {
  getInvoiceContext(tenantId: string): Promise<InvoiceContext | null>;
  checkFeatureAccess(tenantId: string, featureKey: string): Promise<boolean>;
  checkAndSaveIdempotencyKey(key: string): Promise<boolean>;
}

export class BillingRepository implements IBillingRepository {
  private idempotencyCache = new Set<string>();

  public async getInvoiceContext(tenantId: string): Promise<InvoiceContext | null> {
    // Este repositório de mock atua como um Anti-Corruption Layer para a comunicação com PostgreSQL Supabase
    return {
      plan: {
        pricing_strategy: 'tiered',
        base_price: 100.0,
        quotas: [],
        tiers: [
          { metric_type: 'api_calls', tier_start: 0, tier_end: 1000, unit_price: 0.05 },
          { metric_type: 'api_calls', tier_start: 1001, tier_end: 5000, unit_price: 0.02 },
          { metric_type: 'api_calls', tier_start: 5001, tier_end: null, unit_price: 0.01 },
        ],
      },
      usages: [
        { metric_type: 'api_calls', current_usage: 1500 }, // Custo deve ser 1000*0.05 + 500*0.02 = 50 + 10 = 60
        { metric_type: 'storage_gb', current_usage: 50 },
      ]
    };
  }

  public async checkFeatureAccess(tenantId: string, featureKey: string): Promise<boolean> {
    // Buscando no DB: SELECT is_enabled FROM plan_features pf JOIN subscriptions s ON pf.plan_id = s.plan_id WHERE s.tenant_id = ? AND pf.feature_key = ?
    return true; // Mock para fins arquiteturais
  }

  public async checkAndSaveIdempotencyKey(key: string): Promise<boolean> {
    if (this.idempotencyCache.has(key)) return true;
    this.idempotencyCache.add(key);
    setTimeout(() => this.idempotencyCache.delete(key), 5 * 60 * 1000); // Purga após 5 minutos
    return false;
  }
}
