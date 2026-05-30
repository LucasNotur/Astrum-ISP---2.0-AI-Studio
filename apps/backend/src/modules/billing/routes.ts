import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { 
  HeadersWithIdempotency, 
  CalculateInvoicePayload,
  TenantFeatureParams 
} from './schemas';
import { calculateInvoice, BillingDomainError } from './domain';
import { BillingRepository } from './repository';

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  const repository = new BillingRepository();

  /**
   * Endpoint: POST /api/v1/billing/calculate-invoice
   * Finalidade: Calcula dinamicamente o valor da fatura baseado no consumo atual da mescla de flat_rate ou tiered pricing.
   */
  fastify.post('/calculate-invoice', async (request, reply) => {
    // 1. Validar Headers
    const headerResult = HeadersWithIdempotency.safeParse(request.headers);
    if (!headerResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Cabeçalho X-Idempotency-Key ausente ou inválido.',
        details: headerResult.error.format(),
      });
    }

    // 2. Validar Payload
    const bodyResult = CalculateInvoicePayload.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Payload inválido (tenant_id obrigatório e deve ser UUID).',
        details: bodyResult.error.format(),
      });
    }

    const { 'x-idempotency-key': idempotencyKey } = headerResult.data;
    const { tenant_id } = bodyResult.data;

    // 3. Verificação de Idempotência
    const isDuplicate = await repository.checkAndSaveIdempotencyKey(idempotencyKey);
    if (isDuplicate) {
      return reply.code(409).send({
        error: 'IDEMPOTENCY_CONFLICT',
        message: 'Operação de faturamento ignorada para evitar cobrança dupla (idempotency-key recenetemente utilizada).'
      });
    }

    // 4. Injetar Regras de Domínio via Adaptador
    try {
      const context = await repository.getInvoiceContext(tenant_id);
      
      if (!context) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Suscrição ou métricas de faturamento não encontradas para este tenant.'
        });
      }

      // 5. Cálculo Matemático Estrito da Fatura
      const invoice = calculateInvoice(context);

      // 6. Retornar resposta
      return reply.code(200).send({
        success: true,
        invoice,
      });

    } catch (error) {
      if (error instanceof BillingDomainError) {
        return reply.code(422).send({
          error: 'UNPROCESSABLE_ENTITY',
          message: error.message
        });
      }
      return reply.code(500).send({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Erro desconhecido ao calcular fatura.'
      });
    }
  });

  /**
   * Endpoint: GET /api/v1/billing/check-feature/:tenant_id/:feature_key
   * Finalidade: Retorna autorização via API Key ou JWT sobre determinado acesso ao feature daquele plano específico.
   */
  fastify.get<{ Params: { tenant_id: string; feature_key: string } }>('/check-feature/:tenant_id/:feature_key', async (request, reply) => {
    const paramsResult = TenantFeatureParams.safeParse(request.params);
    if (!paramsResult.success) {
       return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: paramsResult.error.format(),
      });
    }

    const { tenant_id, feature_key } = paramsResult.data;

    const hasAccess = await repository.checkFeatureAccess(tenant_id, feature_key);

    return reply.code(200).send({
      feature_key,
      hasAccess
    });
  });
};
