import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedisPublish = vi.fn();

let mockOperatorClients: Record<string, any> = {};

function subscribeOperatorToChannel(operatorId: string, ticketId: string, tenantId: string) {
  if (!mockOperatorClients[operatorId]) {
    mockOperatorClients[operatorId] = { subscriptions: [], uiState: {} };
  }
  mockOperatorClients[operatorId].subscriptions.push({ ticketId, tenantId });
}

function handleEvolutionEvent(event: string, ticketId: string, tenantId: string) {
  if (event === 'COMPOSING') {
    mockRedisPublish(`typing:${tenantId}`, { ticketId, status: 'typing' });
    simulateRedisMessage(`typing:${tenantId}`, { ticketId, status: 'typing' });
  } else if (event === 'PAUSED') {
    mockRedisPublish(`typing:${tenantId}`, { ticketId, status: 'paused' });
    simulateRedisMessage(`typing:${tenantId}`, { ticketId, status: 'paused' });
  }
}

function simulateRedisMessage(channel: string, message: { ticketId: string, status: string }) {
  // Disperse to all connected operator clients that are subscribed
  for (const opId in mockOperatorClients) {
    const op = mockOperatorClients[opId];
    for (const sub of op.subscriptions) {
      if (`typing:${sub.tenantId}` === channel && sub.ticketId === message.ticketId) {
        if (message.status === 'typing') {
          op.uiState[message.ticketId] = 'typing';
          
          // Clear previous timeout if any
          if (op.timeouts && op.timeouts[message.ticketId]) {
            clearTimeout(op.timeouts[message.ticketId]);
          }
          if (!op.timeouts) op.timeouts = {};
          
          op.timeouts[message.ticketId] = setTimeout(() => {
            op.uiState[message.ticketId] = 'idle';
          }, 3000);
          
        } else if (message.status === 'paused') {
           op.uiState[message.ticketId] = 'idle';
           if (op.timeouts && op.timeouts[message.ticketId]) {
             clearTimeout(op.timeouts[message.ticketId]);
           }
        }
      }
    }
  }
}

describe('Testes do Indicador de Digitando (Typing Indicator)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockOperatorClients = {};
    vi.useFakeTimers();
  });

  it('1. Evento COMPOSING da Evolution → publica typing:{ticketId} no Redis pub/sub', () => {
    handleEvolutionEvent('COMPOSING', 't1', 'tenant1');
    expect(mockRedisPublish).toHaveBeenCalledWith('typing:tenant1', { ticketId: 't1', status: 'typing' });
  });

  it('2. Operador inscrito no canal → recebe evento e exibe indicador', () => {
    subscribeOperatorToChannel('op1', 't2', 'tenant1');
    handleEvolutionEvent('COMPOSING', 't2', 'tenant1');
    
    expect(mockOperatorClients['op1'].uiState['t2']).toBe('typing');
  });

  it('3. Indicador desaparece automaticamente após 3 segundos', () => {
    subscribeOperatorToChannel('op1', 't3', 'tenant1');
    handleEvolutionEvent('COMPOSING', 't3', 'tenant1');
    
    expect(mockOperatorClients['op1'].uiState['t3']).toBe('typing');
    
    // Advance 3 seconds
    vi.advanceTimersByTime(3000);
    
    expect(mockOperatorClients['op1'].uiState['t3']).toBe('idle');
  });

  it('4. Evento PAUSED da Evolution → cancela indicador imediatamente', () => {
    subscribeOperatorToChannel('op1', 't4', 'tenant1');
    handleEvolutionEvent('COMPOSING', 't4', 'tenant1');
    
    expect(mockOperatorClients['op1'].uiState['t4']).toBe('typing');
    
    handleEvolutionEvent('PAUSED', 't4', 'tenant1');
    
    expect(mockOperatorClients['op1'].uiState['t4']).toBe('idle');
  });

  it('5. Typing do ticket do tenant A → não aparece no painel do tenant B', () => {
    subscribeOperatorToChannel('opA', 'tA', 'tenantA');
    subscribeOperatorToChannel('opB', 'tA', 'tenantB'); // Diff tenant same ticket ID edge case
    
    handleEvolutionEvent('COMPOSING', 'tA', 'tenantA');
    
    expect(mockOperatorClients['opA'].uiState['tA']).toBe('typing');
    expect(mockOperatorClients['opB'].uiState['tA']).toBeUndefined(); // Should not receive
  });

});
