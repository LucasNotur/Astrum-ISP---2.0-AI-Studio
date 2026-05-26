import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockGoals: any[] = [];
let mockSales: any[] = [];

type CommisionConfig = 'proportional' | 'all_or_nothing';

function addGoal(tenantId: string, operatorId: string, month: string, targetValue: number, commissionRate: number, config: CommisionConfig) {
  mockGoals.push({ tenantId, operatorId, month, targetValue, commissionRate, config });
}

function addSale(tenantId: string, operatorId: string, month: string, value: number) {
  mockSales.push({ tenantId, operatorId, month, value });
}

function getOperatorGoalsAndCommissions(tenantId: string, month: string) {
  const tenantGoals = mockGoals.filter(g => g.tenantId === tenantId && g.month === month);
  const tenantSales = mockSales.filter(s => s.tenantId === tenantId && s.month === month);

  return tenantGoals.map(goal => {
    const operatorSales = tenantSales.filter(s => s.operatorId === goal.operatorId).reduce((sum, s) => sum + s.value, 0);
    const percentage = goal.targetValue > 0 ? (operatorSales / goal.targetValue) * 100 : 0;
    
    let commission = 0;
    if (goal.config === 'all_or_nothing') {
      if (percentage >= 100) {
        commission = operatorSales * goal.commissionRate;
      }
    } else if (goal.config === 'proportional') {
      commission = operatorSales * goal.commissionRate;
    }

    return {
      operatorId: goal.operatorId,
      targetValue: goal.targetValue,
      achievedValue: operatorSales,
      percentage,
      commission
    };
  });
}

function getOperatorCommission(tenantId: string, operatorId: string, month: string, config: CommisionConfig) {
    const goals = getOperatorGoalsAndCommissions(tenantId, month);
    const opGoal = goals.find(g => g.operatorId === operatorId);
    if (!opGoal) return null;
    return opGoal;
}

describe('Testes de Metas e Comissões (Operator Goals)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockGoals = [];
    mockSales = [];
  });

  it('1. Meta 100% atingida → comissão calculada corretamente', () => {
    addGoal('tenantA', 'op1', '2023-10', 1000, 0.1, 'all_or_nothing'); // 10% commission
    addSale('tenantA', 'op1', '2023-10', 1000); // 100%
    
    const result = getOperatorCommission('tenantA', 'op1', '2023-10', 'all_or_nothing');
    
    expect(result?.percentage).toBe(100);
    expect(result?.commission).toBe(100); // 1000 * 0.1
  });

  it('2. Meta 80% atingida → comissão proporcional ou zero (conforme configuração)', () => {
    // Proportional config
    addGoal('tenantA', 'op1', '2023-10', 1000, 0.1, 'proportional');
    addSale('tenantA', 'op1', '2023-10', 800); // 80%
    
    let result = getOperatorCommission('tenantA', 'op1', '2023-10', 'proportional');
    expect(result?.percentage).toBe(80);
    expect(result?.commission).toBe(80); // 800 * 0.1

    // All or nothing config
    addGoal('tenantA', 'op2', '2023-10', 1000, 0.1, 'all_or_nothing');
    addSale('tenantA', 'op2', '2023-10', 800); // 80%
    
    result = getOperatorCommission('tenantA', 'op2', '2023-10', 'all_or_nothing');
    expect(result?.percentage).toBe(80);
    expect(result?.commission).toBe(0); // Did not reach 100%
  });

  it('3. Meta do mês anterior → não interfere na meta do mês atual', () => {
    addGoal('tenantA', 'op1', '2023-09', 1000, 0.1, 'all_or_nothing');
    addSale('tenantA', 'op1', '2023-09', 1000); // Reached config in month 09
    
    addGoal('tenantA', 'op1', '2023-10', 1000, 0.1, 'all_or_nothing');
    addSale('tenantA', 'op1', '2023-10', 500); // Did not reach config in month 10
    
    const result09 = getOperatorCommission('tenantA', 'op1', '2023-09', 'all_or_nothing');
    const result10 = getOperatorCommission('tenantA', 'op1', '2023-10', 'all_or_nothing');
    
    expect(result09?.percentage).toBe(100);
    expect(result09?.commission).toBe(100);
    
    expect(result10?.percentage).toBe(50);
    expect(result10?.commission).toBe(0);
  });

  it('4. Metas do tenant A → não aparecem nas metas do tenant B', () => {
    addGoal('tenantA', 'op1', '2023-10', 1000, 0.1, 'proportional');
    addGoal('tenantB', 'op2', '2023-10', 2000, 0.2, 'proportional');
    
    const goalsB = getOperatorGoalsAndCommissions('tenantB', '2023-10');
    
    expect(goalsB.length).toBe(1);
    expect(goalsB[0].operatorId).toBe('op2');
    expect(goalsB.some(g => g.operatorId === 'op1')).toBe(false);
  });

  it('5. Operador sem meta configurada → não aparece como devendo comissão', () => {
    // Only sales, no goals configured
    addSale('tenantA', 'op3', '2023-10', 500);
    
    const result = getOperatorCommission('tenantA', 'op3', '2023-10', 'proportional');
    expect(result).toBeNull(); // No goal found, no commission logic applies
  });

});
