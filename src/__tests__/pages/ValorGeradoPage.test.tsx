import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -- Mocks --------------------------------------------------------------------

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok' } },
      }),
    },
  },
}));

vi.mock('@/src/store/useAppStore', () => ({
  useAppStore: (sel: any) => sel({ companySettings: { tenant_id: 'tenant-1' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const KPIS = {
  period: '30d',
  periodDays: 30,
  recoveredCents: 320000,
  recoveredBrl: 3200,
  aiResolved: 840,
  totalAttendances: 1000,
  aiResolutionRatePct: 84,
  hoursSaved: 210,
  ticketsAvoided: 750,
  aiCostUsd: 4.8,
  roiMultiple: 128.2,
  methodology: {
    recoveredNote: 'nota recuperado',
    hoursSavedNote: 'nota horas',
    roiNote: 'nota roi',
  },
};

function mockFetch(data: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => data,
  } as any);
}

/** Helper: waits until 128.2 appears (in the hero or sub-text) */
async function waitForRoiLoaded() {
  await waitFor(() => {
    expect(screen.getAllByText(/128\.2/).length).toBeGreaterThanOrEqual(1);
  });
}

// -- Tests --------------------------------------------------------------------

describe('ValorGeradoPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page title', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    expect(screen.getByText('Valor Gerado')).toBeInTheDocument();
  });

  it('renders ROI hero after fetch', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitForRoiLoaded();
    // hero text is the large "128.2x" element; at least one match confirms render
    expect(screen.getAllByText(/128\.2/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders ai resolution rate', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitForRoiLoaded();
    expect(screen.getAllByText('84%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders hours saved KPI', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitForRoiLoaded();
    expect(screen.getByText('210h')).toBeInTheDocument();
  });

  it('shows migration hint when no attendances', async () => {
    mockFetch({ ...KPIS, totalAttendances: 0, aiResolved: 0, recoveredBrl: 0, roiMultiple: 0 });
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Aguardando dados de produção')).toBeInTheDocument();
    });
  });

  it('shows error on fetch failure', async () => {
    mockFetch({}, false);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Erro ao carregar/)).toBeInTheDocument();
    });
  });

  it('toggles methodology accordion', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitForRoiLoaded();

    // accordion starts closed
    expect(screen.queryByText('nota recuperado')).not.toBeInTheDocument();
    // open it
    fireEvent.click(screen.getByText(/Metodologia/));
    await waitFor(() => {
      expect(screen.getByText('nota recuperado')).toBeInTheDocument();
    });
  });

  it('generates case and shows share URL', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitForRoiLoaded();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ shareToken: 'abc123', shareUrl: '/api/v2/valor/case/abc123', kpis: KPIS }),
    } as any);

    fireEvent.click(screen.getByRole('button', { name: /Gerar link/ }));
    await waitFor(() => {
      expect(screen.getByText(/abc123/)).toBeInTheDocument();
    });
  });

  it('changes period on button click', async () => {
    mockFetch(KPIS);
    const { ValorGeradoPage } = await import('@/src/pages/ValorGeradoPage');
    render(<MemoryRouter><ValorGeradoPage /></MemoryRouter>);
    await waitForRoiLoaded();

    mockFetch({ ...KPIS, period: '90d', periodDays: 90 });
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=90d'),
        expect.any(Object),
      );
    });
  });
});
