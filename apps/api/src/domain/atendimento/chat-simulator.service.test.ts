import { describe, it, expect, vi } from 'vitest';
import { runSimulation, SimulationConfig, SimulatorPorts } from './chat-simulator.service';

function makePorts(): SimulatorPorts {
  return {
    generateResponse: vi.fn().mockResolvedValue({
      content: 'Olá! Como posso ajudar?',
      tokensUsed: 50,
      toolsUsed: [],
    }),
  };
}

const CONFIG: SimulationConfig = {
  tenantId: 't1',
  systemPrompt: 'Você é o assistente da ISP Teste.',
  maxTurns: 5,
};

describe('chat-simulator.service', () => {
  it('executa simulação com múltiplos turnos', async () => {
    const result = await runSimulation(CONFIG, ['Oi', 'Qual meu plano?'], makePorts());
    expect(result.status).toBe('completed');
    expect(result.turns).toHaveLength(4);
    expect(result.turns[0].role).toBe('user');
    expect(result.turns[1].role).toBe('assistant');
    expect(result.totalTokens).toBe(100);
  });

  it('respeita maxTurns', async () => {
    const config = { ...CONFIG, maxTurns: 1 };
    const result = await runSimulation(config, ['Oi', 'Tchau'], makePorts());
    expect(result.status).toBe('max_turns');
    expect(result.turns).toHaveLength(2);
  });

  it('captura erro sem crashar', async () => {
    const ports = makePorts();
    (ports.generateResponse as any).mockRejectedValue(new Error('API timeout'));
    const result = await runSimulation(CONFIG, ['Oi'], ports);
    expect(result.status).toBe('error');
    expect(result.error).toBe('API timeout');
  });

  it('calcula avgLatencyMs', async () => {
    const result = await runSimulation(CONFIG, ['Oi'], makePorts());
    expect(result.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.avgLatencyMs).toBe('number');
  });

  it('retorna completed sem mensagens', async () => {
    const result = await runSimulation(CONFIG, [], makePorts());
    expect(result.status).toBe('completed');
    expect(result.turns).toHaveLength(0);
  });
});
