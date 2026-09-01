import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import App from './App';
import './index.css';
import { ErrorBoundary } from './ErrorBoundary';

// Portal do Assinante (P4): o subdomínio `portal.*` (ex.: portal.astrumlabs.online,
// acme.portal.astrumlabs.online) é o app DO CLIENTE FINAL — CPF+contrato, faturas,
// pagamento — NÃO o painel admin do ISP. Antes, `portal.*` caía na raiz `/` e mostrava
// o login do operador. `?portal=1` força o modo portal em dev/local.
const PortalPage = lazy(() => import('./pages/PortalPage'));

function isPortalHost(): boolean {
  try {
    const host = window.location.hostname.toLowerCase();
    if (/(^|\.)portal\./.test(host)) return true;
    return new URLSearchParams(window.location.search).has('portal');
  } catch {
    return false;
  }
}

// F1 — migração one-shot: o produto virou dark-first (D-001); limpa o tema salvo
// da era light-first para todo mundo cair no novo padrão. Escolhas feitas DEPOIS
// desta migração são respeitadas normalmente.
if (!localStorage.getItem('astrum-f1-theme-reset')) {
  localStorage.removeItem('theme');
  localStorage.setItem('astrum-f1-theme-reset', '1');
}

const portalMode = isPortalHost();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* D-001 — dark-first: escuro é o padrão do produto */}
      <ThemeProvider attribute="class" defaultTheme="dark">
        {portalMode ? (
          // Portal do assinante — app standalone, sem o roteador/shell do admin.
          <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
            <PortalPage />
          </Suspense>
        ) : (
          <BrowserRouter>
            <App />
          </BrowserRouter>
        )}
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
