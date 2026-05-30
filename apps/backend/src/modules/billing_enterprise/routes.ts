import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ProrationPayload, PaginationSchema } from './schemas';
import { verifyIdempotency } from './middleware/idempotency';
import { ProrationEngine } from './domain/proration';
import { CurrencyHelper } from './domain/currency';
import { InvoiceRepository } from './repositories/invoiceRepository';

export const billingEnterpriseRoutes: FastifyPluginAsync = async (fastify) => {
  const invoiceRepository = new InvoiceRepository();

  /**
   * Endpoint Otimizado: Cálculo Pro-Rata Reverso para Upgrades/Downgrades
   */
  fastify.post('/preview-proration', { preHandler: [verifyIdempotency] }, async (request, reply) => {
    const parsed = ProrationPayload.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation Error', details: parsed.error.format() });
    }

    const data = parsed.data;
    
    const oldPriceCents = CurrencyHelper.toCents(data.current_plan_price);
    const newPriceCents = CurrencyHelper.toCents(data.new_plan_price);
    const startMs = new Date(data.period_start).getTime();
    const endMs = new Date(data.period_end).getTime();
    
    // Supondo cenário "upgrade hoje"
    const nowMs = Date.now();

    try {
      const resultCents = ProrationEngine.calculate(
        oldPriceCents,
        newPriceCents,
        startMs,
        endMs,
        nowMs
      );

      return reply.code(200).send({
        success: true,
        proration_preview: {
          description: resultCents.description,
          unused_credit_applied: CurrencyHelper.toFloat(resultCents.unusedCreditCents),
          new_cost_allocated: CurrencyHelper.toFloat(resultCents.newPlanCostForRemainingCents),
          amount_due: CurrencyHelper.toFloat(resultCents.amountDueCents),
          credit_rollover: CurrencyHelper.toFloat(resultCents.creditRolloverCents)
        }
      });
    } catch (error: any) {
      return reply.code(422).send({ error: 'Proration Failed', message: error.message });
    }
  });

  /**
   * Listagem de Faturas em Altíssima Performance usando Cursores (Sem offset lag)
   */
  fastify.get('/invoices', async (request, reply) => {
    const qParams = PaginationSchema.safeParse(request.query);
    if (!qParams.success) {
      return reply.code(400).send({ error: 'Validation Error', details: qParams.error.format() });
    }
    
    // Obteria auth.uid() do Header JWT no mundo real
    const mockTenantId = 'tenant_mock_1'; 

    const { limit, cursor, status } = qParams.data;

    const result = await invoiceRepository.getInvoicesWithCursor(mockTenantId, limit, cursor, status);

    return reply.code(200).send({
      success: true,
      data: result.data,
      meta: result.pagination
    });
  });

};
