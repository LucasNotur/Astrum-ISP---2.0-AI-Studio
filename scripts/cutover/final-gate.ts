/**
 * Final Gate — os 10 critérios do GATE FINAL (MAPA_SESSOES §Critérios). Plano Mestre
 * V2, S98. Puro e testável. Quando todos verdes: Astrum é um AI Engine setorial GA.
 */

export interface FinalGateSignals {
  tenISPsParallel: boolean;           // 10 ISPs em paralelo sem interferência
  legacyWorkersIntegrated: boolean;   // todos os workers legados na nova arquitetura
  autonomousResolutionOver80: boolean;
  zeroCobrancaJobsLost: boolean;      // 0% de jobs de cobrança perdidos
  absoluteTenantIsolation: boolean;   // RLS + Qdrant
  realtimeCostPerISP: boolean;        // custo IA por ISP em tempo real
  deployUnder5MinZeroDowntime: boolean;
  ragasAutomatedPerDeploy: boolean;
  docsComplete: boolean;
  syntheticMonitoring247: boolean;
}

export const FINAL_CRITERIA: { key: keyof FinalGateSignals; label: string }[] = [
  { key: 'tenISPsParallel', label: '10 ISPs em paralelo sem interferência' },
  { key: 'legacyWorkersIntegrated', label: 'Workers legados integrados à nova arquitetura' },
  { key: 'autonomousResolutionOver80', label: 'Taxa de resolução autônoma > 80%' },
  { key: 'zeroCobrancaJobsLost', label: '0% de jobs de cobrança perdidos' },
  { key: 'absoluteTenantIsolation', label: 'Isolamento absoluto entre ISPs (RLS + Qdrant)' },
  { key: 'realtimeCostPerISP', label: 'Custo IA por ISP em tempo real' },
  { key: 'deployUnder5MinZeroDowntime', label: 'Deploy < 5 min com 0 downtime' },
  { key: 'ragasAutomatedPerDeploy', label: 'RAGAS medido automaticamente a cada deploy' },
  { key: 'docsComplete', label: 'Documentação técnica completa' },
  { key: 'syntheticMonitoring247', label: 'Synthetic monitoring 24/7' },
];

export interface FinalGateResult {
  approved: boolean;
  passed: string[];
  pending: string[];
  score: string; // ex.: "7/10"
}

export function evaluateFinalGate(signals: Partial<FinalGateSignals>): FinalGateResult {
  const passed: string[] = [];
  const pending: string[] = [];
  for (const c of FINAL_CRITERIA) {
    (signals[c.key] === true ? passed : pending).push(c.label);
  }
  return {
    approved: pending.length === 0,
    passed,
    pending,
    score: `${passed.length}/${FINAL_CRITERIA.length}`,
  };
}
