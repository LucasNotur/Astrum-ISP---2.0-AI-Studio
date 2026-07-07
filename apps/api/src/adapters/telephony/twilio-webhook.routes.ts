import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { infraLogger } from '../../infrastructure/logging/logger';
import { initialCall, transition } from '../../domain/atendimento/voice-call';

/**
 * IA-08 A1 — Twilio Voice Webhook.
 *
 * POST /telephony/voice/incoming — recebe chamada, valida assinatura Twilio,
 * resolve tenant pelo número chamado, retorna TwiML.
 *
 * Flag: VOICE_ENGINE=off|mvp (default off).
 */

export function isVoiceEngineEnabled(): boolean {
  return (process.env.VOICE_ENGINE ?? 'off').trim().toLowerCase() === 'mvp';
}

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.map(k => `${k}${params[k]}`).join('');
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(url + data)
    .digest('base64');

  const sigBuf = Buffer.from(signature, 'base64');
  const expBuf = Buffer.from(expected, 'base64');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function isWithinBusinessHours(now = new Date()): boolean {
  const hour = now.getHours();
  const day = now.getDay();
  // Seg-Sex 08-18h, Sáb 08-12h
  if (day === 0) return false;
  if (day === 6) return hour >= 8 && hour < 12;
  return hour >= 8 && hour < 18;
}

export type TenantResolver = (phoneNumber: string) => Promise<{ tenantId: string; friendlyName?: string } | null>;

/**
 * Resolução ingênua de tenant por número de telefone.
 * No MVP usa a env TWILIO_PHONE_NUMBER como fallback; em produção deve ser
 * substituída por lookup em `tenants.phone_number` (Supabase).
 */
export function defaultTenantResolver(): TenantResolver {
  return async (phoneNumber: string) => {
    const configured = process.env.TWILIO_PHONE_NUMBER?.trim();
    if (configured && phoneNumber.replace(/\D/g, '').endsWith(configured.replace(/\D/g, ''))) {
      return { tenantId: process.env.DEFAULT_VOICE_TENANT_ID ?? 'voice-tenant' };
    }
    return { tenantId: process.env.DEFAULT_VOICE_TENANT_ID ?? 'voice-tenant' };
  };
}

export interface TwilioWebhookDeps {
  tenantResolver: TenantResolver;
  skipSignatureInDev: boolean;
  getNow: () => Date;
}

export const defaultTwilioWebhookDeps = (): TwilioWebhookDeps => ({
  tenantResolver: defaultTenantResolver(),
  skipSignatureInDev: true,
  getNow: () => new Date(),
});

export async function twilioVoiceRoutes(fastify: FastifyInstance) {
  await registerTwilioVoiceRoutes(fastify, defaultTwilioWebhookDeps());
}

export async function registerTwilioVoiceRoutes(
  fastify: FastifyInstance,
  deps: TwilioWebhookDeps,
) {
  fastify.post('/telephony/voice/incoming', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isVoiceEngineEnabled()) {
      return reply.code(404).send({ error: 'Voice engine disabled' });
    }

    const body = request.body as Record<string, string>;
    const signature = String(request.headers['x-twilio-signature'] ?? '');
    const url = `${request.protocol}://${request.hostname}${request.url}`;
    const shouldSkipSignature = deps.skipSignatureInDev && process.env.NODE_ENV !== 'production';
    if (!shouldSkipSignature) {
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!authToken) {
        infraLogger.warn('Twilio: TWILIO_AUTH_TOKEN ausente — rejeitando chamada');
        return reply.code(403).type('text/xml').send(rejectTwiml());
      }
      if (!validateTwilioSignature(authToken, signature, url, body)) {
        infraLogger.warn('Twilio: assinatura inválida');
        return reply.code(403).type('text/xml').send(rejectTwiml());
      }
    }

    const called = body?.Called ?? '';
    const tenant = await deps.tenantResolver(called);
    if (!tenant) {
      infraLogger.warn({ called }, 'Twilio: tenant não encontrado pelo número chamado');
      return reply.code(403).type('text/xml').send(rejectTwiml());
    }

    const withinHours = isWithinBusinessHours(deps.getNow());
    const ctx = initialCall(withinHours);
    const nextCtx = transition(ctx, { type: 'answer' });

    infraLogger.info(
      { state: nextCtx.state, withinHours, called, tenantId: tenant.tenantId },
      'Twilio: incoming call',
    );

    if (nextCtx.state === 'ended') {
      return reply.type('text/xml').send(afterHoursTwiml());
    }

    return reply.type('text/xml').send(greetingStreamTwiml(request.hostname, tenant.tenantId));
  });
}

function rejectTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>`;
}

function afterHoursTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR" voice="Polly.Camila-Neural">Nosso horário de atendimento é de segunda a sexta, das 8 às 18 horas, e sábado das 8 ao meio-dia. Por favor, retorne a ligação em horário comercial.</Say>
  <Hangup/>
</Response>`.trim();
}

function greetingStreamTwiml(hostname: string, tenantId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR" voice="Polly.Camila-Neural">Olá! Bem-vindo ao atendimento Astrum. Como posso ajudar você hoje?</Say>
  <Connect>
    <Stream url="wss://${hostname}/telephony/voice/stream">
      <Parameter name="tenantId" value="${tenantId}"/>
    </Stream>
  </Connect>
</Response>`.trim();
}
