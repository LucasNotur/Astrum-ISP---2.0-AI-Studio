import type { FastifyInstance } from 'fastify';
import { validateWebhookSignature } from '../../infrastructure/security/hmac.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import { parseEvolutionPayload, type ParsedEvolutionMessage } from './evolution-payload';
import type { MessageJobData } from '../../../../../packages/queue/src/workers/message.worker';

/**
 * Webhook Evolution API no Fastify (apps/api) — S71.
 *
 * Réplica funcional de src/routes/evolutionWebhook.ts, mas sobre Supabase e
 * publicando na fila astrum:messages (motor novo). Registrado como
 * POST /api/v2/webhook/evolution. NÃO recebe tráfego real até o cutover (S74).
 */

/** Monta o job da fila a partir da mensagem parseada. Função pura (testável). */
export function buildMessageJob(
  tenantId: string,
  msg: ParsedEvolutionMessage,
  opts: { isShadow?: boolean } = {},
): MessageJobData {
  return {
    tenantId,
    senderPhone: msg.senderPhone,
    messageContent: msg.textMessage,
    channel: 'whatsapp',
    messageId: msg.messageId,
    instanceName: msg.instanceName,
    isAudio: msg.isAudio,
    audioUrl: msg.audioUrl,
    isImage: msg.isImage,
    isDocument: msg.isDocument,
    base64Media: msg.base64Media,
    mediaMimeType: msg.mediaMimeType,
    isShadow: opts.isShadow ?? false,
  };
}

/** Descobre o tenant dono da instância. Segurança: instância desconhecida → null (403). */
export async function resolveTenantByInstance(instanceName: string): Promise<string | null> {
  // 1) tabela dedicada multi-instância
  const { data: mapped } = await supabaseAdmin
    .from('tenant_evolution_instances')
    .select('tenant_id')
    .eq('instance_name', instanceName)
    .maybeSingle();
  if (mapped?.tenant_id) return mapped.tenant_id;

  // 2) coluna direta em tenants
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('evolution_instance', instanceName)
    .maybeSingle();
  return tenant?.id ?? null;
}

export async function evolutionWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v2/webhook/evolution', async (request, reply) => {
    // 1. HMAC (mesmo serviço dos dois lados)
    const signature =
      (request.headers['x-hub-signature-256'] as string) ??
      (request.headers['x-evolution-signature'] as string) ??
      '';
    const rawBody = JSON.stringify(request.body);
    if (!validateWebhookSignature(rawBody, signature, 'evolution')) {
      return reply.code(401).send({ code: 'INVALID_SIGNATURE', message: 'Assinatura inválida.' });
    }

    // 2. Parse
    const parsed = parseEvolutionPayload(request.body);
    if (parsed.kind === 'ignored') {
      return reply.code(200).send({ status: 'ignored', reason: parsed.reason });
    }

    // 3. Tenant lookup
    const instanceName = parsed.kind === 'message' ? parsed.message.instanceName : parsed.instanceName;
    const tenantId = await resolveTenantByInstance(instanceName);
    if (!tenantId) {
      atendimentoLogger.warn({ instanceName }, '[SECURITY] Webhook rejeitado: instância não mapeada');
      return reply.code(403).send({ code: 'UNKNOWN_INSTANCE', message: 'Instância desconhecida.' });
    }

    // 4. connection.update → só registra status
    if (parsed.kind === 'connection') {
      await supabaseAdmin
        .from('tenant_evolution_instances')
        .update({ status: parsed.state })
        .eq('instance_name', instanceName);
      return reply.code(200).send({ status: 'connection_updated', state: parsed.state });
    }

    // 5. Mensagem → enfileira em astrum-messages (consumida pelo message.worker)
    // x-shadow: true → job marcado como shadow (processa mas não envia)
    const isShadow = request.headers['x-shadow'] === 'true';
    const job = buildMessageJob(tenantId, parsed.message, { isShadow });
    const { messageQueue } = await import('../../../../../packages/queue/src/queues');
    // jobId evita duplicata real (D1). Shadow usa prefixo diferente para não bloquear o job real.
    const jobId = isShadow ? `shadow:${job.messageId}` : `evo:${job.messageId}`;
    await messageQueue.add('inbound', job, { jobId });

    return reply.code(200).send({ status: isShadow ? 'shadow_queued' : 'queued', messageId: job.messageId });
  });
}

export default evolutionWebhookRoutes;
