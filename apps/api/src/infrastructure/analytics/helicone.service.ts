/**
 * Helper para buscar métricas de custo do Helicone via API.
 * Usado pelo endpoint /api/v2/analytics/ai-costs para dados reais.
 */

interface HeliconeMetrics {
  totalRequests: number;
  totalTokens: number;
  estimatedCostUsd: number;
  tenantId: string;
  period: string;
}

export async function getHeliconeMetrics(
  tenantId: string,
  days: number
): Promise<HeliconeMetrics | null> {
  if (!process.env.HELICONE_API_KEY) {
    return null; // Helicone não configurado
  }

  try {
    const response = await fetch('https://www.helicone.ai/api/request/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HELICONE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          properties: { TenantId: { equals: tenantId } },
          createdAt: { gte: new Date(Date.now() - days * 86400000).toISOString() },
        },
        aggregations: ['total_requests', 'total_tokens', 'total_cost'],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as any;

    return {
      tenantId,
      period: `${days}d`,
      totalRequests: data.total_requests ?? 0,
      totalTokens: data.total_tokens ?? 0,
      estimatedCostUsd: data.total_cost ?? 0,
    };
  } catch {
    return null; // Falha silenciosa — Helicone é observabilidade, não core
  }
}
