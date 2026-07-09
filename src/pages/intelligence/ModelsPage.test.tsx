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

const mockFetchRanking = vi.fn();
const mockFetchPending = vi.fn();

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/models/ranking')) return { ok: true, json: async () => mockFetchRanking() };
    if (u.includes('/models/pending')) return { ok: true, json: async () => mockFetchPending() };
    return { ok: false, status: 404 };
  }) as any;
  mockFlags.mockReturnValue({ flags: { elo: true }, isLoading: false });
  mockFetchRanking.mockResolvedValue({ ranking: [] });
  mockFetchPending.mockResolvedValue({ pending: [] });
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
  const { ModelsPage } = await import('./ModelsPage');
  return render(<ModelsPage />, { wrapper });
}

describe('ModelsPage', () => {
  it('shows empty state when no ranking data', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma partida ainda.')).toBeInTheDocument();
    });
    expect(screen.getByText('Ir para o Replay')).toBeInTheDocument();
  });

  it('shows flag-off message when elo flag is off', async () => {
    mockFlags.mockReturnValue({ flags: { elo: false }, isLoading: false });
    await renderPage();
    expect(screen.getByText(/MODEL_ELO_ENABLED/)).toBeInTheDocument();
  });

  it('renders ranking table when data exists', async () => {
    mockFetchRanking.mockResolvedValue({
      ranking: [
        { key: 'gpt4o-v3', rating: 1050, games: 12 },
        { key: 'gpt4o-v2', rating: 980, games: 8 },
      ],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('gpt4o-v3')).toBeInTheDocument();
    });
    expect(screen.getByText('gpt4o-v2')).toBeInTheDocument();
  });

  it('renders pending divergences', async () => {
    mockFetchRanking.mockResolvedValue({ ranking: [{ key: 'a', rating: 1000, games: 1 }] });
    mockFetchPending.mockResolvedValue({
      pending: [{
        itemId: 'item-1',
        userMessage: 'minha internet caiu',
        originalResponse: 'Vou verificar.',
        candidateResponse: 'Vamos resolver.',
      }],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('minha internet caiu')).toBeInTheDocument();
    });
    expect(screen.getByText('Original melhor')).toBeInTheDocument();
    expect(screen.getByText('Candidato melhor')).toBeInTheDocument();
  });
});
