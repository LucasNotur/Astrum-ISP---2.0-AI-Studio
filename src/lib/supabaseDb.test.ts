import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────
// vi.mock is hoisted — factory must be self-contained, no outer variables

vi.mock('./supabase', () => {
  const channelStub: any = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };

  const queryStub: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    // thenable so `await supabase.from('x').select('*')...` resolves
    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
  };

  return {
    supabase: {
      from: vi.fn(() => queryStub),
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
      },
      _stub: { query: queryStub, channel: channelStub },
    },
  };
});

vi.mock('./apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));
vi.mock('./apiAuth', () => ({
  getApiAccessToken: vi.fn().mockResolvedValue('tok-123'),
}));

import { supabase } from './supabase';
import { apiGet, apiPost } from './apiClient';
import {
  updateCustomer,
  createCustomer,
  updateTicketStatus,
  toggleTicketAI,
  createTicket,
  getMessages,
  sendMessage,
  createInvoice,
  logAudit,
  createTechnician,
  updateTechnician,
  getIntegrationKeys,
  getAiTokenLogs,
} from './supabaseDb';

// Helper to get the shared query stub
const q = () => (supabase as any)._stub.query as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Re-wire from() to always return the same stub so chained calls share state
  (supabase.from as any).mockReturnValue(q());
  // Default: single/maybeSingle return null, no error
  q().single.mockResolvedValue({ data: null, error: null });
  q().maybeSingle.mockResolvedValue({ data: null, error: null });
  // Default: eq returns the stub so further chaining works
  q().eq.mockReturnValue(q());
  q().update.mockReturnValue(q());
  q().insert.mockReturnValue(q());
  q().delete.mockReturnValue(q());
  q().select.mockReturnValue(q());
  q().order.mockReturnValue(q());
  q().limit.mockReturnValue(q());
  q().not.mockReturnValue(q());
  // Default thenable
  q().then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
});

// ─── Customers ────────────────────────────────────────────────────────────────

describe('updateCustomer', () => {
  it('calls update().eq() with correct args', async () => {
    await updateCustomer('cust-1', { name: 'Fulano' });
    expect(q().update).toHaveBeenCalledWith({ name: 'Fulano' });
    expect(q().eq).toHaveBeenCalledWith('id', 'cust-1');
  });
});

describe('createCustomer', () => {
  it('inserts and returns new id', async () => {
    q().single.mockResolvedValue({ data: { id: 'new-id' }, error: null });
    const id = await createCustomer({ name: 'Maria' });
    expect(id).toBe('new-id');
    expect(q().insert).toHaveBeenCalledWith({ name: 'Maria' });
  });

  it('throws on DB error', async () => {
    q().single.mockResolvedValue({ data: null, error: new Error('DB error') });
    await expect(createCustomer({})).rejects.toThrow('DB error');
  });
});

// ─── Tickets ──────────────────────────────────────────────────────────────────

describe('updateTicketStatus', () => {
  it('updates status field', async () => {
    await updateTicketStatus('t-1', 'closed');
    expect(q().update).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
    expect(q().eq).toHaveBeenCalledWith('id', 't-1');
  });

  it('adds resolved_at when status is resolved', async () => {
    await updateTicketStatus('t-2', 'resolved');
    const updateArg = (q().update as any).mock.calls[0][0];
    expect(updateArg).toHaveProperty('resolved_at');
    expect(typeof updateArg.resolved_at).toBe('string');
  });
});

describe('toggleTicketAI', () => {
  it('disables AI on ticket', async () => {
    await toggleTicketAI('t-3', false);
    expect(q().update).toHaveBeenCalledWith({ ai_enabled: false });
    expect(q().eq).toHaveBeenCalledWith('id', 't-3');
  });

  it('enables AI on ticket', async () => {
    await toggleTicketAI('t-4', true);
    expect(q().update).toHaveBeenCalledWith({ ai_enabled: true });
  });
});

