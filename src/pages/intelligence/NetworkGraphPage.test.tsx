import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import NetworkGraphPage from './NetworkGraphPage';

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'network_ctos') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [
                { id: 'cto1', name: 'CTO Centro' },
                { id: 'cto2', name: 'CTO Norte' },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('NetworkGraphPage (IA-16)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza título, abas e EmptyState inicial sem CTO selecionada', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    render(<NetworkGraphPage />, { wrapper });

    expect(await screen.findByText('Grafo da Rede')).toBeInTheDocument();
    // Abas visíveis
    expect(screen.getByRole('tab', { name: /Impacto/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Reincid/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Capacidade/ })).toBeInTheDocument();
    // EmptyState inicial
    expect(await screen.findByText(/Escolha uma CTO para simular/)).toBeInTheDocument();
  });
});
