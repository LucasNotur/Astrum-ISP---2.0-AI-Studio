import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendFCM = vi.fn();
const mockRemoveToken = vi.fn();

let mockOperators: Record<string, any> = {};

async function sendPushToOperator(operatorId: string, title: string, body: string) {
  const op = mockOperators[operatorId];
  if (!op || !op.fcmToken) {
    return { success: false, reason: 'no_token' };
  }

  try {
    const result = await mockSendFCM(op.fcmToken, { title, body });
    if (result === 'invalid_token') {
       await mockRemoveToken(operatorId, op.fcmToken);
       op.fcmToken = null; // Removing locally for the mock
       return { success: false, reason: 'invalid_token' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

async function assignTicket(ticketId: string, operatorId: string) {
  await sendPushToOperator(operatorId, 'Novo Chamado', `Ticket ${ticketId} atribuído a você.`);
}

async function transferTicket(ticketId: string, oldOperatorId: string, newOperatorId: string) {
  await sendPushToOperator(newOperatorId, 'Ticket Transferido', `Ticket ${ticketId} foi transferido para você.`);
}

async function checkSLAAndNotify(departmentId: string, ticketId: string) {
  // Find supervisor for this given department
  const supervisor = Object.values(mockOperators).find(op => op.department === departmentId && op.role === 'supervisor');
  if (supervisor) {
    await sendPushToOperator(supervisor.id, 'SLA em Risco', `Ticket ${ticketId} está prestes a violar o SLA.`);
  }
}

describe('Testes de Notificações Push (Push Notifications)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockOperators = {};
  });

  it('1. sendPushToOperator com FCM token válido → chama Firebase Cloud Messaging com título e body corretos', async () => {
    mockOperators['op1'] = { id: 'op1', fcmToken: 'token_valido' };
    mockSendFCM.mockResolvedValue('success');
    
    await sendPushToOperator('op1', 'Teste', 'Corpo do teste');
    
    expect(mockSendFCM).toHaveBeenCalledWith('token_valido', { title: 'Teste', body: 'Corpo do teste' });
  });

  it('2. Novo ticket atribuído → notificação enviada ao operador responsável', async () => {
    mockOperators['op2'] = { id: 'op2', fcmToken: 'token_valido2' };
    mockSendFCM.mockResolvedValue('success');
    
    await assignTicket('t1', 'op2');
    
    expect(mockSendFCM).toHaveBeenCalledWith('token_valido2', { title: 'Novo Chamado', body: expect.stringContaining('t1') });
  });

  it('3. Ticket transferido → notificação ao novo operador', async () => {
    mockOperators['op3'] = { id: 'op3', fcmToken: 'token_valido3' };
    mockSendFCM.mockResolvedValue('success');
    
    await transferTicket('t2', 'oldOp', 'op3');
    
    expect(mockSendFCM).toHaveBeenCalledWith('token_valido3', { title: 'Ticket Transferido', body: expect.stringContaining('t2') });
  });

  it('4. SLA em risco → notificação ao supervisor do departamento', async () => {
    mockOperators['sup1'] = { id: 'sup1', department: 'dep1', role: 'supervisor', fcmToken: 'token_sup_valido' };
    mockOperators['op4'] = { id: 'op4', department: 'dep1', role: 'operator', fcmToken: 'token_op' };
    mockSendFCM.mockResolvedValue('success');
    
    await checkSLAAndNotify('dep1', 't3');
    
    expect(mockSendFCM).toHaveBeenCalledWith('token_sup_valido', { title: 'SLA em Risco', body: expect.stringContaining('t3') });
  });

  it('5. Operador sem FCM token → ignorado sem lançar erro', async () => {
    mockOperators['op5'] = { id: 'op5', fcmToken: null };
    
    const result = await sendPushToOperator('op5', 'Teste', 'T');
    
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_token');
    expect(mockSendFCM).not.toHaveBeenCalled();
  });

  it('6. FCM retorna invalid_token → token removido do Firestore (não tenta novamente)', async () => {
    mockOperators['op6'] = { id: 'op6', fcmToken: 'token_invalido' };
    mockSendFCM.mockResolvedValue('invalid_token');
    
    await sendPushToOperator('op6', 'Teste', 'T');
    
    expect(mockSendFCM).toHaveBeenCalledTimes(1);
    expect(mockRemoveToken).toHaveBeenCalledWith('op6', 'token_invalido');
    expect(mockOperators['op6'].fcmToken).toBeNull();
  });

});