describe('createTicket', () => {
  it('inserts with correct defaults and returns row', async () => {
    q().single.mockResolvedValue({ data: { id: 'tick-1', status: 'open' }, error: null });
    const data = await createTicket('cust-1', 'Internet lenta');
    expect(q().insert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 'cust-1',
      subject: 'Internet lenta',
      status: 'open',
      ai_enabled: true,
    }));
    expect(data).toMatchObject({ id: 'tick-1' });
  });
});

// ─── Messages ─────────────────────────────────────────────────────────────────
// F1-AUD/realtime-fix: `messages` não tem `ticket_id`/`sender_type`/`body` (nunca
// existiram — ver migration 116). getMessages/sendMessage agora passam por
// GET/POST /api/v2/tickets/:id/messages (apps/api) + WS real, não mais o
// supabase.from direto nem o socket.io-client morto.

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close() { this.closed = true; }
}
(globalThis as any).WebSocket = FakeWebSocket;

async function flushPromises() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('getMessages', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    (apiGet as any).mockReset();
  });

  it('busca via GET /api/v2/tickets/:id/messages e mapeia role/from_ai -> senderType', async () => {
    (apiGet as any).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [
        { id: 'm1', role: 'user', content: 'oi', from_ai: false, extra: {}, created_at: 't1' },
        { id: 'm2', role: 'assistant', content: 'oi cliente', from_ai: true, extra: {}, created_at: 't2' },
        { id: 'm3', role: 'assistant', content: 'resposta humana', from_ai: false, extra: { isInternal: true }, created_at: 't3' },
      ],
    });
    const cb = vi.fn();
    const unsub = getMessages('tick-1', cb);
    await flushPromises();

    expect(apiGet).toHaveBeenCalledWith('/api/v2/tickets/tick-1/messages');
    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1', senderType: 'customer' }),
      expect.objectContaining({ id: 'm2', senderType: 'ai' }),
      expect.objectContaining({ id: 'm3', senderType: 'human', is_internal: true }),
    ]);
    unsub();
  });

  it('abre WS pra conversationId e adiciona mensagens novas recebidas', async () => {
    (apiGet as any).mockResolvedValue({ conversationId: 'conv-2', messages: [] });
    const cb = vi.fn();
    const unsub = getMessages('tick-2', cb);
    await flushPromises();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('/ws/conversations/conv-2');
    expect(FakeWebSocket.instances[0].url).toContain('token=tok-123');

    FakeWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({ type: 'new_message', id: 'm9', role: 'assistant', content: 'nova', fromAi: false, timestamp: 't9' }),
    });

    expect(cb).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'm9', senderType: 'human', content: 'nova' }),
    ]);
    unsub();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });

  it('não duplica se a mensagem do WS já veio no fetch inicial', async () => {
    (apiGet as any).mockResolvedValue({
      conversationId: 'conv-3',
      messages: [{ id: 'm1', role: 'user', content: 'oi', from_ai: false, extra: {}, created_at: 't1' }],
    });
    const cb = vi.fn();
    getMessages('tick-3', cb);
    await flushPromises();
    cb.mockClear();

    FakeWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({ type: 'new_message', id: 'm1', role: 'user', content: 'oi', fromAi: false, timestamp: 't1' }),
    });

    expect(cb).not.toHaveBeenCalled();
  });
});

