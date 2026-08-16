import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { queues } from '../../infrastructure/queue/priority-queues';
import { redis } from '../../infrastructure/cache/redis.client';
import { securityLogger, cobrancaLogger } from '../../infrastructure/logging/logger';
import { resolveAsaasAction, buildInvoiceStatusPatch, buildInvoicePaidJob } from './asaas-webhook.service';

const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // janela de retry do Asaas

/** Comparação em tempo constante. Tamanhos diferentes -> false (não lança). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * POST /api/v2/webhook/asaas
 *
 * Asaas NÃO assina com HMAC — autentica via header `asaas-access-token` (valor
 * estático configurado no painel do Asaas). Por isso o guard é aqui no handler
 * (timing-safe, fail-closed), não no `webhook-hmac.plugin` (esse é só p/ providers
 * HMAC de verdade: evolution/facebook).
 *
 * Sem `onRequest: authenticate` — é o Asaas chamando, não um usuário logado.
 */
export async function asaasWebhookRoutes(app: FastifyInstance) {
  app.post('/api/v2/webhook/asaas', async (req, reply) => {
    const token = req.headers['asaas-access-token'] as string | undefined;
    const expected = process.env.ASAAS_WEBHOOK_SECRET;

    // Fail-closed: secret ausente OU token ausente OU não bate -> 401, nunca processa.
    if (!expected || !token || !timingSafeEqualStr(token, expected)) {
      securityLogger.warn({ url: req.url }, 'Webhook Asaas: token ausente/inválido — rejeitado');
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }

    const body = req.body as any;
    const event = body?.event as string | undefined;
    const payment = body?.payment;

    // Shape inesperado: responde 200 (não é problema do Asaas) mas não processa nada.
    if (!event || !payment?.id) {
      securityLogger.warn({ event }, 'Webhook Asaas: payload sem event/payment.id — ignorado');
      return reply.code(200).send({ ok: true });
    }

    const dedupKey = `asaas_evt:${event}:${payment.id}`;
    if (await redis.get(dedupKey)) {
      return reply.code(200).send({ ok: true }); // já processado (retry do Asaas) — idempotente
    }

    const action = resolveAsaasAction(event);
    if (action === 'ignore') {
      await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS);
      return reply.code(200).send({ ok: true });
    }

    // Tenant/fatura resolvidos SERVER-SIDE via external_id (nunca de body/query do request).
    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select('id, tenant_id, customer_id, amount_cents')
      .eq('external_id', String(payment.id))
      .maybeSingle();

    if (error) {
      cobrancaLogger.error({ err: error, event, paymentId: payment.id }, 'Webhook Asaas: erro ao buscar invoice');
      return reply.code(500).send({ code: 'DB_ERROR' });
    }

    if (!invoice) {
      // Cobrança existe no Asaas mas ainda não foi sincronizada localmente (sync F6-02
      // roda por tenant). Não há tenant pra resolver -> não processa, mas confirma
      // recebimento pro Asaas não ficar re-tentando pra sempre.
      cobrancaLogger.warn({ event, paymentId: payment.id }, 'Webhook Asaas: invoice não encontrada (external_id) — ignorado');
      await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS);
      return reply.code(200).send({ ok: true });
    }

    const patch = buildInvoiceStatusPatch(action, new Date().toISOString());
    if (patch) {
      await supabaseAdmin
        .from('invoices')
        .update(patch)
        .eq('id', invoice.id)
        .eq('tenant_id', invoice.tenant_id);
    }

    if (action === 'mark_paid') {
      const job = buildInvoicePaidJob(invoice, invoice.amount_cents);
      await (queues.cobrai as any).add('invoice.paid', job);
      cobrancaLogger.info({ event, invoiceId: invoice.id, tenantId: invoice.tenant_id }, 'Webhook Asaas: invoice.paid enfileirado');
    }

    await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS);
    return reply.code(200).send({ ok: true });
  });
}
