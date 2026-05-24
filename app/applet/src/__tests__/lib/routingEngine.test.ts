import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutingEngine, Operator, Ticket } from '../../../src/lib/routingEngine';
import { redisClient } from '../../../src/lib/redis';

vi.mock('../../../src/lib/redis', () => ({
  redisClient: {
    setnx: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  }
}));

describe('Routing Engine Tests', () => {
  let operators: Operator[];
  let operatorsFetcher: import('vitest').Mock;
  let engine: RoutingEngine;
  let lockMap: Map<string, boolean>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    lockMap = new Map();
    vi.mocked(redisClient.setnx).mockImplementation(async (key: string) => {
      if (!lockMap.get(key)) {
        lockMap.set(key, true);
        return 1;
      }
      return 0;
    });
    vi.mocked(redisClient.del).mockImplementation(async (key: string) => {
      lockMap.delete(key);
      return 1;
    });

    operators = [
      { id: 'op1', tenant_id: 't1', status: 'online', max_chats: 5, current_chat_count: 2, skills: ['tech'], last_assigned_at: 100 },
      { id: 'op2', tenant_id: 't1', status: 'online', max_chats: 5, current_chat_count: 1, skills: ['billing'], last_assigned_at: 200 },
      { id: 'op3', tenant_id: 't1', status: 'online', max_chats: 5, current_chat_count: 3, skills: ['tech', 'billing'], last_assigned_at: 300 },
    ];

    operatorsFetcher = vi.fn().mockImplementation(async () => operators);
    engine = new RoutingEngine(operatorsFetcher);
  });

  it('1. findBestOperator com 3 disponíveis -> retorna o com menor current_chat_count', async () => {
    const best = await engine.findBestOperator('t1');
    expect(best?.id).toBe('op2'); // op2 has 1 chat
  });

  it('2. findBestOperator com todos no limite máximo -> retorna null (fila de espera)', async () => {
    operators.forEach(o => o.current_chat_count = o.max_chats);
    const best = await engine.findBestOperator('t1');
    expect(best).toBeNull();
  });

  it('3. findBestOperator filtrando por skill -> operador sem a skill não é retornado', async () => {
    const best = await engine.findBestOperator('t1', 'tech');
    // op1 has 2, op3 has 3. so op1 should be selected. op2 has 1 but no 'tech' skill.
    expect(best?.id).toBe('op1');
  });

  it('4. Atribuição simultânea (race condition via Promise.all) -> apenas 1 operador recebe o ticket', async () => {
    // Both try to assign ticket. They see op2 is best.
    // The lock prevents the second one from getting op2 as having 1 chat if it updates first.
    // Actually the mock returns the *same* array by reference, so the first success modifies `current_chat_count`
    // Before releasing the lock. The second call waiting for lock will then see updated count.
    
    vi.mocked(redisClient.setnx).mockImplementation(async (key: string) => {
      if (!lockMap.get(key)) {
        lockMap.set(key, true);
        return 1;
      }
      return 0;
    });

    const results = await Promise.all([
      engine.assignTicket('t1', 'ticket1'),
      engine.assignTicket('t1', 'ticket2')
    ]);

    const allocatedOps = results.map(r => r?.id);
    expect(allocatedOps).toContain('op2'); // First one gets op2
    expect(allocatedOps).toContain('op1'); // Second one gets op1 (because op2 will have 2 chats and op1 also has 2, but op1 has older last_assigned_at)
    
    expect(operators.find(o => o.id === 'op2')?.current_chat_count).toBe(2);
    expect(operators.find(o => o.id === 'op1')?.current_chat_count).toBe(3);
  });

  it('5. Round-robin: 3 atribuições consecutivas com 3 operadores -> 1 para cada', async () => {
    // Make them equal initially
    operators[0].current_chat_count = 0; operators[0].last_assigned_at = 100;
    operators[1].current_chat_count = 0; operators[1].last_assigned_at = 200;
    operators[2].current_chat_count = 0; operators[2].last_assigned_at = 300;

    const opA = await engine.assignTicket('t1', 'tA');
    const opB = await engine.assignTicket('t1', 'tB');
    const opC = await engine.assignTicket('t1', 'tC');

    expect(opA?.id).toBe('op1');
    expect(opB?.id).toBe('op2');
    expect(opC?.id).toBe('op3');

    // Each should now have 1 chat
    expect(operators.every(o => o.current_chat_count === 1)).toBe(true);
  });

  it('6. Operador offline -> não recebe ticket independente da carga', async () => {
    operators[1].status = 'offline'; // the best one is now offline
    const best = await engine.findBestOperator('t1');
    expect(best?.id).toBe('op1'); // next best
  });

  it('7. SLA de 30min violado -> sla_breached=true e prioridade=urgent', () => {
    const ticket: Ticket = {
      id: 'tk1', tenant_id: 't1', priority: 'normal',
      created_at: 1000, snooze_duration_ms: 0, sla_breached: false
    };

    const currentTimeMs = 1000 + (31 * 60 * 1000); // 31 minutes active
    const evaluated = engine.evaluateSLA(ticket, currentTimeMs);

    expect(evaluated.sla_breached).toBe(true);
    expect(evaluated.priority).toBe('urgent');
  });

  it('8. Ticket em snooze -> tempo de snooze não conta no cálculo do SLA', () => {
    const ticket: Ticket = {
      id: 'tk1', tenant_id: 't1', priority: 'normal',
      created_at: 1000, 
      snooze_duration_ms: 5 * 60 * 1000, // 5 min snoozed
      sla_breached: false
    };

    const currentTimeMs = 1000 + (31 * 60 * 1000); // 31 mins elapsed total
    // But active time is 31 - 5 = 26 mins, which is < 30 mins
    
    const evaluated = engine.evaluateSLA(ticket, currentTimeMs);

    expect(evaluated.sla_breached).toBe(false);
    expect(evaluated.priority).toBe('normal');
  });
});