describe('sendMessage', () => {
  beforeEach(() => { (apiPost as any).mockReset(); });

  it('posta content/role pra /api/v2/tickets/:id/messages (não mais supabase.from direto)', async () => {
    (apiPost as any).mockResolvedValue({ message: { id: 'm-1' }, conversationId: 'conv-1' });
    const result = await sendMessage('tick-1', 'Olá', 'human');
    expect(apiPost).toHaveBeenCalledWith('/api/v2/tickets/tick-1/messages', expect.objectContaining({
      content: 'Olá',
      role: 'assistant',
      isInternal: false,
    }));
    expect(result).toEqual({ id: 'm-1' });
  });

  it('senderType "system" -> role "system" (log de auditoria)', async () => {
    (apiPost as any).mockResolvedValue({ message: { id: 'm-2' }, conversationId: 'conv-1' });
    await sendMessage('tick-1', 'log', 'system');
    expect(apiPost).toHaveBeenCalledWith('/api/v2/tickets/tick-1/messages', expect.objectContaining({ role: 'system' }));
  });

  it('includes attachment when provided', async () => {
    (apiPost as any).mockResolvedValue({ message: { id: 'm-3' }, conversationId: 'conv-1' });
    await sendMessage('tick-1', '', 'human', undefined, { url: 'http://x.com/f', type: 'image' });
    const body = (apiPost as any).mock.calls[0][1];
    expect(body.attachment).toMatchObject({ url: 'http://x.com/f', type: 'image' });
  });

  it('retorna null em erro (não lança — chamador decide o toast)', async () => {
    (apiPost as any).mockRejectedValue(new Error('500'));
    const result = await sendMessage('tick-1', 'x', 'human');
    expect(result).toBeNull();
  });
});

// ─── Invoices ─────────────────────────────────────────────────────────────────

describe('createInvoice', () => {
  it('inserts and returns id', async () => {
    q().single.mockResolvedValue({ data: { id: 'inv-1' }, error: null });
    const id = await createInvoice({ amount: 150 });
    expect(id).toBe('inv-1');
    expect(q().insert).toHaveBeenCalledWith({ amount: 150 });
  });
});

// ─── Audit ────────────────────────────────────────────────────────────────────

describe('logAudit', () => {
  it('inserts audit record with correct fields', async () => {
    await logAudit('CREATE_CUSTOMER', { name: 'João' }, 'tenant-1');
    expect(q().insert).toHaveBeenCalledWith({
      action: 'CREATE_CUSTOMER',
      details: { name: 'João' },
      tenant_id: 'tenant-1',
    });
  });
});

// ─── Technicians ──────────────────────────────────────────────────────────────

describe('createTechnician', () => {
  it('inserts technician with tenant_id and returns id', async () => {
    q().single.mockResolvedValue({ data: { id: 'tech-1' }, error: null });
    const id = await createTechnician({ name: 'Carlos' }, 'tenant-1');
    expect(id).toBe('tech-1');
    expect(q().insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-1' }));
  });
});

describe('updateTechnician', () => {
  it('calls update().eq() with correct args', async () => {
    await updateTechnician('tech-1', { phone: '11999' });
    expect(q().update).toHaveBeenCalledWith({ phone: '11999' });
    expect(q().eq).toHaveBeenCalledWith('id', 'tech-1');
  });
});

// ─── Integration Keys ─────────────────────────────────────────────────────────

describe('getIntegrationKeys', () => {
  it('returns empty object when tenantId is undefined', async () => {
    expect(await getIntegrationKeys(undefined)).toEqual({});
  });

  it('returns empty object for default tenantId', async () => {
    expect(await getIntegrationKeys('default')).toEqual({});
  });

  it('returns integration_keys from tenant row', async () => {
    q().maybeSingle.mockResolvedValue({
      data: { integration_keys: { openai: 'sk-123' } },
      error: null,
    });
    const keys = await getIntegrationKeys('tenant-1');
    expect(keys).toEqual({ openai: 'sk-123' });
  });

  it('returns empty object when tenant has no integration_keys', async () => {
    q().maybeSingle.mockResolvedValue({ data: { integration_keys: null }, error: null });
    const keys = await getIntegrationKeys('tenant-1');
    expect(keys).toEqual({});
  });
});

// ─── AI Token Logs ────────────────────────────────────────────────────────────

describe('getAiTokenLogs', () => {
  it('returns empty array when data is null', async () => {
    q().limit.mockResolvedValue({ data: null, error: null });
    const result = await getAiTokenLogs('tenant-1', 10);
    expect(result).toEqual([]);
  });

  it('returns rows when data exists', async () => {
    const rows = [{ id: 'log-1', tokens: 500 }];
    q().limit.mockResolvedValue({ data: rows, error: null });
    const result = await getAiTokenLogs('tenant-1', 10);
    expect(result).toEqual(rows);
  });
});
