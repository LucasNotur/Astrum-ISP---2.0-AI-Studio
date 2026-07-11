import CircuitBreaker from 'opossum';
import { WHATSAPP_CIRCUIT_BREAKER_CONFIG } from '../openai/circuit-breaker.config';
import { randomUUID } from 'crypto';
import { infraLogger } from '../../infrastructure/logging/logger';

export type MetaChannel = 'instagram' | 'messenger';

export interface MetaMessage {
  recipientId: string;
  content: string;
  pageId: string;
  channel: MetaChannel;
  pageAccessToken?: string;
}

export interface MetaMessageResponse {
  messageId: string;
  status: 'sent' | 'failed' | 'fallback';
  timestamp: string;
}

const META_API_BASE = 'https://graph.facebook.com/v21.0';

async function sendMetaAPI(message: MetaMessage): Promise<MetaMessageResponse> {
  const accessToken = message.pageAccessToken ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('META_PAGE_ACCESS_TOKEN não configurado');
  }

  const response = await fetch(`${META_API_BASE}/${message.pageId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: message.recipientId },
      message: { text: message.content },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Meta Graph API erro ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    messageId: (data['message_id'] as string) ?? randomUUID(),
    status: 'sent',
    timestamp: new Date().toISOString(),
  };
}

const breaker = new CircuitBreaker(sendMetaAPI, {
  ...WHATSAPP_CIRCUIT_BREAKER_CONFIG,
  name: 'meta-graph',
});

breaker.fallback(
  (): MetaMessageResponse => ({
    messageId: randomUUID(),
    status: 'fallback',
    timestamp: new Date().toISOString(),
  }),
);

breaker.on('open', () => infraLogger.error('[CIRCUIT_BREAKER] Meta Graph API ABERTO'));
breaker.on('close', () => infraLogger.info('[CIRCUIT_BREAKER] Meta Graph API FECHADO'));

export function sendMetaMessage(message: MetaMessage): Promise<MetaMessageResponse> {
  return breaker.fire(message) as Promise<MetaMessageResponse>;
}

export function getMetaCircuitStatus(): 'closed' | 'open' | 'halfOpen' {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'halfOpen';
  return 'closed';
}
