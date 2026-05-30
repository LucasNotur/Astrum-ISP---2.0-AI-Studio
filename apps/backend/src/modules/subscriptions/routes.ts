import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ConsumeQuotaPayload, HeadersWithIdempotency, PlanValidator } from './schemas';
import { calculateQuotaConsumption } from './domain';
import { SubscriptionRepository } from './repository';

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  // Injeção de Dependências
  const repository = new SubscriptionRepository();

  /**
   * Endpoint: POST /api/v1/subscriptions/consume
   * Finalidade: Consumir cota dentro da arquitetura Hexagonal.
   * Dependências: Header X-Idempotency-Key
   */
  fastify.post('/consume', async (request, reply) => {
    // 1. Validação do Zod para Headers e Body
    const headerResult = HeadersWithIdempotency.safeParse(request.headers);
    if (!headerResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'O cabeçalho X-Idempotency-Key é obrigatório e deve ser um UUID válido.',
        details: headerResult.error.format(),
      });
    }

    const bodyResult = ConsumeQuotaPayload.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'O payload de consumo (tenant_id, metric_type, amount) é inválido.',
        details: bodyResult.error.format(),
      });
    }

    const { 'x-idempotency-key': idempotencyKey } = headerResult.data;
    const { tenant_id, metric_type, amount } = bodyResult.data;

    // 2. Avaliar Idempotência (Bloqueio de duplicação assíncrona / faturamentos repetidos)
    const isAlreadyExecuted = await repository.checkAndSaveIdempotencyKey(idempotencyKey);
    if (isAlreadyExecuted) {
      return reply.code(409).send({
        error: 'IDEMPOTENCY_CONFLICT',
        message: 'Uma transação para esta Idempotency-Key foi executada nos últimos 5 minutos.',
      });
    }

    // 3. Buscar limites do tenant para o modelo Arquitetural Hexagonal
    const context = await repository.getSubscriptionContext(tenant_id, metric_type);
    if (!context) {
      return reply.code(404).send({
         error: 'NOT_FOUND',
         message: 'Os limites de assinatura ou o plano do tenant não foram encontrados.',
      });
    }

    // 4. Executar Logic Domain Pura
    const result = calculateQuotaConsumption(
      context.current_usage,
      amount,
      context.limit_value,
      context.overage_price_per_unit
    );

    // 5. Validar Regra de Negócio que Retornou Falha (Excedido ou Hard-Cap)
    if (!result.success) {
      return reply.code(403).send({
        error: result.error, // "QUOTA_EXCEEDED"
        message: result.message // "O sistema entrou em modo de contingência estático..."
      });
    }

    // 6. Persistência Final se for autorizado (incluindo mode OVERAGE)
    await repository.incrementUsage(tenant_id, metric_type, amount);

    // 7. Retorno normalizado
    // Formatos previstos: 
    // { success: true, triggerWarning: "ALERT_75" }
    // { success: true, triggerWarning: "ALERT_90" }
    // { success: true, mode: "OVERAGE" }
    // { success: true }
    return reply.code(200).send(result);
  });

  /**
   * Endpoint opcional para validar a criação de planos com Zod de acordo com o Schema do DB
   */
  fastify.post('/plans', async (request, reply) => {
    const bodyResult = PlanValidator.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: bodyResult.error.format(),
      });
    }

    // Lógica para enviar para o DB (omitida/mockada aqui)
    return reply.code(201).send({
      success: true,
      message: 'Plan payload validated successfully.',
      data: bodyResult.data
    });
  });
};
