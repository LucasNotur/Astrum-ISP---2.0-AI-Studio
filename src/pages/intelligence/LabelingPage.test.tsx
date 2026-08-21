import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockFlags = vi.fn();
vi.mock('@/src/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => mockFlags(),
}));

vi.mock('@/src/lib/apiAuth', () => ({
  getApiAccessToken: vi.fn().mockResolvedValue('tok'),
}));

const mockFetchQueue = vi.fn();

const exampleItem = {
  id: 'ex1',
  source: 'feedback',
  input: 'minha internet caiu',
  output: 'Vou verificar.',
  label: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/labeling/queue')) return { ok: true, json: async () => mockFetchQueue() };
    if (u.includes('/labeling/export')) return { ok: true, blob: async () => new Blob(['{}']) };
    // Aba default "Rascunhos KB" busca /kb/drafts — devolve vazio válido p/ não quebrar o render.
    return { ok: true, json: async () => ({ drafts: [] }) };
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

// A rotulagem vive na aba "Rotulagem" (a aba default é "Rascunhos KB").
// Radix Tabs ativa por foco (activationMode automático) — click sintético não basta no jsdom.
async function openLabelingTab() {
  const tab = await screen.findByRole('tab', { name: /Rotulagem/ });
  tab.focus();
  fireEvent.click(tab);
}

describe('LabelingPage', () => {
  it('shows empty state when queue is empty', async () => {
    await renderPage();
    await openLabelingTab();
    await waitFor(() => {
      expect(screen.getByText('Fila vazia')).toBeInTheDocument();
    });
  });

  it('shows flag-off message when activelearn flag is off', async () => {
    mockFlags.mockReturnValue({ flags: { activelearn: false }, isLoading: false });
    await renderPage();
    await openLabelingTab();
    expect(await screen.findByText(/ACTIVE_LEARNING_ENABLED/)).toBeInTheDocument();
  });

  it('renders current example with label buttons', async () => {
    mockFetchQueue.mockResolvedValue({ queue: [exampleItem], enabled: true });
    await renderPage();
    await openLabelingTab();
    await waitFor(() => {
      expect(screen.getByText('minha internet caiu')).toBeInTheDocument();
    });
    expect(screen.getByText('correto')).toBeInTheDocument();
    expect(screen.getByText('incorreto')).toBeInTheDocument();
    expect(screen.getByText('ambíguo')).toBeInTheDocument();
  });

  it('shows export button when queue has items', async () => {
    mockFetchQueue.mockResolvedValue({ queue: [exampleItem], enabled: true });
    await renderPage();
    await openLabelingTab();
    await waitFor(() => {
      expect(screen.getByText('Exportar JSONL')).toBeInTheDocument();
    });
  });
});
