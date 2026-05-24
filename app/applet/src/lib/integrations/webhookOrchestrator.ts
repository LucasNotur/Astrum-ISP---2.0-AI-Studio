import { redisClient } from '../redis';
import crypto from 'crypto';

export type EventType = 'PAYMENT_CONFIRMED' | 'CUSTOMER_BLOCKED' | 'OTHER';

export interface NormalizedEvent {
  event_id: string;
  type: EventType;
  cpf_cnpj: string;
  timestamp: string;
  payload: any;
}

export function parseIXCEvent(payload: any): NormalizedEvent {
  let type: EventType = 'OTHER';
  if (payload.status === 'pago') type = 'PAYMENT_CONFIRMED';
  return {
    event_id: payload.id || '',
    type,
    cpf_cnpj: payload.cpf_cnpj || '',
    timestamp: payload.created_at || new Date().toISOString(),
    payload
  };
}

export function parseMKAuthEvent(payload: any): NormalizedEvent {
  let type: EventType = 'OTHER';
  if (payload.event === 'cliente_bloqueado') type = 'CUSTOMER_BLOCKED';
  
  return {
    event_id: payload.uuid || '',
    type,
    cpf_cnpj: payload.documento || '',
    timestamp: payload.data || new Date().toISOString(),
    payload
  };
}

export function parseVoalleEvent(payload: any): NormalizedEvent {
  let type: EventType = 'OTHER';
  if (payload.event_type === 'payment') type = 'PAYMENT_CONFIRMED';
  
  return {
    event_id: payload.message_id || '',
    type,
    cpf_cnpj: payload.customer_document || '',
    timestamp: payload.timestamp || new Date().toISOString(),
    payload
  };
}

export interface TenantContext {
  id: string;
  hmacSecret: string;
}

export class WebhookOrchestrator {
  constructor(private getTenantFn: (tenantId: string) => Promise<TenantContext | null>) {}

  private verifyHmac(payload: string, signature: string, secret: string): boolean {
    const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return computed === signature;
  }

  async processWebhook(tenantId: string, headers: Record<string, string>, rawBody: string, parser: (body: any) => NormalizedEvent) {
    const tenant = await this.getTenantFn(tenantId);
    if (!tenant) {
      return { status: 200, body: 'skipped:unknown_tenant' };
    }

    const signature = headers['x-hub-signature'] || headers['x-signature'] || '';
    if (!this.verifyHmac(rawBody, signature, tenant.hmacSecret)) {
      return { status: 401, body: 'invalid_hmac' };
    }

    const body = JSON.parse(rawBody);
    const event = parser(body);

    // Evento duplicado (mesmo event_id em 3600s) -> descartado via Redis NX
    const eventIdKey = `webhook_event:${tenantId}:${event.event_id}`;
    const isNew = await redisClient.setnx(eventIdKey, '1');
    if (!isNew) {
      return { status: 200, body: 'skipped:duplicate_event_id' };
    }
    await redisClient.setex(eventIdKey, 3600, '1');

    // Mesmo tipo+CPF em menos de 60s
    const rateLimitKey = `webhook_rate:${tenantId}:${event.type}:${event.cpf_cnpj}`;
    const isRateLimited = await redisClient.setnx(rateLimitKey, '1');
    if (!isRateLimited) {
      return { status: 200, body: 'skipped:rate_limited' };
    }
    await redisClient.setex(rateLimitKey, 60, '1');

    return { status: 200, body: 'processed', event };
  }
}
