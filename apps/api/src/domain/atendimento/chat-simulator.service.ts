/**
 * Dossiê #67 — Simulador/Testador Chatie no Admin.
 * Permite testar prompts/configs do agente IA sem enviar
 * para um cliente real. Simula conversa completa.
 */

export interface SimulationConfig {
  tenantId: string;
  systemPrompt?: string;
  persona?: string;
  temperature?: number;
  maxTurns: number;
}

export interface SimulationTurn {
  role: 'user' | 'assistant';
  content: string;
  tokensUsed: number;
  latencyMs: number;
  toolsUsed?: string[];
}

export interface SimulationResult {
  id: string;
  config: SimulationConfig;
  turns: SimulationTurn[];
  totalTokens: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  status: 'completed' | 'error' | 'max_turns';
  error?: string;
}

export interface SimulatorPorts {
  generateResponse: (tenantId: string, messages: Array<{ role: string; content: string }>, config: { systemPrompt?: string; temperature?: number }) => Promise<{ content: string; tokensUsed: number; toolsUsed: string[] }>;
}

export async function runSimulation(
  config: SimulationConfig,
  userMessages: string[],
  ports: SimulatorPorts,
): Promise<SimulationResult> {
  const turns: SimulationTurn[] = [];
  const history: Array<{ role: string; content: string }> = [];
  let totalTokens = 0;
  let totalLatency = 0;

  for (let i = 0; i < Math.min(userMessages.length, config.maxTurns); i++) {
    const userMsg = userMessages[i];
    history.push({ role: 'user', content: userMsg });
    turns.push({ role: 'user', content: userMsg, tokensUsed: 0, latencyMs: 0 });

    const start = Date.now();
    try {
      const response = await ports.generateResponse(config.tenantId, history, {
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
      });

      const latencyMs = Date.now() - start;
      history.push({ role: 'assistant', content: response.content });
      turns.push({ role: 'assistant', content: response.content, tokensUsed: response.tokensUsed, latencyMs, toolsUsed: response.toolsUsed });
      totalTokens += response.tokensUsed;
      totalLatency += latencyMs;
    } catch (err) {
      return {
        id: crypto.randomUUID(),
        config,
        turns,
        totalTokens,
        totalLatencyMs: totalLatency,
        avgLatencyMs: turns.filter((t) => t.role === 'assistant').length > 0
          ? Math.round(totalLatency / turns.filter((t) => t.role === 'assistant').length) : 0,
        status: 'error',
        error: (err as Error).message,
      };
    }
  }

  const assistantTurns = turns.filter((t) => t.role === 'assistant');
  return {
    id: crypto.randomUUID(),
    config,
    turns,
    totalTokens,
    totalLatencyMs: totalLatency,
    avgLatencyMs: assistantTurns.length > 0 ? Math.round(totalLatency / assistantTurns.length) : 0,
    status: userMessages.length >= config.maxTurns ? 'max_turns' : 'completed',
  };
}
