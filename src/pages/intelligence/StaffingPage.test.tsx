import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
  },
}));

const mockResponse = vi.fn();

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => mockResponse(),
  })) as any;
  mockResponse.mockReturnValue({ forecast: [], peak: null });
});
afterEach(() => { globalThis.fetch = originalFetch; });

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

async function renderPage() {
  const { StaffingPage } = await import('./StaffingPage');
  return render(<StaffingPage />, { wrapper });
}

describe('StaffingPage', () => {
  it('renders the title', async () => {
    await renderPage();
    expect(screen.getByText('Previsão de Demanda')).toBeInTheDocument();
  });

  it('shows empty state with no data', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Dados insuficientes')).toBeInTheDocument();
    });
  });

  it('shows stat card labels with data', async () => {
    mockResponse.mockReturnValue({
      forecast: [
        { date: '2026-07-15', forecast: 42, lower: 35, upper: 49, staffing: { agents: 2, status: 'ok' } },
      ],
      peak: { date: '2026-07-15', forecast: 42, lower: 35, upper: 49, staffing: { agents: 2, status: 'ok' } },
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pico previsto')).toBeInTheDocument();
    });
  });
});
