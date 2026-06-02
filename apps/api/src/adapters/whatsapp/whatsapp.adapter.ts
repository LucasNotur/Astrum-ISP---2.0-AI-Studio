import CircuitBreaker from 'opossum';
import { WHATSAPP_CIRCUIT_BREAKER_CONFIG } from '../openai/circuit-breaker.config';
import { randomUUID } from 'crypto';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface WhatsAppMessage {
  to: string;
  content: string;
  tenantId: string;
}

export interface WhatsAppResponse {
  messageId: string;
  status: 'sent' | 'failed' | 'fallback';
  timestamp: string;
}

async function sendWhatsAppAPI(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  const url = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const apiKey = process.env.EVOLUTION_API_KEY || 'dummy_key';

  const response = await fetch(`${url}/message/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: message.to,
      text: message.content,
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API error! status: ${response.status}`);
  }

  const data = await response.json() as any;

  return {
    messageId: data.key?.id || randomUUID(),
    status: 'sent',
    timestamp: new Date().toISOString(),
  };
}

const breaker = new CircuitBreaker(sendWhatsAppAPI, WHATSAPP_CIRCUIT_BREAKER_CONFIG);

breaker.fallback(() => {
  return {
    messageId: randomUUID(),
    status: 'fallback',
    timestamp: new Date().toISOString(),
  } as WhatsAppResponse;
});

breaker.on('open', () => infraLogger.error('[CIRCUIT_BREAKER] WhatsApp ABERTO'));
breaker.on('close', () => infraLogger.info('[CIRCUIT_BREAKER] WhatsApp FECHADO'));

export function sendMessage(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  return breaker.fire(message) as Promise<WhatsAppResponse>;
}

export function getWhatsAppCircuitStatus(): 'closed' | 'open' | 'halfOpen' {
  if (breaker.opened) return 'open';
  if (breaker.halfOpen) return 'halfOpen';
  return 'closed';
}
