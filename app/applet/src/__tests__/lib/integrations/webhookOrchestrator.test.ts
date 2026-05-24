import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { 
  parseIXCEvent, 
  parseMKAuthEvent, 
  parseVoalleEvent,
  WebhookOrchestrator
} from '../../../lib/integrations/webhookOrchestrator';
import { redisClient } from '../../../lib/redis';

vi.mock('../../../lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
    setnx: vi.fn()
  }
}));

function signHmac(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('Webhook Orchestrator Tests', () => {
  let getTenantFn: import('vitest').Mock;
  let orchestrator: WebhookOrchestrator;
  
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantFn = vi.fn().mockResolvedValue({ id: 'tenant-1', hmacSecret: 'secret' });
    orchestrator = new WebhookOrchestrator(getTenantFn);
    vi.mocked(redisClient.setnx).mockResolvedValue(1);
  });

  it('1. parseIXCEvent com pagamento confirmado -> NormalizedEvent com type=PAYMENT_CONFIRMED', () => {
    const raw = {
      id: 'ixc_123',
      status: 'pago',
      cpf_cnpj: '12345678900',
      created_at: '2023-01-01'
    };
    const event = parseIXCEvent(raw);
    expect(event.type).toBe('PAYMENT_CONFIRMED');
    expect(event.event_id).toBe('ixc_123');
  });

  it('2. parseMKAuthEvent com bloqueio -> type=CUSTOMER_BLOCKED', () => {
    const raw = {
      uuid: 'mk_123',
      event: 'cliente_bloqueado',
      documento: '98765432100',
      data: '2023-01-01'
    };
    const event = parseMKAuthEvent(raw);
    expect(event.type).toBe('CUSTOMER_BLOCKED');
    expect(event.event_id).toBe('mk_123');
  });

  it('3. parseVoalleEvent -> normaliza para o mesmo schema NormalizedEvent dos outros parsers', () => {
    const raw = {
      message_id: 'voalle_123',
      event_type: 'payment',
      customer_document: '22233344455',
      timestamp: '2023-01-01'
    };
    const event = parseVoalleEvent(raw);
    expect(event.type).toBe('PAYMENT_CONFIRMED');
    expect(event.event_id).toBe('voalle_123');
  });

  it('4. Evento duplicado (mesmo event_id em 3600s) -> descartado via Redis NX', async () => {
    const rawBody = JSON.stringify({ id: 'ixc_dup', status: 'pago', cpf_cnpj: '111' });
    const signature = signHmac(rawBody, 'secret');
    vi.mocked(redisClient.setnx).mockResolvedValueOnce(0); // already exists

    const result = await orchestrator.processWebhook('tenant-1', { 'x-hub-signature': signature }, rawBody, parseIXCEvent);
    
    expect(result.status).toBe(200);
    expect(result.body).toBe('skipped:duplicate_event_id');
    expect(redisClient.setnx).toHaveBeenCalledWith('webhook_event:tenant-1:ixc_dup', '1');
  });

  it('5. Mesmo tipo+CPF em menos de 60s -> descartado como duplicata temporal', async () => {
    const rawBody = JSON.stringify({ id: 'ixc_rate', status: 'pago', cpf_cnpj: '111' });
    const signature = signHmac(rawBody, 'secret');
    
    // first setnx ok (event_id), second setnx fails (rate_limit)
    vi.mocked(redisClient.setnx).mockResolvedValueOnce(1); 
    vi.mocked(redisClient.setnx).mockResolvedValueOnce(0);

    const result = await orchestrator.processWebhook('tenant-1', { 'x-hub-signature': signature }, rawBody, parseIXCEvent);
    
    expect(result.status).toBe(200);
    expect(result.body).toBe('skipped:rate_limited');
    expect(redisClient.setnx).toHaveBeenCalledWith('webhook_rate:tenant-1:PAYMENT_CONFIRMED:111', '1');
  });

  it('6. HMAC inválido no webhook -> 401 sem processar payload', async () => {
    const rawBody = JSON.stringify({ id: 'ixc_hmac', status: 'pago', cpf_cnpj: '111' });
    const invalidSignature = 'invalid';

    const result = await orchestrator.processWebhook('tenant-1', { 'x-hub-signature': invalidSignature }, rawBody, parseIXCEvent);
    
    expect(result.status).toBe(401);
    expect(result.body).toBe('invalid_hmac');
    expect(redisClient.setnx).not.toHaveBeenCalled();
  });

  it('7. Tenant não encontrado -> 200 com skipped:unknown_tenant', async () => {
    getTenantFn.mockResolvedValueOnce(null);
    const rawBody = JSON.stringify({ id: 'ixc_tenant' });
    
    const result = await orchestrator.processWebhook('tenant-invalid', {}, rawBody, parseIXCEvent);
    
    expect(result.status).toBe(200);
    expect(result.body).toBe('skipped:unknown_tenant');
  });

  it('8. SCHEMA UNIFICADO: Todos os 3 parsers retornam schema IDÊNTICO de NormalizedEvent', () => {
    const ixcEvent = parseIXCEvent({ id: '1', status: 'pago', cpf_cnpj: '1', created_at: '2' });
    const mkAuthEvent = parseMKAuthEvent({ uuid: '1', event: 'cliente_bloqueado', documento: '1', data: '2' });
    const voalleEvent = parseVoalleEvent({ message_id: '1', event_type: 'payment', customer_document: '1', timestamp: '2' });

    const expectedKeys = ['event_id', 'type', 'cpf_cnpj', 'timestamp', 'payload'];
    
    expect(Object.keys(ixcEvent)).toEqual(expect.arrayContaining(expectedKeys));
    expect(Object.keys(mkAuthEvent)).toEqual(expect.arrayContaining(expectedKeys));
    expect(Object.keys(voalleEvent)).toEqual(expect.arrayContaining(expectedKeys));
  });
});
