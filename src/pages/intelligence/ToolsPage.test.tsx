import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ToolsPage from './ToolsPage';

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const CATALOG = [
  { name: 'suspend_signal', description: 'suspende', enabled: true,  calls7d: 18, errors7d: 0 },
  { name: 'check_invoice',  description: 'faturas',  enabled: true,  calls7d: 412, errors7d: 2 },
  { name: 'check_coverage', description: 'cobertura',enabled: false, calls7d: 0,  errors7d: 0 },
];

describe('ToolsPage (IA-19)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza linhas do catálogo após carregar', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => CATALOG,
    });

    render(<ToolsPage />, { wrapper });

    expect(await screen.findByText('suspend_signal')).toBeInTheDocument();
    expect(await screen.findByText('check_invoice')).toBeInTheDocument();
    expect(await screen.findByText('check_coverage')).toBeInTheDocument();
    expect(await screen.findByText('412')).toBeInTheDocument();
  });

  it('desativar tool não-crítica dispara PATCH direto', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => CATALOG };
    });

    render(<ToolsPage />, { wrapper });
    const switchEl = await screen.findByLabelText(/Ativa check_invoice/);
    fireEvent.click(switchEl);

    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls as any[];
      const patch = calls.find((c) => c[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(patch[0]).toContain('/api/v2/ia/tools/check_invoice');
    });
  });

  it('desativar suspend_signal exige confirmação via dialog', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => CATALOG };
    });

    render(<ToolsPage />, { wrapper });
    const switchEl = await screen.findByLabelText(/Ativa suspend_signal/);
    fireEvent.click(switchEl);

    // dialog abre; sem clicar em "Desativar", PATCH não é chamado
    expect(await screen.findByText(/A régua de cobrança automática não é afetada/)).toBeInTheDocument();
    const patchCalls = ((globalThis.fetch as any).mock.calls as any[]).filter((c) => c[1]?.method === 'PATCH');
    expect(patchCalls).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Desativar$/ }));

    await waitFor(() => {
      const calls = ((globalThis.fetch as any).mock.calls as any[]).filter((c) => c[1]?.method === 'PATCH');
      expect(calls).toHaveLength(1);
    });
  });
});
