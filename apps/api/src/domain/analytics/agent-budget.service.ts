/**
 * Dossiê #26 — Tela de Consumo de Orçamento de Agentes IA.
 * Mostra quanto cada agente/prompt consome em tokens/custo
 * dentro do orçamento alocado pelo tenant.
 */

export interface AgentBudgetConfig {
  agentId: string;
  agentName: string;
  monthlyTokenBudget: number;
  monthlyDollarBudget: number;
}

export interface AgentUsage {
  agentId: string;
  agentName: string;
  tokensUsed: number;
  dollarSpent: number;
  conversationCount: number;
  avgTokensPerConversation: number;
}

export interface AgentBudgetReport {
  tenantId: string;
  period: string;
  agents: Array<AgentUsage & { tokenBudget: number; dollarBudget: number; tokenPct: number; dollarPct: number; overBudget: boolean }>;
  totals: { tokensUsed: number; dollarSpent: number; conversationCount: number };
}

export interface AgentBudgetPorts {
  getAgentConfigs: (tenantId: string) => Promise<AgentBudgetConfig[]>;
  getAgentUsage: (tenantId: string, agentId: string, month: string) => Promise<Omit<AgentUsage, 'agentId' | 'agentName'>>;
}

export async function buildAgentBudgetReport(
  tenantId: string,
  month: string,
  ports: AgentBudgetPorts,
): Promise<AgentBudgetReport> {
  const configs = await ports.getAgentConfigs(tenantId);
  const agents: AgentBudgetReport['agents'] = [];
  let totalTokens = 0;
  let totalDollars = 0;
  let totalConversations = 0;

  for (const cfg of configs) {
    const usage = await ports.getAgentUsage(tenantId, cfg.agentId, month);
    const tokenPct = cfg.monthlyTokenBudget > 0 ? Math.round((usage.tokensUsed / cfg.monthlyTokenBudget) * 100) : 0;
    const dollarPct = cfg.monthlyDollarBudget > 0 ? Math.round((usage.dollarSpent / cfg.monthlyDollarBudget) * 100) : 0;

    agents.push({
      agentId: cfg.agentId,
      agentName: cfg.agentName,
      ...usage,
      tokenBudget: cfg.monthlyTokenBudget,
      dollarBudget: cfg.monthlyDollarBudget,
      tokenPct,
      dollarPct,
      overBudget: tokenPct > 100 || dollarPct > 100,
    });

    totalTokens += usage.tokensUsed;
    totalDollars += usage.dollarSpent;
    totalConversations += usage.conversationCount;
  }

  return {
    tenantId,
    period: month,
    agents,
    totals: { tokensUsed: totalTokens, dollarSpent: totalDollars, conversationCount: totalConversations },
  };
}
