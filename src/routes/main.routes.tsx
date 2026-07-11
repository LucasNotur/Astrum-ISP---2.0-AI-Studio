import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardPage } from '../pages/DashboardPage';
import { SuperAdminPage } from '../pages/SuperAdminPage';
import { SuperAdminRoute } from '../components/SuperAdminRoute';
import { CustomersPage } from '../pages/CustomersPage';
import { ServiceOrdersPage } from '../pages/ServiceOrdersPage';
import { ChatPage } from '../pages/ChatPage';
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
import { BIPage } from '../pages/BIPage';
import { InventoryPage } from '../pages/InventoryPage';
import { TicketsPage } from '../pages/TicketsPage';
import { intelligenceRoutes } from './intelligence.routes';

/** Wrapper de motion para rotas com animação de entrada. */
function Animated({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <motion.div key={id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
      {children}
    </motion.div>
  );
}

/**
 * U1-01 — Rotas autocontidas (não recebem props de estado do App).
 * Rotas que ainda dependem de estado local do App (whatsapp, kb, ai-config,
 * team, settings, tickets) permanecem no App.tsx até refatoração
 * de state management (Zustand stores por domínio).
 */
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
      <Route
        path="/"
        element={<Navigate to={currentUserRole === 'tecnico' ? '/tecnico' : '/dashboard'} replace />}
      />
      <Route path="/dashboard"        element={<DashboardPage />} />
      <Route path="/tecnico"          element={<TechnicianAppPage />} />
      <Route path="/bi"               element={<BIPage />} />
      <Route path="/customers"        element={<CustomersPage />} />
      <Route path="/os"               element={<ServiceOrdersPage />} />
      <Route path="/chat"             element={<ChatPage />} />
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
      {intelligenceRoutes()}
    </>
  );
}
