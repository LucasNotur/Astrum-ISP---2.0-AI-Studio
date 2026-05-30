import { z } from 'zod';

export const PricingTierSchema = z.object({
  metric_type: z.string().min(1),
  tier_start: z.number().int().min(0),
  tier_end: z.number().int().min(1).nullable(), // null means infinite/above
  unit_price: z.number().min(0),
});

export const PlanFeatureSchema = z.object({
  feature_key: z.string().min(1),
  is_enabled: z.boolean().default(true),
});

export const PlanQuotaSchema = z.object({
  metric_type: z.string().min(1),
  limit_value: z.number().int().min(-1),
  overage_price: z.number().min(0),
});

export const AdvancedPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  billing_interval: z.enum(['monthly', 'yearly']),
  pricing_strategy: z.enum(['flat_rate', 'tiered', 'volume', 'pay_as_you_go']),
  base_price: z.number().min(0),
  trial_days: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  features: z.array(PlanFeatureSchema).optional(),
  quotas: z.array(PlanQuotaSchema).optional(),
  pricing_tiers: z.array(PricingTierSchema).optional(),
}).superRefine((data, ctx) => {
  // Validate tiered pricing strategy constraints
  if (data.pricing_strategy === 'tiered' || data.pricing_strategy === 'volume') {
    if (!data.pricing_tiers || data.pricing_tiers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O array de 'pricing_tiers' é obrigatório quando a estratégia é 'tiered' ou 'volume'",
        path: ['pricing_tiers'],
      });
      return;
    }

    // Group tiers by metric_type to check overlapping
    const tiersByMetric = data.pricing_tiers.reduce((acc, tier) => {
      acc[tier.metric_type] = acc[tier.metric_type] || [];
      acc[tier.metric_type].push(tier);
      return acc;
    }, {} as Record<string, typeof data.pricing_tiers>);

    for (const [metric, tiers] of Object.entries(tiersByMetric)) {
      // Sort by start
      tiers.sort((a, b) => a.tier_start - b.tier_start);
      
      let expectedStart = 0;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        if (tier.tier_start !== expectedStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Gap ou sobreposição detectado no tier para a métrica '${metric}'. Esperado início em ${expectedStart}.`,
            path: ['pricing_tiers', i, 'tier_start'],
          });
        }
        
        if (tier.tier_end === null) {
          // It must be the last tier
          if (i !== tiers.length - 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Tier infinito (tier_end = null) deve ser o último da métrica '${metric}'.`,
              path: ['pricing_tiers', i, 'tier_end'],
            });
          }
        } else {
          if (tier.tier_end < tier.tier_start) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `O fim do tier não pode ser menor que o início na métrica '${metric}'.`,
              path: ['pricing_tiers', i, 'tier_end'],
            });
          }
          expectedStart = tier.tier_end + 1;
        }
      }
    }
  }
});

export const CalculateInvoicePayload = z.object({
  tenant_id: z.string().uuid(),
});

export const TenantFeatureParams = z.object({
  tenant_id: z.string().uuid(),
  feature_key: z.string().min(1),
});

export const HeadersWithIdempotency = z.object({
  'x-idempotency-key': z.string().uuid(),
});
