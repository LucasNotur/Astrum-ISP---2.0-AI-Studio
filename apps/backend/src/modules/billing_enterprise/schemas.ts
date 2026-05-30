import { z } from 'zod';

export const ProrationPayload = z.object({
  tenant_id: z.string().uuid(),
  current_plan_id: z.string().uuid(),
  new_plan_id: z.string().uuid(),
  current_plan_price: z.number().min(0).describe('Preço em Reais'),
  new_plan_price: z.number().min(0).describe('Preço em Reais'),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
});

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional().describe('Cursor (Base64) para a próxima página'),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional()
});
