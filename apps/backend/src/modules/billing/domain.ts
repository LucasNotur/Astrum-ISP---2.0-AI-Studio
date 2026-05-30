export interface Quota {
  metric_type: string;
  limit_value: number;
  overage_price: number;
}

export interface Tier {
  metric_type: string;
  tier_start: number;
  tier_end: number | null;
  unit_price: number;
}

export interface Usage {
  metric_type: string;
  current_usage: number;
}

export interface InvoiceContext {
  plan: {
    pricing_strategy: 'flat_rate' | 'tiered' | 'volume' | 'pay_as_you_go';
    base_price: number;
    quotas: Quota[];
    tiers: Tier[];
  };
  usages: Usage[];
}

export interface InvoiceLineItem {
  description: string;
  amount: number;
}

export interface InvoiceResult {
  total: number;
  line_items: InvoiceLineItem[];
}

export class BillingDomainError extends Error {
  constructor(public message: string) {
    super(message);
    this.name = 'BillingDomainError';
  }
}

/**
 * Calcula a fatura atual iterando pelos contadores de uso de acordo com a estratégia do plano.
 */
export function calculateInvoice(context: InvoiceContext): InvoiceResult {
  const lineItems: InvoiceLineItem[] = [];
  let total = context.plan.base_price;

  if (context.plan.base_price > 0) {
    lineItems.push({
      description: 'Plano Base',
      amount: context.plan.base_price,
    });
  }

  // Lógica Flat Rate / Soft-Cap Overage
  if (context.plan.pricing_strategy === 'flat_rate') {
    for (const usage of context.usages) {
      const quota = context.plan.quotas.find(q => q.metric_type === usage.metric_type);
      if (quota && quota.limit_value !== -1 && usage.current_usage > quota.limit_value) {
        const overageUnits = usage.current_usage - quota.limit_value;
        const overageCost = overageUnits * quota.overage_price;
        if (overageCost > 0) {
          total += overageCost;
          lineItems.push({
            description: `Excedente: ${quota.metric_type} (${overageUnits} unidades)`,
            amount: overageCost,
          });
        }
      }
    }
  }

  // Lógica de Tiers (Degraus Literais)
  if (context.plan.pricing_strategy === 'tiered') {
    for (const usage of context.usages) {
      // Filtrar e garantir ordem dos degraus da métrica correspondente
      const metricTiers = context.plan.tiers
        .filter(t => t.metric_type === usage.metric_type)
        .sort((a, b) => a.tier_start - b.tier_start);

      let remainingUsage = usage.current_usage;
      let metricCost = 0;

      for (const tier of metricTiers) {
        if (remainingUsage <= 0) break;

        // Se o tier não tem fim, cobraremos o restante inteiro aqui
        const tierSize = tier.tier_end === null ? remainingUsage : (tier.tier_end - tier.tier_start + 1);
        
        // As unidades faturadas neste degrau é o mínimo entre o consumo restante e o tamanho deste degrau
        const unitsInThisTier = Math.min(remainingUsage, tierSize);
        
        const tierCost = unitsInThisTier * tier.unit_price;
        metricCost += tierCost;
        remainingUsage -= unitsInThisTier;

        if (tierCost > 0) {
           lineItems.push({
            description: `Degrau ${tier.metric_type} (${unitsInThisTier} un. a R$${tier.unit_price} / tier: ${tier.tier_start} a ${tier.tier_end || 'infinito'})`,
            amount: tierCost,
          });
        }
      }
      
      total += metricCost;
    }
  }

  return {
    total: Number(total.toFixed(2)),
    line_items: lineItems,
  };
}
