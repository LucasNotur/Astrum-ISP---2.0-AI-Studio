import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import App from './App';
import './index.css';
import { ErrorBoundary } from './ErrorBoundary';

// F1 — migração one-shot: o produto virou dark-first (D-001); limpa o tema salvo
// da era light-first para todo mundo cair no novo padrão. Escolhas feitas DEPOIS
// desta migração são respeitadas normalmente.
if (!localStorage.getItem('astrum-f1-theme-reset')) {
  localStorage.removeItem('theme');
  localStorage.setItem('astrum-f1-theme-reset', '1');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        {/* D-001 — dark-first: escuro é o padrão do produto */}
        <ThemeProvider attribute="class" defaultTheme="dark">
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
