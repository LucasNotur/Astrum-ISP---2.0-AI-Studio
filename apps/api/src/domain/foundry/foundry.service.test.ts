import { describe, it, expect, vi } from 'vitest';
import { createAutomation, activateAutomation, listAutomations, type FoundryPorts } from './foundry.service';

vi.mock('../../infrastructure/sandbox/sql-guard', () => ({
  validateSql: vi.fn(),
  SqlGuardError: class SqlGuardError extends Error {},
}));

const makeDb = (automations: any[] = []) => ({
  from: () => ({
    insert: (row: any) => ({
      select: () => ({ single: () => ({ data: { id: 'auto-1' }, error: null }) }),
    }),
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: () => ({ data: automations[0] ?? null, error: null }) }),
        order: () => ({ data: automations, error: null }),
      }),
      maybeSingle: () => ({ data: automations[0] ?? null, error: null }),
    }),
    update: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }),
  }),
} as any);

const makePorts = (override: Partial<FoundryPorts> = {}): FoundryPorts => ({
  db: makeDb(),
  generateAutomation: vi.fn().mockResolvedValue({
    name: 'Clientes churn risco alto',
    query: `SELECT id, name FROM customers WHERE tenant_id = 'ten-1' AND status = 'active' LIMIT 50`,
    schedule: '0 18 * * 5',
    templateName: 'churn_alert_v1',
    outputAction: 'send_whatsapp',
  }),
  ...override,
});

describe('D-16 Foundry createAutomation', () => {
  it('cria automação com status draft quando sql válido', async () => {
    const ports = makePorts();
    const result = await createAutomation('ten-1', 'clientes com churn alto toda sexta', 'user-1', ports);
    expect(result.automationId).toBe('auto-1');
    expect(result.validationPassed).toBe(true);
    expect(result.status).toBe('draft');
  });

  it('marca erro quando tabela não permitida no query', async () => {
    const ports = makePorts({
      generateAutomation: vi.fn().mockResolvedValue({
        name: 'Hack',
        query: `SELECT * FROM users WHERE tenant_id = 'x' LIMIT 10`,
        schedule: '0 9 * * 1',
        templateName: 'default',
        outputAction: 'list',
      }),
    });
    const result = await createAutomation('ten-1', 'dump users', 'user-1', ports);
    expect(result.validationPassed).toBe(false);
    expect(result.validationError).toContain('users');
    expect(result.status).toBe('error');
  });

  it('chama generateAutomation com o nl_prompt', async () => {
    const ports = makePorts();
    await createAutomation('ten-1', 'meu prompt', 'user-1', ports);
    expect(ports.generateAutomation).toHaveBeenCalledWith('meu prompt', 'ten-1');
  });
});

describe('D-16 Foundry activateAutomation', () => {
  it('ativa automação em draft', async () => {
    const ports = makePorts({
      db: makeDb([{ id: 'auto-1', status: 'draft', generated_query: 'SELECT 1' }]),
    });
    await expect(activateAutomation('ten-1', 'auto-1', ports)).resolves.not.toThrow();
  });

  it('rejeita automação com status error', async () => {
    const ports = makePorts({
      db: makeDb([{ id: 'auto-1', status: 'error' }]),
    });
    await expect(activateAutomation('ten-1', 'auto-1', ports)).rejects.toThrow('sql-guard');
  });
});

describe('D-16 Foundry listAutomations', () => {
  it('retorna lista do tenant', async () => {
    const ports = makePorts({
      db: makeDb([{ id: 'auto-1', name: 'Teste', status: 'active' }]),
    });
    const list = await listAutomations('ten-1', ports);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Teste');
  });
});
