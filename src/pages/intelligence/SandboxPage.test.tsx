import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SandboxPage from './SandboxPage';

const usersMaybeSingle = vi.fn();
const sessionState: { userId: string | null } = { userId: 'u-1' };

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: {
            session: {
              access_token: 'tok',
              user: sessionState.userId
                ? { id: sessionState.userId, app_metadata: {}, user_metadata: {} }
                : null,
            },
          },
        }),
      ),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: usersMaybeSingle }) }) };
      }
      return { select: vi.fn() };
    }),
  },
}));

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

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: any }>) {
  let i = 0;
  (globalThis.fetch as any) = vi.fn().mockImplementation(async () => {
    const r = responses[i++] ?? responses[responses.length - 1];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body,
    };
  });
}

describe('SandboxPage (IA-44 / IA-38 E1)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    flagsState.flags = { sandbox: true };
    flagsState.isLoading = false;
    sessionState.userId = 'u-1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    flagsState.flags = {};
    flagsState.isLoading = false;
  });

  it('GATE: flag off → mostra card de "desabilitado" e NÃO mostra o editor', async () => {
    flagsState.flags = { sandbox: false };
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    render(<SandboxPage />, { wrapper });

    expect(
      await screen.findByText(/Sandbox do agente desabilitado/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Consulta')).not.toBeInTheDocument();
  });

  it('GATE: usuário comum (role != super_admin) → vê mensagem de acesso restrito', async () => {
    usersMaybeSingle.mockResolvedValue({ data: { role: 'support' }, error: null });
    render(<SandboxPage />, { wrapper });

    expect(await screen.findByText('Acesso restrito a super_admin.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Consulta')).not.toBeInTheDocument();
  });

  it('POST bem-sucedido: SQL → tabela renderiza colunas + tempo em mono', async () => {
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    // Sequência esperada:
    //  1ª = GET history (mount, historyQ.enabled)
    //  2ª = POST query (user clica em "Executar consulta")
    //  3ª = GET history (refetch no onSuccess do mutation)
    mockFetchSequence([
      { ok: true, body: { queries: [] } },
      {
        ok: true,
        body: {
          columns: ['id', 'name'],
          rows: [
            { id: '1', name: 'Alice' },
            { id: '2', name: 'Bob' },
          ],
          ms: 12.4,
        },
      },
      { ok: true, body: { queries: [] } },
    ]);

    render(<SandboxPage />, { wrapper });

    const textarea = await screen.findByLabelText('Consulta');
    fireEvent.change(textarea, {
      target: { value: 'SELECT id, name FROM vw_agent_customers WHERE tenant_id = $1 LIMIT 10;' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Executar consulta' }));

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Tempo em mono
    expect(screen.getByText(/12\.4 ms/)).toBeInTheDocument();
  });

  it('erro do guard (400 com hint): renderiza card vermelho com error + hint', async () => {
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        body: {
          error: 'Apenas SELECT é permitido.',
          hint: 'Comece a query com SELECT. INSERT/UPDATE/DELETE são bloqueados.',
        },
      },
    ]);

    render(<SandboxPage />, { wrapper });

    const textarea = await screen.findByLabelText('Consulta');
    fireEvent.change(textarea, { target: { value: 'DROP TABLE customers;' } });
    fireEvent.click(screen.getByRole('button', { name: 'Executar consulta' }));

    expect(await screen.findByText('Consulta rejeitada pelo guard de SQL')).toBeInTheDocument();
    expect(screen.getByText('Apenas SELECT é permitido.')).toBeInTheDocument();
    expect(
      screen.getByText(/Comece a query com SELECT\. INSERT\/UPDATE\/DELETE são bloqueados\./),
    ).toBeInTheDocument();
  });

  it('histórico: clica em um item → SQL carrega no editor', async () => {
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    // Sem POST; só o GET history.
    mockFetchSequence([
      {
        ok: true,
        body: {
          queries: [
            {
              id: 'h1',
              sql_text: 'SELECT * FROM vw_agent_customers LIMIT 5;',
              rows: 5,
              ms: 8.2,
              executed_at: new Date().toISOString(),
            },
          ],
        },
      },
    ]);

    render(<SandboxPage />, { wrapper });

    const item = await screen.findByText('SELECT * FROM vw_agent_customers LIMIT 5;');
    fireEvent.click(item);

    const textarea = (await screen.findByLabelText('Consulta')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('SELECT * FROM vw_agent_customers LIMIT 5;');
  });

  it('flag on + super_admin: mostra o editor, o botão "Executar consulta" e a hint', async () => {
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    mockFetchSequence([{ ok: true, body: { queries: [] } }]);

    render(<SandboxPage />, { wrapper });

    expect(await screen.findByLabelText('Consulta')).toBeInTheDocument();
    expect(
      screen.getByText(/Somente SELECT sobre vw_agent_customers, vw_agent_invoices/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Executar consulta' }),
    ).toBeInTheDocument();
  });

  it('botão Executar fica disabled enquanto o SQL está vazio', async () => {
    usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    mockFetchSequence([{ ok: true, body: { queries: [] } }]);

    render(<SandboxPage />, { wrapper });

    const btn = await screen.findByRole('button', { name: 'Executar consulta' });
    expect(btn).toBeDisabled();
  });
});
