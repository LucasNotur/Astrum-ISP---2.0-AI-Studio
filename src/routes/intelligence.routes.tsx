import React, { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';

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

const fallback = <div className="p-10 text-center text-muted-foreground">Carregando...</div>;

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

export function intelligenceRoutes() {
  return (
    <>
      <Route path="/intelligence"               element={<S><IntelligenceHubPage /></S>} />
      <Route path="/intelligence/tools"         element={<S><ToolsPage /></S>} />
      <Route path="/intelligence/guardrails"    element={<S><GuardrailsPage /></S>} />
      <Route path="/intelligence/graph"         element={<S><NetworkGraphPage /></S>} />
      <Route path="/intelligence/features"      element={<S><FeaturesPage /></S>} />
      <Route path="/intelligence/campaigns"     element={<S><CampaignsPage /></S>} />
      <Route path="/intelligence/drift"         element={<S><DriftPage /></S>} />
      <Route path="/intelligence/synthetic"     element={<S><SyntheticPage /></S>} />
      <Route path="/intelligence/replay"        element={<S><ReplayPage /></S>} />
      <Route path="/intelligence/churn"         element={<S><ChurnPage /></S>} />
      <Route path="/intelligence/models"        element={<S><ModelsPage /></S>} />
      <Route path="/intelligence/labeling"      element={<S><LabelingPage /></S>} />
      <Route path="/intelligence/review-queue"  element={<S><ReviewQueuePage /></S>} />
      <Route path="/intelligence/mcp"           element={<S><McpPage /></S>} />
      <Route path="/intelligence/network-health" element={<S><NetworkHealthPage /></S>} />
      <Route path="/intelligence/staffing"      element={<S><StaffingPage /></S>} />
      <Route path="/intelligence/voice-qa"      element={<S><VoiceQaPage /></S>} />
      <Route path="/intelligence/sandbox"       element={<S><SandboxPage /></S>} />
    </>
  );
}
