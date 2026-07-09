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
    if (u.includes('/ocr/queue')) return { ok: true, json: async () => mockFetchQueue() };
    return { ok: false, status: 404 };
  }) as any;
  mockFlags.mockReturnValue({ flags: { reviewqueue: true }, isLoading: false });
  mockFetchQueue.mockResolvedValue({ queue: [] });
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
  const { ReviewQueuePage } = await import('./ReviewQueuePage');
  return render(<ReviewQueuePage />, { wrapper });
}

describe('ReviewQueuePage', () => {
  it('shows empty state when no items', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhum documento aguardando revisão.')).toBeInTheDocument();
    });
  });

  it('shows flag-off message when reviewqueue flag is off', async () => {
    mockFlags.mockReturnValue({ flags: { reviewqueue: false }, isLoading: false });
    await renderPage();
    expect(screen.getByText(/OCR_MULTILAYOUT_ENABLED/)).toBeInTheDocument();
  });

  it('renders item with editable fields and action buttons', async () => {
    mockFetchQueue.mockResolvedValue({
      queue: [{
        id: 'ocr1',
        doc_type: 'energia',
        media_url: null,
        extraction: { distribuidora: 'CEMIG', valor_cents: 15000 },
        confidence: 0.72,
        review_status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
      }],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Conta de Energia')).toBeInTheDocument();
    });
    expect(screen.getByText('Aprovar')).toBeInTheDocument();
    expect(screen.getByText('Corrigir e aprovar')).toBeInTheDocument();
    expect(screen.getByDisplayValue('CEMIG')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15000')).toBeInTheDocument();
  });

  it('shows counter for multiple items', async () => {
    mockFetchQueue.mockResolvedValue({
      queue: [
        { id: 'a', doc_type: 'boleto', media_url: null, extraction: { valor_cents: 100 }, confidence: 0.5, review_status: 'pending', created_at: '2026-01-01' },
        { id: 'b', doc_type: 'energia', media_url: null, extraction: { kwh: 200 }, confidence: 0.6, review_status: 'pending', created_at: '2026-01-02' },
      ],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
    });
  });
});
