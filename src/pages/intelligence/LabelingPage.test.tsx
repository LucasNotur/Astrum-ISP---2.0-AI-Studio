import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockFlags = vi.fn();
vi.mock('@/src/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => mockFlags(),
}));

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
  },
}));

const mockFetchQueue = vi.fn();

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/labeling/queue')) return { ok: true, json: async () => mockFetchQueue() };
    if (u.includes('/labeling/export')) return { ok: true, blob: async () => new Blob(['{}']) };
    return { ok: false, status: 404 };
  }) as any;
  mockFlags.mockReturnValue({ flags: { activelearn: true }, isLoading: false });
  mockFetchQueue.mockResolvedValue({ queue: [], enabled: true });
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
  const { LabelingPage } = await import('./LabelingPage');
  return render(<LabelingPage />, { wrapper });
}

describe('LabelingPage', () => {
  it('shows empty state when queue is empty', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Fila vazia')).toBeInTheDocument();
    });
  });

  it('shows flag-off message when activelearn flag is off', async () => {
    mockFlags.mockReturnValue({ flags: { activelearn: false }, isLoading: false });
    await renderPage();
    expect(screen.getByText(/ACTIVE_LEARNING_ENABLED/)).toBeInTheDocument();
  });

  it('renders current example with label buttons', async () => {
    mockFetchQueue.mockResolvedValue({
      queue: [{
        id: 'ex1',
        source: 'feedback',
        input: 'minha internet caiu',
        output: 'Vou verificar.',
        label: null,
        createdAt: '2026-01-01T00:00:00Z',
      }],
      enabled: true,
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('minha internet caiu')).toBeInTheDocument();
    });
    expect(screen.getByText('correto')).toBeInTheDocument();
    expect(screen.getByText('incorreto')).toBeInTheDocument();
    expect(screen.getByText('ambíguo')).toBeInTheDocument();
  });

  it('shows export button', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Exportar JSONL')).toBeInTheDocument();
    });
  });
});
