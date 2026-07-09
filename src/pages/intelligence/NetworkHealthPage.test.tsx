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
  mockResponse.mockReturnValue({ anomalies: [] });
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
  const { NetworkHealthPage } = await import('./NetworkHealthPage');
  return render(<NetworkHealthPage />, { wrapper });
}

describe('NetworkHealthPage', () => {
  it('renders the title', async () => {
    await renderPage();
    expect(screen.getByText('Saúde da Rede')).toBeInTheDocument();
  });

  it('shows empty state when no anomalies', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rede saudável')).toBeInTheDocument();
    });
  });

  it('shows stat card labels with data', async () => {
    mockResponse.mockReturnValue({
      anomalies: [
        { id: '1', cto_id: 'CTO-01', metric: 'signal_loss', value: 12.5, expected: 3.0, zscore: 4.2, severity: 'alto', created_at: '2026-07-08T10:00:00Z' },
      ],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Severidade alta')).toBeInTheDocument();
    });
  });
});
