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

import { supabase } from './supabase';
import {
  updateCustomer,
  createCustomer,
  updateTicketStatus,
  toggleTicketAI,
  createTicket,
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

describe('sendMessage', () => {
  it('inserts message with correct fields', async () => {
    q().single.mockResolvedValue({ data: { id: 'm-1' }, error: null });
    await sendMessage('tick-1', 'Olá', 'human');
    expect(q().insert).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: 'tick-1',
      body: 'Olá',
      sender_type: 'human',
      category: null,
      attachment: null,
    }));
  });

  it('includes attachment when provided', async () => {
    q().single.mockResolvedValue({ data: { id: 'm-2' }, error: null });
    await sendMessage('tick-1', '', 'human', undefined, { url: 'http://x.com/f', type: 'image' });
    const insertArg = (q().insert as any).mock.calls[0][0];
    expect(insertArg.attachment).toMatchObject({ url: 'http://x.com/f', type: 'image' });
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
