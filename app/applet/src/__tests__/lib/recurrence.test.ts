import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSaveToFirestore = vi.fn();
const mockRedisIncr = vi.fn();

let mockClosedTickets: any[] = [];
let mockQueue: any[] = [];
let uiBadges: Record<string, string[]> = {};

async function processNewTicket(ticketId: string, tenantId: string, clientId: string, requestTime: Date) {
  let isRecurrence = false;
  let priority = 1;
  const timeLimitMs = 24 * 60 * 60 * 1000; // 24h

  // Find last closed ticket for this client
  const clientClosedTickets = mockClosedTickets
    .filter(t => t.tenantId === tenantId && t.clientId === clientId)
    .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());

  if (clientClosedTickets.length > 0) {
    const lastClosed = clientClosedTickets[0];
    const timeSinceClosed = requestTime.getTime() - lastClosed.closedAt.getTime();
    
    if (timeSinceClosed > 0 && timeSinceClosed <= timeLimitMs) {
      isRecurrence = true;
    }
  }

  const dateStr = requestTime.toISOString().split('T')[0];

  if (isRecurrence) {
    priority = 2; // Increase priority in queue
    await mockRedisIncr(`recurrences:${tenantId}:${dateStr}`);
    uiBadges[ticketId] = ['Reincidência'];
  } else {
    uiBadges[ticketId] = [];
  }

  const newTicket = {
    ticketId,
    tenantId,
    clientId,
    recurrence: isRecurrence,
    priority,
    createdAt: requestTime
  };

  mockQueue.push(newTicket);
  mockQueue.sort((a, b) => b.priority - a.priority); // Higher priority first
  await mockSaveToFirestore('tickets', newTicket);

  return newTicket;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClosedTickets = [];
  mockQueue = [];
  uiBadges = {};
});

describe('Testes de Reincidência (Recurrence)', () => {

  it('1. Mesmo cliente com ticket fechado há 23h → novo ticket marcado recurrence=true', async () => {
    const closedTime = new Date('2023-01-01T10:00:00Z');
    const newTime = new Date('2023-01-02T09:00:00Z'); // 23h later

    mockClosedTickets.push({ ticketId: 't1', tenantId: 'tenant1', clientId: 'c1', closedAt: closedTime });

    const ticket = await processNewTicket('t2', 'tenant1', 'c1', newTime);

    expect(ticket.recurrence).toBe(true);
    expect(mockRedisIncr).toHaveBeenCalled();
  });

  it('2. Mesmo cliente com ticket fechado há 25h → NÃO marcado como reincidência', async () => {
    const closedTime = new Date('2023-01-01T10:00:00Z');
    const newTime = new Date('2023-01-02T11:00:00Z'); // 25h later

    mockClosedTickets.push({ ticketId: 't1', tenantId: 'tenant1', clientId: 'c1', closedAt: closedTime });

    const ticket = await processNewTicket('t2', 'tenant1', 'c1', newTime);

    expect(ticket.recurrence).toBe(false);
    expect(mockRedisIncr).not.toHaveBeenCalled();
  });

  it('3. Ticket reincidente → prioridade aumentada automaticamente na fila', async () => {
    const closedTime = new Date('2023-01-01T10:00:00Z');
    const newTimeC1 = new Date('2023-01-02T09:00:00Z'); // Recurrence
    const newTimeC2 = new Date('2023-01-02T08:00:00Z'); // Inserted earlier but not recurrence

    mockClosedTickets.push({ ticketId: 't1', tenantId: 'tenant1', clientId: 'c1', closedAt: closedTime });

    await processNewTicket('t2', 'tenant1', 'c2', newTimeC2); // Should have lower priority
    await processNewTicket('t3', 'tenant1', 'c1', newTimeC1); // Recurrence, should jump queue

    expect(mockQueue[0].clientId).toBe('c1');
    expect(mockQueue[0].priority).toBe(2);
    expect(mockQueue[1].clientId).toBe('c2');
    expect(mockQueue[1].priority).toBe(1);
  });

  it('4. Contador Redis recurrences:{tenantId}:{date} → incrementado apenas para reincidências reais', async () => {
    const closedTime = new Date('2023-01-01T10:00:00Z');
    
    mockClosedTickets.push({ ticketId: 't1', tenantId: 'tenant1', clientId: 'c1', closedAt: closedTime });

    // c1 is recurrence, c2 is not
    await processNewTicket('t2', 'tenant1', 'c2', new Date('2023-01-02T09:00:00Z'));
    await processNewTicket('t3', 'tenant1', 'c1', new Date('2023-01-02T09:00:00Z'));

    expect(mockRedisIncr).toHaveBeenCalledTimes(1);
    expect(mockRedisIncr).toHaveBeenCalledWith('recurrences:tenant1:2023-01-02');
  });

  it('5. Clientes diferentes com tickets no mesmo período → não interferem entre si', async () => {
    const closedTime = new Date('2023-01-01T10:00:00Z');
    
    mockClosedTickets.push({ ticketId: 't1', tenantId: 'tenant1', clientId: 'c1', closedAt: closedTime });

    const ticketC2 = await processNewTicket('t2', 'tenant1', 'c2', new Date('2023-01-02T09:00:00Z')); // within 23h, but different client
    
    expect(ticketC2.recurrence).toBe(false);
  });

  it('6. recurrence=true → badge Reincidência exibido no painel do operador', async () => {
    const closedTime = new Date('2023-01-01T10:00:00Z');
    
    mockClosedTickets.push({ ticketId: 't1', tenantId: 'tenant1', clientId: 'c1', closedAt: closedTime });
    
    await processNewTicket('t2', 'tenant1', 'c1', new Date('2023-01-02T09:00:00Z'));
    await processNewTicket('t3', 'tenant1', 'c2', new Date('2023-01-02T09:00:00Z'));

    expect(uiBadges['t2']).toContain('Reincidência');
    expect(uiBadges['t3']).not.toContain('Reincidência');
  });

});
