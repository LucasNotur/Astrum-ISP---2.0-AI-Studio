import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from 'next-themes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    value: async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      if (response.status === 403) {
        const clone = response.clone();
        clone.json().then(data => {
          if (data?.error === 'FEATURE_NOT_AVAILABLE') {
            const event = new CustomEvent('FEATURE_NOT_AVAILABLE', {
              detail: { feature: data.reason || 'Recurso Restrito' }
            });
            window.dispatchEvent(event);
          }
        }).catch(() => {});
      }
      return response;
    },
    configurable: true,
    writable: true
  });
} catch (e) {
  console.warn("Não foi possível sobrescrever o window.fetch", e);
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <>
    {/* @ts-ignore */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  </>,
);
