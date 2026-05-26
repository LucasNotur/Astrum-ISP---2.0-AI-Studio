import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAssignTicket = vi.fn();
const mockSaveToFirestore = vi.fn();

let mockOperators: any[] = [];
let statusLogs: any[] = [];

async function processTicket(ticketId: string) {
  // Somente operadores online/Online recebem tickets
  const availableOps = mockOperators.filter(op => op.status === 'online' || op.status === 'Online');
  
  if (availableOps.length > 0) {
    const op = availableOps[0];
    await mockAssignTicket(ticketId, op.id);
    return { operatorId: op.id };
  }
  return { operatorId: undefined };
}

async function changeOperatorStatus(operatorId: string, newStatus: string) {
  const op = mockOperators.find(o => o.id === operatorId);
  if (op) {
    op.status = newStatus;
    const logEntry = {
      operator_id: operatorId,
      status: newStatus,
      timestamp: new Date().toISOString()
    };
    statusLogs.push(logEntry);
    await mockSaveToFirestore('status_logs', logEntry);
  }
}

function calculateTimeInStatus(operatorId: string, logs: any[], currentTime: Date) {
  let timeInStatus: Record<string, number> = {};
  
  // Cálculo simplificado
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.operator_id !== operatorId) continue;
    
    const startTime = new Date(log.timestamp).getTime();
    const endTime = i + 1 < logs.length && logs[i+1].operator_id === operatorId 
      ? new Date(logs[i+1].timestamp).getTime() 
      : currentTime.getTime();
      
    const durationMinutes = (endTime - startTime) / (1000 * 60);
    
    if (!timeInStatus[log.status]) {
      timeInStatus[log.status] = 0;
    }
    timeInStatus[log.status] += durationMinutes;
  }
  
  return timeInStatus;
}


describe('Testes de Status Multi-Estado (Operator Status)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockOperators = [];
    statusLogs = [];
  });

  it('1. Status Em Treinamento → operador não recebe novos tickets', async () => {
    mockOperators = [{ id: 'op1', status: 'Em Treinamento' }];
    const result = await processTicket('t1');
    expect(result.operatorId).toBeUndefined();
    expect(mockAssignTicket).not.toHaveBeenCalled();
  });

  it('2. Status Almoço → operador não recebe novos tickets', async () => {
    mockOperators = [{ id: 'op1', status: 'Almoço' }];
    const result = await processTicket('t2');
    expect(result.operatorId).toBeUndefined();
    expect(mockAssignTicket).not.toHaveBeenCalled();
  });

  it('3. Status Online → operador recebe tickets normalmente', async () => {
    mockOperators = [{ id: 'op1', status: 'Online' }];
    const result = await processTicket('t3');
    expect(result.operatorId).toBe('op1');
    expect(mockAssignTicket).toHaveBeenCalledWith('t3', 'op1');
  });

  it('4. Relatório de tempo por estado → calcula minutos em cada estado corretamente', () => {
    const now = new Date('2023-01-01T12:00:00Z');
    
    const logs = [
      { operator_id: 'op1', status: 'Online', timestamp: '2023-01-01T10:00:00Z' },
      { operator_id: 'op1', status: 'Almoço', timestamp: '2023-01-01T11:00:00Z' },
      { operator_id: 'op1', status: 'Online', timestamp: '2023-01-01T11:30:00Z' }
    ];
    
    const report = calculateTimeInStatus('op1', logs, now);
    
    // 10:00 as 11:00 = 60 mins (Online)
    // 11:00 as 11:30 = 30 mins (Almoço)
    // 11:30 as 12:00 = 30 mins (Online)
    
    expect(report['Online']).toBe(90);
    expect(report['Almoço']).toBe(30);
  });

  it('5. Mudança de status → registrada com timestamp no Firestore', async () => {
    mockOperators = [{ id: 'op1', status: 'Online' }];
    await changeOperatorStatus('op1', 'Em Reunião');
    
    expect(mockOperators[0].status).toBe('Em Reunião');
    expect(mockSaveToFirestore).toHaveBeenCalledWith('status_logs', expect.objectContaining({
      operator_id: 'op1',
      status: 'Em Reunião',
      timestamp: expect.any(String)
    }));
  });

});
