import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ChurnPage from './ChurnPage';

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok' } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

const flagsState: { flags: Record<string, boolean>; isLoading: boolean } = {
  flags: {},
  isLoading: false,
};
vi.mock('@/src/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => flagsState,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

// Soma = 15+10+0+0+0+0 = 25. Score arredondado = 25. Banda = high (25 < 50).
const SAMPLE = [
  {
    customerId: 'c1',
    customerName: 'Maria Silva',
    score: 25,
    riskBand: 'high',
    mrrCents: 9900,
    contributions: [
      { feature: 'overdue', weight: 25, value: 0.6, contribution: 15 },
      { feature: 'paymentDelay', weight: 20, value: 0.5, contribution: 10 },
      { feature: 'tickets', weight: 20, value: 0, contribution: 0 },
      { feature: 'negativeSentiment', weight: 15, value: 0, contribution: 0 },
      { feature: 'downgrade', weight: 10, value: 0, contribution: 0 },
      { feature: 'newCustomer', weight: 10, value: 0, contribution: 0 },
    ],
    scoredAt: new Date().toISOString(),
  },
  {
    customerId: 'c2',
    customerName: 'João Pereira',
    score: 80,
    riskBand: 'critical',
    mrrCents: 14900,
    contributions: [
      { feature: 'overdue', weight: 25, value: 1, contribution: 25 },
      { feature: 'paymentDelay', weight: 20, value: 1, contribution: 20 },
      { feature: 'tickets', weight: 20, value: 1, contribution: 20 },
      { feature: 'negativeSentiment', weight: 15, value: 1, contribution: 15 },
      { feature: 'downgrade', weight: 10, value: 0, contribution: 0 },
      { feature: 'newCustomer', weight: 10, value: 0, contribution: 0 },
    ],
    scoredAt: new Date(Date.now() - 7200_000).toISOString(),
  },
  {
    customerId: 'c3',
    customerName: 'Ana Costa',
    score: 10,
    riskBand: 'low',
    mrrCents: 7900,
    contributions: [
      { feature: 'overdue', weight: 25, value: 0.4, contribution: 10 },
      { feature: 'paymentDelay', weight: 20, value: 0, contribution: 0 },
      { feature: 'tickets', weight: 20, value: 0, contribution: 0 },
      { feature: 'negativeSentiment', weight: 15, value: 0, contribution: 0 },
      { feature: 'downgrade', weight: 10, value: 0, contribution: 0 },
      { feature: 'newCustomer', weight: 10, value: 0, contribution: 0 },
    ],
    scoredAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
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

describe('ChurnPage (IA-38)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    flagsState.flags = { churn: true };
    flagsState.isLoading = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    flagsState.flags = {};
    flagsState.isLoading = false;
  });

  it('flag churn off: NÃO chama a API e mostra mensagem do gate', async () => {
    flagsState.flags = { churn: false };
    render(<ChurnPage />, { wrapper });
    expect(
      await screen.findByText(/Motor de churn desligado neste ambiente/),
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('estado vazio: renderiza EmptyState com copy correto', async () => {
    mockFetchSequence([{ ok: true, body: { customers: [], total: 0, limit: 100, offset: 0 } }]);
    render(<ChurnPage />, { wrapper });
    expect(await screen.findByText('Nenhum score de churn ainda.')).toBeInTheDocument();
    expect(await screen.findByText('O cálculo roda toda noite às 03h (BRT).')).toBeInTheDocument();
  });

  it('com dados: 3 linhas + statcards (1 crítico, 1 alto, MRR em risco = 24800 centavos)', async () => {
    mockFetchSequence([{ ok: true, body: { customers: SAMPLE, total: 3, limit: 100, offset: 0 } }]);
    render(<ChurnPage />, { wrapper });

    // Nomes aparecem
    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('João Pereira')).toBeInTheDocument();
    expect(screen.getByText('Ana Costa')).toBeInTheDocument();

    // Statcards: 1 crítico, 1 alto (SAMPLE tem 1 critical + 1 high)
    // MRR em risco = mrrCents(high) + mrrCents(critical) = 9900 + 14900 = 24800
    const statValues = screen.getAllByText(/^[0-9]+$/).map(el => el.textContent);
    expect(statValues).toContain('1');
    expect(statValues).toContain('1');
    // formatBRL(24800) → "R$ 248"
    expect(screen.getByText(/R\$\s*248/)).toBeInTheDocument();
  });

  it('score e MRR em font-mono tabular-nums', async () => {
    mockFetchSequence([{ ok: true, body: { customers: SAMPLE, total: 3, limit: 100, offset: 0 } }]);
    render(<ChurnPage />, { wrapper });
    const score25 = await screen.findByText('25.00');
    expect(score25.className).toContain('font-mono');
    expect(score25.className).toContain('tabular-nums');
  });

  it('clique em uma linha → Dialog de waterfall com a invariante visível', async () => {
    mockFetchSequence([{ ok: true, body: { customers: SAMPLE, total: 3, limit: 100, offset: 0 } }]);
    render(<ChurnPage />, { wrapper });

    // Clica no nome do primeiro cliente (a row é a primeira <tr> que o contém).
    const maria = await screen.findByText('Maria Silva');
    fireEvent.click(maria);

    // Dialog abre com título "Por que Maria Silva está em risco?"
    expect(
      await screen.findByText(/Por que Maria Silva está em risco/),
    ).toBeInTheDocument();

    // A invariante deve aparecer, com soma=25 e score=25 → |25 - 25| = 0
    expect(
      screen.getByText(/soma das contribui\u00e7\u00f5es = 25\.00 \u2248 score = 25\.00/),
    ).toBeInTheDocument();
  });

  it('INVARIANTE: para TODAS as linhas, |sum(contrib) - score| <= 0.01', async () => {
    mockFetchSequence([{ ok: true, body: { customers: SAMPLE, total: 3, limit: 100, offset: 0 } }]);
    render(<ChurnPage />, { wrapper });

    // Abre o dialog do primeiro, segundo e terceiro cliente, validando cada um.
    const nomes = ['Maria Silva', 'João Pereira', 'Ana Costa'];
    for (const nome of nomes) {
      const cell = await screen.findByText(nome);
      fireEvent.click(cell);
      const { score, contributions } = SAMPLE.find(s => s.customerName === nome)!;
      const sum = contributions.reduce((acc, c) => acc + c.contribution, 0);
      // A invariante renderizada deve mostrar a soma e o score do fixture.
      const invariantText = await screen.findByText(
        new RegExp(
          `soma das contribui[çc][õo]es = ${sum.toFixed(2)} . score = ${score.toFixed(2)}`,
        ),
      );
      expect(invariantText).toBeInTheDocument();
      // Fecha o dialog para o próximo.
      fireEvent.keyDown(document.body, { key: 'Escape' });
    }
  });

  it('erro de fetch: mostra mensagem de erro sem crashar', async () => {
    mockFetchSequence([{ ok: false, body: { code: 'CHURN_ERROR' } }]);
    render(<ChurnPage />, { wrapper });
    expect(await screen.findByText('Risco de Churn')).toBeInTheDocument();
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
  });
});
