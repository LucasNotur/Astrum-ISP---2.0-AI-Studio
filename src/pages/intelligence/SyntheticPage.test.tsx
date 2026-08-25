import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SyntheticPage from './SyntheticPage';

// F1-D2 — role/isSandbox agora vêm de GET /api/v2/auth/me (apiClient), não mais de
// `supabase.from('tenants'|'users')` direto (o mock antigo simulava isso).
const meState: { role: string | null; isSandbox: boolean } = { role: null, isSandbox: false };

vi.mock('@/src/lib/apiClient', () => ({
  apiGet: vi.fn((path: string) => {
    if (path === '/api/v2/auth/me') {
      return Promise.resolve({ role: meState.role, isSandbox: meState.isSandbox });
    }
    return Promise.reject(new Error(`apiGet inesperado no teste: ${path}`));
  }),
}));

vi.mock('@/src/lib/apiAuth', () => ({
  getApiAccessToken: vi.fn().mockResolvedValue('tok'),
}));

// Mock do hook de flags
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

describe('SyntheticPage (IA-45)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
    meState.role = null;
    meState.isSandbox = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    flagsState.flags = {};
    flagsState.isLoading = false;
  });

  it('amber banner sempre visível, mesmo com gates falhando', async () => {
    flagsState.flags = {};

    render(<SyntheticPage />, { wrapper });

    expect(
      await screen.findByText(/Disponível apenas em tenants de teste/),
    ).toBeInTheDocument();
  });

  it('flag off → mostra "recurso desabilitado" e NÃO mostra o form', async () => {
    flagsState.flags = { synthdata: false };
    meState.role = 'super_admin';
    meState.isSandbox = true;

    render(<SyntheticPage />, { wrapper });

    expect(
      await screen.findByText(/SYNTH_DATA_ENABLED=false/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar dataset/ })).not.toBeInTheDocument();
  });

  it('não super_admin → mostra "restrito a super_admin" e NÃO mostra o form', async () => {
    flagsState.flags = { synthdata: true };
    meState.role = 'admin';
    meState.isSandbox = true;

    render(<SyntheticPage />, { wrapper });

    expect(await screen.findByText(/restrito a super_admin/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar dataset/ })).not.toBeInTheDocument();
  });

  it('tenant real (is_sandbox=false) → mostra "ambiente de teste" e NÃO mostra o form', async () => {
    flagsState.flags = { synthdata: true };
    meState.role = 'super_admin';
    meState.isSandbox = false;

    render(<SyntheticPage />, { wrapper });

    expect(await screen.findByText(/Este provedor não é um ambiente de teste/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar dataset/ })).not.toBeInTheDocument();
  });

  it('sandbox + super_admin + flag on → mostra o form completo', async () => {
    flagsState.flags = { synthdata: true };
    meState.role = 'super_admin';
    meState.isSandbox = true;

    render(<SyntheticPage />, { wrapper });

    // Botão "Gerar dataset" só aparece quando passa em todos os gates
    expect(
      await screen.findByRole('button', { name: /Gerar dataset/ }),
    ).toBeInTheDocument();
    // Sliders presentes
    expect(screen.getByLabelText(/Conversas a gerar/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mídia/)).toBeInTheDocument();
  });

  it('form mostra "Restante: X%" baseado no mix default (soma 100)', async () => {
    flagsState.flags = { synthdata: true };
    meState.role = 'super_admin';
    meState.isSandbox = true;

    render(<SyntheticPage />, { wrapper });

    await screen.findByRole('button', { name: /Gerar dataset/ });
    // default mix: 25+35+20+20 = 100 → restante 0
    expect(await screen.findByText(/Restante: 0%/)).toBeInTheDocument();
  });

  it('clicando Gerar dataset chama POST /api/v2/ia/synthetic/generate', async () => {
    flagsState.flags = { synthdata: true };
    meState.role = 'super_admin';
    meState.isSandbox = true;
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: 'job-99' }),
    });

    render(<SyntheticPage />, { wrapper });

    const button = await screen.findByRole('button', { name: /Gerar dataset/ });
    button.click();

    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls as any[];
      const post = calls.find((c) => c[1]?.method === 'POST');
      expect(post).toBeTruthy();
      expect(post[0]).toContain('/api/v2/ia/synthetic/generate');
    });
  });
});
