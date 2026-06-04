import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { QueryDevtools } from './components/QueryDevtools';

// Lazy loading — cada rota é um chunk separado
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Chat = lazy(() => import('./pages/Chat'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const CobraiAdmin = lazy(() => import('./pages/CobraiAdmin'));

function PageLoader() {
  return (
    <div className="loading-screen" role="status" aria-label="Carregando">
      <div className="loading-spinner" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/tickets" element={<div>Tickets (em breve)</div>} />
                <Route path="/customers" element={<div>Clientes (em breve)</div>} />
                <Route path="/chat" element={<Chat />} />
              </Route>
              <Route element={<ProtectedRoute requiredRole="admin" />}>
                <Route path="/settings" element={<div>Configurações</div>} />
                <Route path="/knowledge" element={<Knowledge />} />
                <Route path="/cobrai" element={<CobraiAdmin />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      <QueryDevtools />
    </QueryClientProvider>
  );
}
