import { describe, it, expect } from 'vitest';
import { buildAgentBudgetReport, AgentBudgetPorts } from './agent-budget.service';

function makePorts(): AgentBudgetPorts {
  return {
    getAgentConfigs: async () => [
      { agentId: 'a1', agentName: 'Atendimento', monthlyTokenBudget: 1_000_000, monthlyDollarBudget: 50 },
      { agentId: 'a2', agentName: 'CobrAI', monthlyTokenBudget: 500_000, monthlyDollarBudget: 25 },
    ],
    getAgentUsage: async (_, agentId) => {
      if (agentId === 'a1') return { tokensUsed: 800_000, dollarSpent: 40, conversationCount: 200, avgTokensPerConversation: 4000 };
      return { tokensUsed: 600_000, dollarSpent: 30, conversationCount: 100, avgTokensPerConversation: 6000 };
    },
  };
}

describe('agent-budget.service', () => {
  it('calcula percentual de uso por agente', async () => {
    const report = await buildAgentBudgetReport('t1', '2026-07', makePorts());
    expect(report.agents).toHaveLength(2);
    expect(report.agents[0].tokenPct).toBe(80);
    expect(report.agents[0].dollarPct).toBe(80);
    expect(report.agents[0].overBudget).toBe(false);
  });

  it('marca overBudget quando excede', async () => {
    const report = await buildAgentBudgetReport('t1', '2026-07', makePorts());
    expect(report.agents[1].tokenPct).toBe(120);
    expect(report.agents[1].overBudget).toBe(true);
  });

  it('calcula totais corretamente', async () => {
    const report = await buildAgentBudgetReport('t1', '2026-07', makePorts());
    expect(report.totals.tokensUsed).toBe(1_400_000);
    expect(report.totals.dollarSpent).toBe(70);
    expect(report.totals.conversationCount).toBe(300);
  });

  it('retorna report vazio sem agentes', async () => {
    const ports: AgentBudgetPorts = {
      getAgentConfigs: async () => [],
      getAgentUsage: async () => ({ tokensUsed: 0, dollarSpent: 0, conversationCount: 0, avgTokensPerConversation: 0 }),
    };
    const report = await buildAgentBudgetReport('t1', '2026-07', ports);
    expect(report.agents).toHaveLength(0);
    expect(report.totals.tokensUsed).toBe(0);
  });
});
