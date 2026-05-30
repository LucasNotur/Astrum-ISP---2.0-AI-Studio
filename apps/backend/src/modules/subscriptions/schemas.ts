import { z } from 'zod';

export const PlanLimitValidator = z.object({
  metric_type: z.enum(['tokens_ia', 'clientes_ativos', 'mensagens_whatsapp', 'storage_gb']),
  limit_value: z.number().int().min(-1),
  overage_price_per_unit: z.number().min(0).multipleOf(0.0001).optional().default(0),
});

export const PlanValidator = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  billing_mode: z.enum(['fixed', 'per_active_client', 'hybrid', 'usage_based']),
  base_price: z.number().min(0).multipleOf(0.01).default(0),
  currency: z.string().default('BRL'),
  is_active: z.boolean().default(true),
  limits: z.array(PlanLimitValidator).optional(),
});

export const ConsumeQuotaPayload = z.object({
  tenant_id: z.string().uuid(),
  metric_type: z.enum(['tokens_ia', 'clientes_ativos', 'mensagens_whatsapp', 'storage_gb']),
  amount: z.number().int().positive(),
});

export const HeadersWithIdempotency = z.object({
  'x-idempotency-key': z.string().uuid(),
});
