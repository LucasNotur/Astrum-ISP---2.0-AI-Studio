import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -- Mocks --------------------------------------------------------------------

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/src/store/useAppStore', () => ({
  useAppStore: (sel: any) => sel({
    companySettings: { tenant_id: 'tenant-1' },
  }),
}));

const DASHBOARD_RESPONSE = {
  period_days: 30,
  total_leads: 42,
  total_completed: 7,
  conversion_rate_pct: 16.7,
  avg_ltv_cents: 480000,
  funnel: [
    { stage: 'collecting_address', count: 42 },
    { stage: 'presenting_plans', count: 18 },
    { stage: 'completed', count: 7 },
  ],
  by_source: [{ source: 'whatsapp', count: 40 }, { source: 'instagram', count: 2 }],
  by_offer_tier: [{ tier: 'standard', count: 5 }, { tier: 'promotional', count: 2 }],
};

function mockFetch(data: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => data,
    status: ok ? 200 : 500,
  } as any);
}

// -- Tests --------------------------------------------------------------------

describe('SalesPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders page title', async () => {
    mockFetch(DASHBOARD_RESPONSE);
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);

    expect(screen.getByText('Painel de Vendas')).toBeInTheDocument();
  });

  it('renders KPIs after successful fetch', async () => {
    mockFetch(DASHBOARD_RESPONSE);
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);

    await waitFor(() => {
      // 42 aparece no KPI e no funil
      expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('16.7%')).toBeInTheDocument();
      // LTV: toLocaleString varia por env; checa parte numerica
      expect(screen.getByText(/4[.,]800/)).toBeInTheDocument();
    });
  });

  it('renders funnel stages', async () => {
    mockFetch(DASHBOARD_RESPONSE);
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/Coletando/)).toBeInTheDocument();
    });
  });

  it('renders by_source table', async () => {
    mockFetch(DASHBOARD_RESPONSE);
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('whatsapp')).toBeInTheDocument();
      expect(screen.getByText('instagram')).toBeInTheDocument();
    });
  });

  it('shows error card on fetch failure', async () => {
    mockFetch({}, false);
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText(/Erro ao carregar/)).toBeInTheDocument();
    });
  });

  it('shows migration hint when total_leads is 0', async () => {
    mockFetch({ ...DASHBOARD_RESPONSE, total_leads: 0, total_completed: 0, funnel: [] });
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('Migration pendente')).toBeInTheDocument();
    });
  });

  it('refetches with new period when period button clicked', async () => {
    mockFetch(DASHBOARD_RESPONSE);
    const { SalesPage } = await import('@/src/pages/SalesPage');

    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await waitFor(() => screen.getAllByText('42'));

    mockFetch({ ...DASHBOARD_RESPONSE, period_days: 60 });
    fireEvent.click(screen.getByRole('button', { name: '60d' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('days=60'),
        expect.any(Object),
      );
    });
  });
});
