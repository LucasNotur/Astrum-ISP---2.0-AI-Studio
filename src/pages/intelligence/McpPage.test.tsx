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

const mockFetchKeys = vi.fn();

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/mcp/keys')) return { ok: true, json: async () => mockFetchKeys() };
    return { ok: false, status: 404 };
  }) as any;
  mockFlags.mockReturnValue({ flags: { mcp: true }, isLoading: false });
  mockFetchKeys.mockResolvedValue({ keys: [], readOnlyTools: ['check_invoice', 'check_coverage'] });
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
  const { McpPage } = await import('./McpPage');
  return render(<McpPage />, { wrapper });
}

describe('McpPage', () => {
  it('shows empty state when no keys', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma chave MCP.')).toBeInTheDocument();
    });
  });

  it('shows flag-off message when mcp flag is off', async () => {
    mockFlags.mockReturnValue({ flags: { mcp: false }, isLoading: false });
    await renderPage();
    expect(screen.getByText(/MCP_SERVER_ENABLED/)).toBeInTheDocument();
  });

  it('renders keys table', async () => {
    mockFetchKeys.mockResolvedValue({
      keys: [
        { id: 'k1', name: 'Claude Desktop', enabled: true, tools: ['check_invoice'], lastUsedAt: null, createdAt: '2026-01-01T00:00:00Z' },
      ],
      readOnlyTools: ['check_invoice'],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    });
  });

  it('shows Nova chave button', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nova chave')).toBeInTheDocument();
    });
  });
});
