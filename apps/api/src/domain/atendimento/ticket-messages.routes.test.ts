import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/adapters/conversation-db.adapter', () => ({
  getOrCreateConversation: vi.fn(),
}));
vi.mock('../realtime/websocket.routes', () => ({
  wsPublisher: { newMessage: vi.fn().mockResolvedValue(undefined) },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { getOrCreateConversation } from '../../infrastructure/adapters/conversation-db.adapter';
import { wsPublisher } from '../realtime/websocket.routes';
import { ticketMessagesRoutes } from './ticket-messages.routes';

const TICKET_ID = 'f7544310-4a28-4a91-8d0f-ba8939b37c83';
const CONV_ID = '8eb68a98-8979-417e-a006-afc8d4c1b4ea';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'update', 'insert', 'maybeSingle', 'single']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFromSequence(...terminals: Array<{ data: any; error: any }>) {
  const fromMock = supabaseAdmin.from as any;
  fromMock.mockReset();
  terminals.forEach((t) => fromMock.mockReturnValueOnce(makeChain(t)));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'operator' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any, reply: any) => {
    if (!user) return reply.status(401).send({ code: 'UNAUTHORIZED' });
    request.user = user;
  });
  await app.register(ticketMessagesRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/tickets/:id/messages', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('404 se o ticket não existe (ou não é do tenant)', async () => {
    mockFromSequence({ data: null, error: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v2/tickets/${TICKET_ID}/messages` });
    expect(res.statusCode).toBe(404);
  });

  it('ticket sem conversation_id -> cria conversa lazy (pra já ter canal WS pronto) antes de listar', async () => {
    (getOrCreateConversation as any).mockResolvedValue(CONV_ID);
    mockFromSequence(
      { data: { id: TICKET_ID, customer_id: 'cust-1', conversation_id: null }, error: null },
      { data: null, error: null }, // update linkando conversation_id no ticket
      { data: [], error: null },   // messages (vazio, conversa recém-criada)
    );
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v2/tickets/${TICKET_ID}/messages` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ messages: [], conversationId: CONV_ID });
    const updateChain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(updateChain.update).toHaveBeenCalledWith({ conversation_id: CONV_ID });
  });

  it('busca messages por conversation_id (não por ticket_id, que não existe)', async () => {
    const rows = [{ id: 'm1', role: 'user', content: 'oi', from_ai: false, extra: {}, created_at: 't' }];
    mockFromSequence(
      { data: { id: TICKET_ID, customer_id: 'cust-1', conversation_id: CONV_ID }, error: null },
      { data: rows, error: null },
    );
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/api/v2/tickets/${TICKET_ID}/messages` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ messages: rows, conversationId: CONV_ID });
    const messagesChain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(messagesChain.eq).toHaveBeenCalledWith('conversation_id', CONV_ID);
  });
});

describe('POST /api/v2/tickets/:id/messages', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ticket já tem conversation_id -> grava direto, sem criar conversa nova', async () => {
    const saved = { id: 'm2', role: 'assistant', content: 'oi cliente', from_ai: false, extra: {}, created_at: 't' };
    mockFromSequence(
      { data: { id: TICKET_ID, customer_id: 'cust-1', conversation_id: CONV_ID }, error: null },
      { data: saved, error: null },
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v2/tickets/${TICKET_ID}/messages`,
      payload: { content: 'oi cliente' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ message: saved, conversationId: CONV_ID });
    expect(getOrCreateConversation).not.toHaveBeenCalled();
    expect(wsPublisher.newMessage).toHaveBeenCalledWith(
      'tenant-1', CONV_ID, expect.objectContaining({ id: 'm2', content: 'oi cliente' }),
    );
  });

  it('ticket sem conversation_id -> cria conversa (lazy) e liga no ticket antes de gravar', async () => {
    (getOrCreateConversation as any).mockResolvedValue(CONV_ID);
    const saved = { id: 'm3', role: 'assistant', content: 'primeira msg', from_ai: false, extra: {}, created_at: 't' };
    mockFromSequence(
      { data: { id: TICKET_ID, customer_id: 'cust-1', conversation_id: null }, error: null },
      { data: null, error: null }, // update linkando conversation_id no ticket
      { data: saved, error: null },
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v2/tickets/${TICKET_ID}/messages`,
      payload: { content: 'primeira msg' },
    });

    expect(res.statusCode).toBe(201);
    expect(getOrCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', customerId: 'cust-1' }),
    );
    const updateChain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(updateChain.update).toHaveBeenCalledWith({ conversation_id: CONV_ID });
  });

  it('nota interna vai em extra.isInternal (não existe coluna is_internal)', async () => {
    const saved = { id: 'm4', role: 'assistant', content: 'nota', from_ai: false, extra: { isInternal: true, attachment: null }, created_at: 't' };
    mockFromSequence(
      { data: { id: TICKET_ID, customer_id: 'cust-1', conversation_id: CONV_ID }, error: null },
      { data: saved, error: null },
    );
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: `/api/v2/tickets/${TICKET_ID}/messages`,
      payload: { content: 'nota', isInternal: true },
    });

    const messagesChain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(messagesChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ extra: { isInternal: true, attachment: null } }),
    ]);
  });

  it('role=system pra log de auditoria', async () => {
    const saved = { id: 'm5', role: 'system', content: 'IA reativada', from_ai: false, extra: {}, created_at: 't' };
    mockFromSequence(
      { data: { id: TICKET_ID, customer_id: 'cust-1', conversation_id: CONV_ID }, error: null },
      { data: saved, error: null },
    );
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: `/api/v2/tickets/${TICKET_ID}/messages`,
      payload: { content: 'IA reativada', role: 'system' },
    });

    const messagesChain = (supabaseAdmin.from as any).mock.results[1].value;
    expect(messagesChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'system' }),
    ]);
  });

  it('rejeita role=user (reservado pro pipeline de IA, não pro operador)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v2/tickets/${TICKET_ID}/messages`,
      payload: { content: 'x', role: 'user' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 se o ticket não existe', async () => {
    mockFromSequence({ data: null, error: null });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v2/tickets/${TICKET_ID}/messages`,
      payload: { content: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});
