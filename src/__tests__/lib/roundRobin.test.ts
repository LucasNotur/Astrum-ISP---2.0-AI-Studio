import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findBestOperator, Ticket } from '../../lib/routingEngine';
import redisClient from '../../lib/redis';

const { counters, mockState } = vi.hoisted(() => ({
  counters: {} as Record<string, number>,
  mockState: {
    operators: [] as any[],
    departments: {} as Record<string, any>
  }
}));

vi.mock('../../lib/redis', () => ({
  default: {
    incr: vi.fn(async (key) => {
      counters[key] = (counters[key] || 0) + 1;
      return counters[key];
    })
  }
}));

vi.mock('../../lib/firebaseAdmin', () => {
  const operatorsRef = {
    where: vi.fn().mockReturnThis(),
    doc: vi.fn((id: string) => ({ id })),
  };

  const mockDbApi = {
    collection: vi.fn((colName: string) => {
      if (colName === 'tenants') {
        return {
          doc: (tenantId: string) => ({
            collection: (subCol: string) => {
              if (subCol === 'departments') {
                return {
                  doc: (deptId: string) => ({
                    get: async () => ({
                      exists: !!mockState.departments[deptId],
                      data: () => mockState.departments[deptId]
                    })
                  })
                };
              }
              if (subCol === 'operators') {
                return operatorsRef;
              }
              return { doc: vi.fn() };
            }
          })
        };
      }
      if (colName === 'tickets') {
          return {
              where: vi.fn().mockReturnThis(),
              count: vi.fn(() => ({
                  get: async () => ({ data: () => ({ count: 0 }) })
              }))
          }
      }
      return { doc: vi.fn() };
    }),
    runTransaction: vi.fn(async (cb: any) => {
      const transaction = {
        get: vi.fn(async (query: any) => {
          const matchingOps = mockState.operators.filter((op: any) => op.status === 'online');
          return {
            empty: matchingOps.length === 0,
            forEach: (fn: any) => matchingOps.forEach((op: any) => fn({
              id: op.id,
              data: () => op
            }))
          };
        }),
        update: vi.fn()
      };
      return cb(transaction);
    })
  };

  return {
    adminDb: mockDbApi,
    default: {
      firestore: {
        FieldValue: { serverTimestamp: () => 'ts' }
      }
    }
  };
});

describe('Round Robin Routing Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.operators = [];
    mockState.departments = {};
    for (const key in counters) delete counters[key];
  });

  it('1. 3 atribuicoes com 3 operadores - cada operador recebe exatamente 1 ticket', async () => {
    mockState.departments['dept1'] = { 
       id: 'dept1', name: 'Suporte', routing_mode: 'round_robin'
    };
    mockState.operators = [
      { id: 'op1', name: 'Alice', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1', skills: [] },
      { id: 'op2', name: 'Bob', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1', skills: [] },
      { id: 'op3', name: 'Charlie', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1', skills: [] }
    ];

    const ticket = { id: 't1', department_id: 'dept1', required_skills: [] };
    
    const r1 = await findBestOperator(ticket, 'tenant1');
    const r2 = await findBestOperator(ticket, 'tenant1');
    const r3 = await findBestOperator(ticket, 'tenant1');

    const assignedIds = [r1.operator?.id, r2.operator?.id, r3.operator?.id];
    expect(assignedIds.includes('op1')).toBe(true);
    expect(assignedIds.includes('op2')).toBe(true);
    expect(assignedIds.includes('op3')).toBe(true);
    expect(new Set(assignedIds).size).toBe(3);
  });

  it('2. 4a atribuicao - volta para o 1o operador (circular)', async () => {
    mockState.departments['dept1'] = { 
       id: 'dept1', name: 'Suporte', routing_mode: 'round_robin' 
    };
    mockState.operators = [
      { id: 'op1', name: 'Alice', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1', skills: [] },
      { id: 'op2', name: 'Bob', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1', skills: [] },
      { id: 'op3', name: 'Charlie', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1', skills: [] }
    ];

    const ticket = { id: 't2', department_id: 'dept1', required_skills: [] };
    
    const r1 = await findBestOperator(ticket, 'tenant1');
    await findBestOperator(ticket, 'tenant1');
    await findBestOperator(ticket, 'tenant1');
    const r4 = await findBestOperator(ticket, 'tenant1');

    expect(r1.operator?.id).toBe(r4.operator?.id);
  });

  it('3. Operador removido do departamento - round-robin recalcula sem ele', async () => {
    mockState.departments['dept1'] = { routing_mode: 'round_robin' };
    const ticket = { id: 't1', department_id: 'dept1', required_skills: [] };
    mockState.operators = [
      { id: 'op1', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' },
      { id: 'op2', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' }
    ];

    const r1 = await findBestOperator(ticket, 'tenant1');
    
    mockState.operators = [
      { id: 'op2', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' }
    ];

    const r2 = await findBestOperator(ticket, 'tenant1');
    const r3 = await findBestOperator(ticket, 'tenant1');

    expect(r2.operator?.id).toBe('op2');
    expect(r3.operator?.id).toBe('op2');
  });

  it('4. Todos operadores offline - retorna null sem lancar erro', async () => {
    mockState.departments['dept1'] = { routing_mode: 'round_robin' };
    mockState.operators = [
      { id: 'op1', status: 'offline', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' },
      { id: 'op2', status: 'busy', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' }
    ];

    const ticket = { id: 't1', department_id: 'dept1', required_skills: [] };
    const r = await findBestOperator(ticket, 'tenant1');
    
    expect(r.operator).toBeNull();
  });

  it('5. Contadores independentes por tenant (tenant A nao afeta B)', async () => {
    mockState.departments['dept1'] = { routing_mode: 'round_robin' };
    mockState.operators = [
      { id: 'op1', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' },
      { id: 'op2', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' }
    ];

    const ticket = { id: 't1', department_id: 'dept1', required_skills: [] };
    
    const rA1 = await findBestOperator(ticket, 'tenantA');
    const rB1 = await findBestOperator(ticket, 'tenantB');

    expect(rA1.operator?.id).toBe(rB1.operator?.id);
    expect(counters['rr_counter:tenantA:dept1']).toBe(1);
    expect(counters['rr_counter:tenantB:dept1']).toBe(1);
  });

  it('6. Admin alterna para skills-based - sem reiniciar o sistema', async () => {
    mockState.departments['dept1'] = { routing_mode: 'round_robin' };
    mockState.operators = [
      { id: 'op1', status: 'online', max_concurrent_chats: 5, current_chat_count: 4, department_id: 'dept1' },
      { id: 'op2', status: 'online', max_concurrent_chats: 5, current_chat_count: 0, department_id: 'dept1' }
    ];

    const ticket = { id: 't1', department_id: 'dept1', required_skills: [] };
    
    const r1 = await findBestOperator(ticket, 'tenant1');
    const r2 = await findBestOperator(ticket, 'tenant1');
    
    mockState.departments['dept1'].routing_mode = 'load_balanced';
    const r3 = await findBestOperator(ticket, 'tenant1');
    
    expect(r3.operator?.id).toBe('op2');
    
    const r4 = await findBestOperator(ticket, 'tenant1');
    expect(r4.operator?.id).toBe('op2');
  });
});
