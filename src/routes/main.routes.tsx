import React, { lazy, Suspense } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardPage } from '../pages/DashboardPage';
import { SuperAdminPage } from '../pages/SuperAdminPage';
import { SuperAdminRoute } from '../components/SuperAdminRoute';
import { CustomersPage } from '../pages/CustomersPage';
import { ServiceOrdersPage } from '../pages/ServiceOrdersPage';
import { MapPage } from '../pages/MapPage';
import { BillingPage } from '../pages/BillingPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { CobrAIPage } from '../pages/CobrAIPage';
import { AIObservabilityPage } from '../pages/AIObservabilityPage';
import { AICostsPage } from '../pages/AICostsPage';
import { ERPIntegrationsPage } from '../pages/ERPIntegrationsPage';
import { WebhooksPage } from '../pages/WebhooksPage';
import { SecurityPage } from '../pages/SecurityPage';
import QualityMonitorPage from '../pages/QualityMonitorPage';
import TechnicianAppPage from '../pages/TechnicianAppPage';
import { InventoryPage } from '../pages/InventoryPage';
import { TicketsPage } from '../pages/TicketsPage';
import { SalesPage } from '../pages/SalesPage';
import { ValorGeradoPage } from '../pages/ValorGeradoPage';
import { intelligenceRoutes } from './intelligence.routes';
const OnboardingWizardPage = lazy(() => import('../pages/OnboardingWizardPage'));
const HealthDashboardPage = lazy(() => import('../pages/HealthDashboardPage'));
const PortalPage = lazy(() => import('../pages/PortalPage'));
import { WhatsAppConnectionsPage } from '../pages/WhatsAppPage';
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage';
import { AIConfigPage } from '../pages/AIConfigPage';
import { TeamPage } from '../pages/TeamPage';
import { SettingsPage } from '../pages/SettingsPage';

// U7-04: lazy loading nas 3 rotas mais pesadas para reduzir bundle inicial
const ChatPage   = lazy(() => import('../pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const BIPage     = lazy(() => import('../pages/BIPage').then((m) => ({ default: m.BIPage })));
const DesignPage = lazy(() => import('../pages/DesignPage').then((m) => ({ default: m.DesignPage })));

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
            <SuperAdminPage />
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
      <Route
        path="/"
        element={<Navigate to={currentUserRole === 'tecnico' ? '/tecnico' : '/dashboard'} replace />}
      />
      <Route path="/dashboard"        element={<DashboardPage />} />
      <Route path="/tecnico"          element={<TechnicianAppPage />} />
      {/* U7-04: ChatPage (~2000 linhas) e BIPage (Recharts pesado) → lazy */}
      <Route path="/bi"               element={<L><BIPage /></L>} />
      <Route path="/chat"             element={<L><ChatPage /></L>} />
      <Route path="/customers"        element={<CustomersPage />} />
      <Route path="/os"               element={<ServiceOrdersPage />} />
      <Route path="/map"              element={<MapPage />} />
      <Route path="/billing"          element={<BillingPage />} />
      <Route path="/monitoring"       element={<MonitoringPage />} />
      <Route path="/quality-monitor"  element={<QualityMonitorPage />} />
      <Route path="/cobrai"           element={<CobrAIPage />} />
      <Route path="/observability"    element={<Animated id="observability"><AIObservabilityPage /></Animated>} />
      <Route path="/ai-costs"         element={<Animated id="ai-costs"><AICostsPage /></Animated>} />
      <Route path="/integrations"     element={<Animated id="integrations"><ERPIntegrationsPage /></Animated>} />
      <Route path="/webhooks"         element={<Animated id="webhooks"><WebhooksPage /></Animated>} />
      <Route path="/security"         element={<Animated id="security"><SecurityPage /></Animated>} />
      <Route path="/inventory"        element={<Animated id="inventory"><InventoryPage /></Animated>} />
      <Route path="/tickets"          element={<Animated id="tickets"><TicketsPage /></Animated>} />
      <Route path="/sales"            element={<Animated id="sales"><SalesPage /></Animated>} />
      <Route path="/valor"            element={<Animated id="valor"><ValorGeradoPage /></Animated>} />
      <Route path="/whatsapp"         element={<WhatsAppConnectionsPage />} />
      <Route path="/kb"               element={<KnowledgeBasePage />} />
      <Route path="/ai-config"        element={<AIConfigPage />} />
      <Route path="/team"             element={<TeamPage />} />
      <Route path="/settings"         element={<SettingsPage />} />
      <Route path="/health"      element={<L><HealthDashboardPage /></L>} />
      <Route path="/onboarding" element={<Suspense fallback={<div className="p-10 text-center text-muted-foreground">Carregando...</div>}><OnboardingWizardPage /></Suspense>} />
      <Route path="/portal" element={<L><PortalPage /></L>} />
      {intelligenceRoutes()}
    </>
  );
}
