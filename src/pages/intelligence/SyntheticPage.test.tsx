import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SyntheticPage from './SyntheticPage';

// Mock do supabase (auth + tabelas)
const tenantsMaybeSingle = vi.fn();
const usersMaybeSingle = vi.fn();
const sessionState: { tenantId: string | null; userId: string | null } = {
  tenantId: 't-1',
  userId: 'u-1',
};

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: {
            session: {
              access_token: 'tok',
              user: {
                id: sessionState.userId,
                app_metadata: sessionState.tenantId
                  ? { tenant_id: sessionState.tenantId }
                  : {},
                user_metadata: {},
              },
            },
          },
        }),
      ),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'tenants') {
        return { select: () => ({ eq: () => ({ maybeSingle: tenantsMaybeSingle }) }) };
      }
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: usersMaybeSingle }) }) };
      }
      return { select: vi.fn() };
    }),
  },
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
    sessionState.tenantId = 't-1';
    sessionState.userId = 'u-1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    flagsState.flags = {};
    flagsState.isLoading = false;
  });

  it('amber banner sempre visível, mesmo com gates falhando', async () => {
    flagsState.flags = {};
    usersMaybeSingle.mockResolvedValue({ data: null, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: null, error: null });

    render(<SyntheticPage />, { wrapper });

    expect(
      await screen.findByText(/Disponível apenas em tenants de teste/),
    ).toBeInTheDocument();
  });

  it('flag off → mostra "recurso desabilitado" e NÃO mostra o form', async () => {
    flagsState.flags = { synthdata: false };
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: { is_sandbox: true }, error: null });

    render(<SyntheticPage />, { wrapper });

    expect(
      await screen.findByText(/SYNTH_DATA_ENABLED=false/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar dataset/ })).not.toBeInTheDocument();
  });

  it('não super_admin → mostra "restrito a super_admin" e NÃO mostra o form', async () => {
    flagsState.flags = { synthdata: true };
    usersMaybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: { is_sandbox: true }, error: null });

    render(<SyntheticPage />, { wrapper });

    expect(await screen.findByText(/restrito a super_admin/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar dataset/ })).not.toBeInTheDocument();
  });

  it('tenant real (is_sandbox=false) → mostra "ambiente de teste" e NÃO mostra o form', async () => {
    flagsState.flags = { synthdata: true };
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: { is_sandbox: false }, error: null });

    render(<SyntheticPage />, { wrapper });

    expect(await screen.findByText(/Este provedor não é um ambiente de teste/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar dataset/ })).not.toBeInTheDocument();
  });

  it('sandbox + super_admin + flag on → mostra o form completo', async () => {
    flagsState.flags = { synthdata: true };
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: { is_sandbox: true }, error: null });

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
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: { is_sandbox: true }, error: null });

    render(<SyntheticPage />, { wrapper });

    await screen.findByRole('button', { name: /Gerar dataset/ });
    // default mix: 25+35+20+20 = 100 → restante 0
    expect(await screen.findByText(/Restante: 0%/)).toBeInTheDocument();
  });

  it('clicando Gerar dataset chama POST /api/v2/ia/synthetic/generate', async () => {
    flagsState.flags = { synthdata: true };
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    tenantsMaybeSingle.mockResolvedValue({ data: { is_sandbox: true }, error: null });
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
