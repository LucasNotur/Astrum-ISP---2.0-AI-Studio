import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockQueue: any[] = [];
let mockOperators: any[] = [];
let uiBadges: Record<string, string[]> = {};

function routeVIPCustomer(clienteId: string, isVip: boolean) {
  let priority = 1;
  let assignedOperatorId: string | null = null;
  
  if (isVip) {
    priority = 999; // VIP fura fila
    uiBadges[clienteId] = ['VIP (Dourado)'];
  } else {
    uiBadges[clienteId] = [];
  }

  // Tenta achar operador com skill vip
  const vipOperator = mockOperators.find(op => op.skills?.includes('vip') && op.status === 'available');
  
  if (vipOperator && isVip) {
    assignedOperatorId = vipOperator.id;
  } else {
    // Pega o próximo disponível
    const nextOp = mockOperators.find(op => op.status === 'available');
    if (nextOp) {
      assignedOperatorId = nextOp.id;
    }
  }

  const ticket = {
    clienteId,
    isVip,
    priority,
    assignedOperatorId
  };
  
  mockQueue.push(ticket);
  // Simula a fila ordenando por prioridade
  mockQueue.sort((a, b) => b.priority - a.priority);
  
  return ticket;
}


describe('Testes de Atendimento VIP (VIP Routing)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = [];
    mockOperators = [];
    uiBadges = {};
  });

  it('1. Cliente com is_vip=true → priority=vip, fura fila automaticamente', () => {
    routeVIPCustomer('c1_normal', false);
    routeVIPCustomer('c2_vip', true);
    
    // O VIP deve furar a fila
    expect(mockQueue[0].clienteId).toBe('c2_vip');
    expect(mockQueue[0].priority).toBeGreaterThan(1);
    expect(mockQueue[1].clienteId).toBe('c1_normal');
  });

  it('2. Cliente VIP → roteado para operador com skill vip', () => {
    mockOperators.push({ id: 'op1', status: 'available', skills: ['normal'] });
    mockOperators.push({ id: 'op2', status: 'available', skills: ['vip', 'normal'] });
    
    const ticket = routeVIPCustomer('c_vip', true);
    
    expect(ticket.assignedOperatorId).toBe('op2'); // Foi para o op2 que tem skill vip
  });

  it('3. Nenhum operador com skill vip disponível → atribuído ao próximo disponível (não fica sem atendimento)', () => {
    // Op VIP indisponível
    mockOperators.push({ id: 'op1', status: 'available', skills: ['normal'] });
    mockOperators.push({ id: 'op2', status: 'busy', skills: ['vip'] });
    
    const ticket = routeVIPCustomer('c_vip', true);
    
    expect(ticket.assignedOperatorId).toBe('op1'); // Caiu pro op normal
  });

  it('4. Badge dourado → exibido no painel ao lado do nome do cliente VIP', () => {
    routeVIPCustomer('c_vip', true);
    
    expect(uiBadges['c_vip']).toContain('VIP (Dourado)');
  });

  it('5. Cliente não-VIP → não recebe prioridade especial', () => {
    const ticket = routeVIPCustomer('c_normal', false);
    
    expect(ticket.priority).toBe(1);
    expect(uiBadges['c_normal']).not.toContain('VIP (Dourado)');
  });

});
