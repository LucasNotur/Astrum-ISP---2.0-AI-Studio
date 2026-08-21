import { describe, it, expect, vi } from 'vitest';
import { askCopilot, type OwnerCopilotPorts } from './owner-copilot.service';

vi.mock('../../adapters/openai/openai.adapter', () => ({
  callOpenAI: vi.fn(),
}));

vi.mock('../../infrastructure/sandbox/sql-guard', () => ({
  validateSql: vi.fn(),
  SqlGuardError: class SqlGuardError extends Error { constructor(msg: string) { super(msg); } },
}));

const { callOpenAI } = await import('../../adapters/openai/openai.adapter');

const makePorts = (data: any[] = []): OwnerCopilotPorts => ({
  db: {} as any,
  runSafeQuery: vi.fn().mockResolvedValue(data),
});

describe('D-20 owner-copilot', () => {
  it('retorna resposta com dados quando SQL válido', async () => {
    vi.mocked(callOpenAI)
      .mockResolvedValueOnce({
        content: JSON.stringify({
          answer: 'Você tem 120 clientes ativos.',
          sql: "SELECT count(*) FROM customers WHERE tenant_id = 'ten-1' AND status = 'active'",
          action: { type: 'none', label: '' },
        }),
      } as any)
      .mockResolvedValueOnce({
        content: 'Você tem 120 clientes ativos no plano analisado.',
      } as any);

    const ports = makePorts([{ count: 120 }]);
    const result = await askCopilot('ten-1', 'Quantos clientes ativos tenho?', ports);
    expect(result.answer).toContain('120');
    expect(result.sqlUsed).toBeTruthy();
    expect(result.data).toHaveLength(1);
  });

  it('retorna resposta sem SQL quando pergunta não precisa de dados', async () => {
    vi.mocked(callOpenAI).mockResolvedValueOnce({
      content: JSON.stringify({
        answer: 'Para abrir em um novo bairro, avalie a saturação das CTOs vizinhas.',
        sql: null,
        action: { type: 'open_foundry', label: 'Criar automação de viabilidade' },
      }),
    } as any);

    const ports = makePorts([]);
    const result = await askCopilot('ten-1', 'Vale a pena abrir no Jardim América?', ports);
    expect(result.answer).toContain('CTOs');
    expect(result.sqlUsed).toBeUndefined();
    expect(result.actionSuggested?.type).toBe('open_foundry');
  });

  it('bloqueia SQL inválido via sql-guard', async () => {
    const { validateSql, SqlGuardError } = await import('../../infrastructure/sandbox/sql-guard');
    vi.mocked(validateSql).mockImplementationOnce(() => {
      throw new (SqlGuardError as any)('DML não permitido');
    });
    vi.mocked(callOpenAI).mockResolvedValueOnce({
      content: JSON.stringify({
        answer: 'resposta inicial',
        sql: "DELETE FROM customers WHERE 1=1",
        action: { type: 'none', label: '' },
      }),
    } as any);

    const ports = makePorts([]);
    const result = await askCopilot('ten-1', 'apaga tudo', ports);
    expect(result.answer).toContain('validador de segurança');
    expect(result.data).toBeUndefined();
    expect(ports.runSafeQuery).not.toHaveBeenCalled();
  });

  it('lida com JSON malformado do LLM', async () => {
    vi.mocked(callOpenAI).mockResolvedValueOnce({
      content: 'Sua inadimplência subiu por sazonalidade.',
    } as any);

    const ports = makePorts([]);
    const result = await askCopilot('ten-1', 'Por que meu churn subiu?', ports);
    expect(result.answer).toBeTruthy();
  });
});
