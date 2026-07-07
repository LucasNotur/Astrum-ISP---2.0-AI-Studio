import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DriftPage from './DriftPage';

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

const SUFFICIENT = {
  intent: {
    psi: 0.234,
    severity: 'medio',
    counts: { expected: 100, actual: 120 },
    breakdown: {
      suporte: { expected: 80, actual: 60 },
      cobranca: { expected: 20, actual: 20 },
      nova_intent: { expected: 0, actual: 40 },
    },
  },
  sentiment: {
    psi: 0.087,
    severity: 'ok',
    counts: { expected: 100, actual: 120 },
    breakdown: {
      neutral: { expected: 80, actual: 80 },
      negative: { expected: 20, actual: 0 },
      frustrated: { expected: 0, actual: 40 },
    },
  },
  insufficient: false,
  windows: { actualDays: 7, baselineDays: 28 },
};

const INSUFFICIENT = {
  intent: { psi: 0, severity: 'ok', counts: { expected: 0, actual: 0 }, breakdown: {} },
  sentiment: { psi: 0, severity: 'ok', counts: { expected: 0, actual: 0 }, breakdown: {} },
  insufficient: true,
  windows: { actualDays: 7, baselineDays: 28 },
};

const REPORTS = [
  { id: 'r1', metric: 'intent', psi: 0.05, severity: 'ok', created_at: '2026-07-01T04:00:00Z' },
  { id: 'r2', metric: 'sentiment', psi: 0.12, severity: 'medio', created_at: '2026-07-01T04:00:00Z' },
  { id: 'r3', metric: 'intent', psi: 0.18, severity: 'medio', created_at: '2026-07-02T04:00:00Z' },
  { id: 'r4', metric: 'sentiment', psi: 0.06, severity: 'ok', created_at: '2026-07-02T04:00:00Z' },
];

function mockFetchSequence(responses: Array<{ ok: boolean; body: any }>) {
  let i = 0;
  (globalThis.fetch as any) = vi.fn().mockImplementation(async () => {
    const r = responses[i++] ?? responses[responses.length - 1];
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      json: async () => r.body,
    };
  });
}

describe('DriftPage (IA-33)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('estado suficiente: renderiza título + 2 RiskStripeCard com PSI em font-mono', async () => {
    mockFetchSequence([
      { ok: true, body: SUFFICIENT },
      { ok: true, body: REPORTS },
    ]);

    render(<DriftPage />, { wrapper });

    expect(await screen.findByText('Drift do Modelo')).toBeInTheDocument();
    expect(await screen.findByText('Sentimentos')).toBeInTheDocument();

    // PSI formatado com 3 casas decimais
    expect(screen.getByText('0.234')).toBeInTheDocument();
    expect(screen.getByText('0.087')).toBeInTheDocument();
    // font-mono no PSI
    expect(screen.getByText('0.234').className).toContain('font-mono');

    // RiskBadge: medio aparece para o card de intents (severity medio)
    const medios = screen.getAllByText('Médio');
    expect(medios.length).toBeGreaterThanOrEqual(1);
  });

  it('estado suficiente: mostra distribuição 7d × baseline + histórico 30d', async () => {
    mockFetchSequence([
      { ok: true, body: SUFFICIENT },
      { ok: true, body: REPORTS },
    ]);

    render(<DriftPage />, { wrapper });

    expect(await screen.findByText('Distribuição 7d × baseline 28d')).toBeInTheDocument();
    expect(await screen.findByText('PSI diário (30 dias)')).toBeInTheDocument();
  });

  it('estado vazio (< 7d de dados): EmptyState com copy "Coletando a linha de base."', async () => {
    mockFetchSequence([
      { ok: true, body: INSUFFICIENT },
      { ok: true, body: [] },
    ]);

    render(<DriftPage />, { wrapper });

    expect(await screen.findByText('Coletando a linha de base.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'O primeiro relatório de drift sai com 7 dias de conversas classificadas.',
      ),
    ).toBeInTheDocument();
    // Não mostra os cards de PSI no estado vazio
    expect(screen.queryByText('0.234')).not.toBeInTheDocument();
  });

  it('erro de fetch → mostra mensagem e título da página', async () => {
    mockFetchSequence([
      { ok: false, body: { code: 'DRIFT_ERROR', message: 'timeout' } },
      { ok: false, body: [] },
    ]);

    render(<DriftPage />, { wrapper });

    expect(await screen.findByText('Drift do Modelo')).toBeInTheDocument();
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
  });
});
