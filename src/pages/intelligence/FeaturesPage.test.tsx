import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import FeaturesPage from './FeaturesPage';

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

const FRESH = [
  { name: 'tenure_days', describe: 'Dias desde o cadastro', entity: 'customer', entities: 250, computed_at: new Date().toISOString(), ttl_hours: 24, stale: false },
  { name: 'overdue_count_90d', describe: 'Faturas vencidas 90d', entity: 'customer', entities: 250, computed_at: new Date().toISOString(), ttl_hours: 24, stale: false },
  { name: 'tickets_90d', describe: 'Tickets 90d', entity: 'customer', entities: 250, computed_at: new Date().toISOString(), ttl_hours: 24, stale: false },
  { name: 'mrr_cents', describe: 'Mensalidade em centavos', entity: 'customer', entities: 250, computed_at: new Date().toISOString(), ttl_hours: 24, stale: false },
];

const EMPTY = [
  { name: 'tenure_days', describe: 'Dias desde o cadastro', entity: 'customer', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
  { name: 'overdue_count_90d', describe: 'Faturas vencidas 90d', entity: 'customer', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
  { name: 'tickets_90d', describe: 'Tickets 90d', entity: 'customer', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
  { name: 'mrr_cents', describe: 'Mensalidade em centavos', entity: 'customer', entities: 0, computed_at: null, ttl_hours: 24, stale: true },
];

const STALE = [
  { name: 'tenure_days', describe: 'Dias desde o cadastro', entity: 'customer', entities: 250, computed_at: new Date(Date.now() - 48 * 3_600_000).toISOString(), ttl_hours: 24, stale: true },
];

describe('FeaturesPage (IA-27)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza o catálogo com features frescas (sem RiskBadge)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => FRESH,
    });

    render(<FeaturesPage />, { wrapper });

    expect(await screen.findByText('tenure_days')).toBeInTheDocument();
    expect(await screen.findByText('overdue_count_90d')).toBeInTheDocument();
    expect(await screen.findByText('tickets_90d')).toBeInTheDocument();
    expect(await screen.findByText('mrr_cents')).toBeInTheDocument();
    // sem badge para dados frescos
    expect(screen.queryByText('Médio')).not.toBeInTheDocument();
  });

  it('mostra entidades como número mono alinhado à direita', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => FRESH,
    });

    render(<FeaturesPage />, { wrapper });

    const cells = await screen.findAllByText('250');
    expect(cells.length).toBe(FRESH.length);
    // Cada célula de entidades usa font-mono tabular-nums
    expect(cells[0].className).toContain('font-mono');
    expect(cells[0].className).toContain('tabular-nums');
  });

  it('estado vazio (worker nunca rodou) → EmptyState com copy correto e SEM botão', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => EMPTY,
    });

    render(<FeaturesPage />, { wrapper });

    expect(await screen.findByText('Nenhuma feature computada ainda.')).toBeInTheDocument();
    expect(
      await screen.findByText('O cálculo roda toda noite às 02h. Você também pode aguardar a primeira execução do worker.'),
    ).toBeInTheDocument();
    // SEM botão de ação
    expect(screen.queryByRole('button', { name: /forçar|rodar agora|executar/i })).not.toBeInTheDocument();
  });

  it('feature com computed_at > 24h renderiza RiskBadge level=medio', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => STALE,
    });

    render(<FeaturesPage />, { wrapper });

    expect(await screen.findByText('tenure_days')).toBeInTheDocument();
    expect(await screen.findByText('Médio')).toBeInTheDocument();
  });

  it('TTL é renderizado em horas (uma ocorrência por feature)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => FRESH,
    });

    render(<FeaturesPage />, { wrapper });

    const ttls = await screen.findAllByText('24h');
    expect(ttls.length).toBe(FRESH.length);
  });
});
