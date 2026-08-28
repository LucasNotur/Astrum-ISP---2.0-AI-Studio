import React, { lazy, Suspense } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SuperAdminRoute } from '../components/SuperAdminRoute';
import { intelligenceRoutes } from './intelligence.routes';

// Code-splitting: nenhuma página fica no chunk de entrada (App.tsx é carregado em
// TODA rota, inclusive login) — cada rota só baixa seu próprio JS quando visitada.
const SmartHomePage = lazy(() => import('../pages/SmartHomePage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SuperAdminPage = lazy(() => import('../pages/SuperAdminPage').then((m) => ({ default: m.SuperAdminPage })));
const CustomersPage = lazy(() => import('../pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const ServiceOrdersPage = lazy(() => import('../pages/ServiceOrdersPage').then((m) => ({ default: m.ServiceOrdersPage })));
const MapPage = lazy(() => import('../pages/MapPage').then((m) => ({ default: m.MapPage })));
const BillingPage = lazy(() => import('../pages/BillingPage').then((m) => ({ default: m.BillingPage })));
const MonitoringPage = lazy(() => import('../pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })));
const CobrAIPage = lazy(() => import('../pages/CobrAIPage').then((m) => ({ default: m.CobrAIPage })));
const AIObservabilityPage = lazy(() => import('../pages/AIObservabilityPage').then((m) => ({ default: m.AIObservabilityPage })));
const AICostsPage = lazy(() => import('../pages/AICostsPage').then((m) => ({ default: m.AICostsPage })));
const ERPIntegrationsPage = lazy(() => import('../pages/ERPIntegrationsPage').then((m) => ({ default: m.ERPIntegrationsPage })));
const WebhooksPage = lazy(() => import('../pages/WebhooksPage').then((m) => ({ default: m.WebhooksPage })));
const SecurityPage = lazy(() => import('../pages/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const QualityMonitorPage = lazy(() => import('../pages/QualityMonitorPage'));
const TechnicianAppPage = lazy(() => import('../pages/TechnicianAppPage'));
const FieldOpsPage = lazy(() => import('../pages/FieldOpsPage'));
const InventoryPage = lazy(() => import('../pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const TicketsPage = lazy(() => import('../pages/TicketsPage').then((m) => ({ default: m.TicketsPage })));
const SalesPage = lazy(() => import('../pages/SalesPage').then((m) => ({ default: m.SalesPage })));
const ValorGeradoPage = lazy(() => import('../pages/ValorGeradoPage').then((m) => ({ default: m.ValorGeradoPage })));
const OnboardingWizardPage = lazy(() => import('../pages/OnboardingWizardPage'));
const HealthDashboardPage = lazy(() => import('../pages/HealthDashboardPage'));
const PortalPage = lazy(() => import('../pages/PortalPage'));
const WhatsAppConnectionsPage = lazy(() => import('../pages/WhatsAppPage').then((m) => ({ default: m.WhatsAppConnectionsPage })));
const KnowledgeBasePage = lazy(() => import('../pages/KnowledgeBasePage').then((m) => ({ default: m.KnowledgeBasePage })));
const AIConfigPage = lazy(() => import('../pages/AIConfigPage').then((m) => ({ default: m.AIConfigPage })));
const TeamPage = lazy(() => import('../pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ChatPage   = lazy(() => import('../pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const BIPage     = lazy(() => import('../pages/BIPage').then((m) => ({ default: m.BIPage })));
const DesignPage = lazy(() => import('../pages/DesignPage').then((m) => ({ default: m.DesignPage })));
const EmergencyStopPage = lazy(() => import('../pages/EmergencyStopPage'));

const fallback = <div className="p-10 text-center text-muted-foreground">Carregando...</div>;
function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

/** Wrapper de motion para rotas com animação de entrada. */
function Animated({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <motion.div key={id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
      {children}
    </motion.div>
  );
}

/** U1-01 concluído: todas as 5 rotas inline do App.tsx migradas — zero props. */
export function mainRoutes(currentUserRole: string) {
  return (
    <>
      <Route
        path="/super-admin"
        element={
          <SuperAdminRoute>
            <L><SuperAdminPage /></L>
          </SuperAdminRoute>
        }
      />
      {/* U7-03: página /design — documentação viva, gated super_admin */}
      <Route
        path="/design"
        element={
          <SuperAdminRoute>
            <L><DesignPage /></L>
          </SuperAdminRoute>
        }
      />
      {/* Freio de emergência do atendimento IA (kill switch pós Fase 4), gated super_admin */}
      <Route
        path="/atendimento-emergencia"
        element={
          <SuperAdminRoute>
            <L><EmergencyStopPage /></L>
          </SuperAdminRoute>
        }
      />
      <Route
        path="/"
        element={<Navigate to={currentUserRole === 'tecnico' ? '/tecnico' : '/home'} replace />}
      />
      <Route path="/home"             element={<L><SmartHomePage /></L>} />
      <Route path="/dashboard"        element={<L><DashboardPage /></L>} />
      <Route path="/tecnico"          element={<L><TechnicianAppPage /></L>} />
      <Route path="/campo"            element={<L><FieldOpsPage /></L>} />
      <Route path="/bi"               element={<L><BIPage /></L>} />
      <Route path="/chat"             element={<L><ChatPage /></L>} />
      <Route path="/customers"        element={<L><CustomersPage /></L>} />
      <Route path="/os"               element={<L><ServiceOrdersPage /></L>} />
      <Route path="/map"              element={<L><MapPage /></L>} />
      <Route path="/billing"          element={<L><BillingPage /></L>} />
      <Route path="/monitoring"       element={<L><MonitoringPage /></L>} />
      <Route path="/quality-monitor"  element={<L><QualityMonitorPage /></L>} />
      <Route path="/cobrai"           element={<L><CobrAIPage /></L>} />
      <Route path="/observability"    element={<L><Animated id="observability"><AIObservabilityPage /></Animated></L>} />
      <Route path="/ai-costs"         element={<L><Animated id="ai-costs"><AICostsPage /></Animated></L>} />
      <Route path="/integrations"     element={<L><Animated id="integrations"><ERPIntegrationsPage /></Animated></L>} />
      <Route path="/webhooks"         element={<L><Animated id="webhooks"><WebhooksPage /></Animated></L>} />
      <Route path="/security"         element={<L><Animated id="security"><SecurityPage /></Animated></L>} />
      <Route path="/inventory"        element={<L><Animated id="inventory"><InventoryPage /></Animated></L>} />
      <Route path="/tickets"          element={<L><Animated id="tickets"><TicketsPage /></Animated></L>} />
      <Route path="/sales"            element={<L><Animated id="sales"><SalesPage /></Animated></L>} />
      <Route path="/valor"            element={<L><Animated id="valor"><ValorGeradoPage /></Animated></L>} />
      <Route path="/whatsapp"         element={<L><WhatsAppConnectionsPage /></L>} />
      <Route path="/kb"               element={<L><KnowledgeBasePage /></L>} />
      <Route path="/ai-config"        element={<L><AIConfigPage /></L>} />
      <Route path="/team"             element={<L><TeamPage /></L>} />
      <Route path="/settings"         element={<L><SettingsPage /></L>} />
      <Route path="/health"      element={<L><HealthDashboardPage /></L>} />
      <Route path="/onboarding" element={<Suspense fallback={<div className="p-10 text-center text-muted-foreground">Carregando...</div>}><OnboardingWizardPage /></Suspense>} />
      <Route path="/portal" element={<L><PortalPage /></L>} />
      {intelligenceRoutes()}
    </>
  );
}
