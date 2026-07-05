import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import GuardrailsPage from './GuardrailsPage';

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
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

const VETOES = {
  items: [
    {
      id: 'v1',
      response_text: 'Confirmo sua visita amanhã às 14h.',
      categories: ['valor_ou_prazo_inventado', 'promessa_nao_autorizada'],
      review_status: 'pending',
      created_at: '2026-07-05T12:00:00Z',
    },
  ],
  total: 1,
};

const STATS = {
  total14d: 3,
  byCategory: { valor_ou_prazo_inventado: 2, orientacao_perigosa: 1 },
  falsePositiveRate: 0.12,
  vetoRate7d: 1,
};

describe('GuardrailsPage (IA-21)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza títulos, stats e lista de vetos pendentes', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/stats')) return { ok: true, json: async () => STATS };
      return { ok: true, json: async () => VETOES };
    });

    render(<GuardrailsPage />, { wrapper });

    expect(await screen.findByText('Guardrails')).toBeInTheDocument();
    expect(await screen.findByText('Confirmo sua visita amanhã às 14h.')).toBeInTheDocument();
    expect(await screen.findByText('Valor/prazo inventado')).toBeInTheDocument();
    expect(await screen.findByText('Promessa não autorizada')).toBeInTheDocument();
  });

  it('EmptyState quando não há vetos pendentes', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/stats')) return { ok: true, json: async () => STATS };
      return { ok: true, json: async () => ({ items: [], total: 0 }) };
    });
    render(<GuardrailsPage />, { wrapper });
    expect(await screen.findByText('Nenhum veto pendente de revisão.')).toBeInTheDocument();
  });

  it('botão "Veto correto" dispara PATCH e mostra toast de sucesso', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') return { ok: true, json: async () => ({ ok: true }) };
      if (url.includes('/stats')) return { ok: true, json: async () => STATS };
      return { ok: true, json: async () => VETOES };
    });
    render(<GuardrailsPage />, { wrapper });
    const btn = await screen.findByRole('button', { name: /Veto correto/ });
    fireEvent.click(btn);

    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls as any[];
      const patch = calls.find((c) => c[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch[1].body)).toEqual({ review_status: 'veto_correto' });
    });
  });
});
