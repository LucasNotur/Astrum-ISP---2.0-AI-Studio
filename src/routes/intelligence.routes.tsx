import React, { lazy, Suspense } from 'react';
import { Route, Navigate, useLocation } from 'react-router-dom';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';

const IntelligenceHubPage  = lazy(() => import('../pages/intelligence/IntelligenceHubPage'));
const ToolsPage            = lazy(() => import('../pages/intelligence/ToolsPage'));
const GuardrailsPage       = lazy(() => import('../pages/intelligence/GuardrailsPage'));
const NetworkGraphPage     = lazy(() => import('../pages/intelligence/NetworkGraphPage'));
const FeaturesPage         = lazy(() => import('../pages/intelligence/FeaturesPage'));
const CampaignsPage        = lazy(() => import('../pages/intelligence/CampaignsPage'));
const DriftPage            = lazy(() => import('../pages/intelligence/DriftPage'));
const SyntheticPage        = lazy(() => import('../pages/intelligence/SyntheticPage'));
const ReplayPage           = lazy(() => import('../pages/intelligence/ReplayPage'));
const ChurnPage            = lazy(() => import('../pages/intelligence/ChurnPage'));
const SandboxPage          = lazy(() => import('../pages/intelligence/SandboxPage'));
const ModelsPage           = lazy(() => import('../pages/intelligence/ModelsPage'));
const LabelingPage         = lazy(() => import('../pages/intelligence/LabelingPage'));
const ReviewQueuePage      = lazy(() => import('../pages/intelligence/ReviewQueuePage'));
const McpPage              = lazy(() => import('../pages/intelligence/McpPage'));
const NetworkHealthPage    = lazy(() => import('../pages/intelligence/NetworkHealthPage'));
const StaffingPage         = lazy(() => import('../pages/intelligence/StaffingPage'));
const VoiceQaPage          = lazy(() => import('../pages/intelligence/VoiceQaPage'));
const ReflectionsPage      = lazy(() => import('../pages/intelligence/ReflectionsPage'));
const IncidentsPage        = lazy(() => import('../pages/intelligence/IncidentsPage'));
const GenesisReportPage    = lazy(() => import('../pages/intelligence/GenesisReportPage'));
const PolicyLabPage        = lazy(() => import('../pages/intelligence/PolicyLabPage'));
const CfoPage              = lazy(() => import('../pages/intelligence/CfoPage'));
const NetworkTwinPage      = lazy(() => import('../pages/intelligence/NetworkTwinPage'));

const fallback = <div className="p-10 text-center text-muted-foreground">Carregando...</div>;

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

// F3-01 — mapa rota → flag (espelha o BRANCH_REGISTRY do IntelligenceHubPage).
// O hub `/intelligence` NÃO está no mapa: passa direto e se auto-esvazia via flags.
const ROUTE_FLAG: Record<string, string> = {
  '/intelligence/tools': 'toolreg',
  '/intelligence/guardrails': 'safety',
  '/intelligence/graph': 'graphrag',
  '/intelligence/features': 'features',
  '/intelligence/campaigns': 'bandit',
  '/intelligence/drift': 'drift',
  '/intelligence/synthetic': 'synthdata',
  '/intelligence/replay': 'replay',
  '/intelligence/churn': 'churn',
  '/intelligence/models': 'elo',
  '/intelligence/labeling': 'activelearn',
  '/intelligence/review-queue': 'reviewqueue',
  '/intelligence/mcp': 'mcp',
  '/intelligence/network-health': 'netanomaly',
  '/intelligence/staffing': 'forecast',
  '/intelligence/voice-qa': 'voiceqa',
  '/intelligence/sandbox': 'sandbox',
  '/intelligence/reflections': 'reflections',
  '/intelligence/incidents': 'incidents',
  '/intelligence/genesis': 'genesis',
  '/intelligence/policy-lab': 'policylab',
  '/intelligence/cfo': 'cfo',
  '/intelligence/twin': 'twin',
};

/**
 * F3-01 — guard de rota do lab de Inteligência. A flag por branch já escondia a
 * NAVEGAÇÃO (sidebar/hub), mas um URL direto (`/intelligence/drift`) abria a página.
 * `G` protege a ROTA: sem a flag da branch → redireciona pra /home; fail-closed
 * durante o loading das flags (não vaza nem redireciona). Rotas fora do mapa (o hub)
 * passam direto.
 */
export function G({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { flags, isLoading } = useFeatureFlags();
  const flagKey = ROUTE_FLAG[location.pathname];
  if (!flagKey) return <>{children}</>;         // hub / rota sem flag → passa
  if (isLoading) return null;                   // fail-closed: não decide durante loading
  if (flags[flagKey] === true) return <>{children}</>;
  return <Navigate to="/home" replace />;
}

export function intelligenceRoutes() {
  return (
    <>
      <Route path="/intelligence"               element={<G><S><IntelligenceHubPage /></S></G>} />
      <Route path="/intelligence/tools"         element={<G><S><ToolsPage /></S></G>} />
      <Route path="/intelligence/guardrails"    element={<G><S><GuardrailsPage /></S></G>} />
      <Route path="/intelligence/graph"         element={<G><S><NetworkGraphPage /></S></G>} />
      <Route path="/intelligence/features"      element={<G><S><FeaturesPage /></S></G>} />
      <Route path="/intelligence/campaigns"     element={<G><S><CampaignsPage /></S></G>} />
      <Route path="/intelligence/drift"         element={<G><S><DriftPage /></S></G>} />
      <Route path="/intelligence/synthetic"     element={<G><S><SyntheticPage /></S></G>} />
      <Route path="/intelligence/replay"        element={<G><S><ReplayPage /></S></G>} />
      <Route path="/intelligence/churn"         element={<G><S><ChurnPage /></S></G>} />
      <Route path="/intelligence/models"        element={<G><S><ModelsPage /></S></G>} />
      <Route path="/intelligence/labeling"      element={<G><S><LabelingPage /></S></G>} />
      <Route path="/intelligence/review-queue"  element={<G><S><ReviewQueuePage /></S></G>} />
      <Route path="/intelligence/mcp"           element={<G><S><McpPage /></S></G>} />
      <Route path="/intelligence/network-health" element={<G><S><NetworkHealthPage /></S></G>} />
      <Route path="/intelligence/staffing"      element={<G><S><StaffingPage /></S></G>} />
      <Route path="/intelligence/voice-qa"      element={<G><S><VoiceQaPage /></S></G>} />
      <Route path="/intelligence/sandbox"       element={<G><S><SandboxPage /></S></G>} />
      <Route path="/intelligence/reflections"  element={<G><S><ReflectionsPage /></S></G>} />
      <Route path="/intelligence/incidents"   element={<G><S><IncidentsPage /></S></G>} />
      <Route path="/intelligence/genesis"    element={<G><S><GenesisReportPage /></S></G>} />
      <Route path="/intelligence/policy-lab" element={<G><S><PolicyLabPage /></S></G>} />
      <Route path="/intelligence/cfo"        element={<G><S><CfoPage /></S></G>} />
      <Route path="/intelligence/twin"       element={<G><S><NetworkTwinPage /></S></G>} />
    </>
  );
}
