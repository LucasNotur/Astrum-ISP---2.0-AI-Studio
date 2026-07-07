import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReplayPage from './ReplayPage';

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

describe('ReplayPage (IA-46)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza o wizard no passo 1 (Amostra) ao montar', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    render(<ReplayPage />, { wrapper });

    expect(await screen.findByText('Amostra')).toBeInTheDocument();
    expect(screen.getByLabelText('Data inicial')).toBeInTheDocument();
    expect(screen.getByLabelText('Data final')).toBeInTheDocument();
  });

  it('lista corridas concluídas vindas de GET /runs', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'r1', status: 'done', total: 50, pass_rate: 0.96, created_at: '2026-07-06T10:00:00Z' },
        { id: 'r2', status: 'failed', total: 50, pass_rate: null, created_at: '2026-07-06T09:00:00Z' },
      ],
    });
    render(<ReplayPage />, { wrapper });

    expect(await screen.findByText('96.0%')).toBeInTheDocument();
    expect(await screen.findByText('Concluído')).toBeInTheDocument();
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });

  it('mostra EmptyState quando não há corridas', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    render(<ReplayPage />, { wrapper });
    expect(await screen.findByText('Nenhum replay executado.')).toBeInTheDocument();
  });

  it('avança do passo 1 para o passo 2 (Confirmar) quando o range é válido', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => [] });
    render(<ReplayPage />, { wrapper });

    const nextBtn = await screen.findByRole('button', { name: /Continuar/ });
    fireEvent.click(nextBtn);

    expect(await screen.findByText('Confirmar')).toBeInTheDocument();
    expect(screen.getByText(/SEM enviar mensagens e SEM executar ações reais/)).toBeInTheDocument();
  });

  it('POST /replay é chamado ao clicar em Iniciar replay (passo 2)', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ run_id: 'run-new' }) };
      }
      return { ok: true, json: async () => [] };
    });
    render(<ReplayPage />, { wrapper });

    fireEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar replay/ }));

    await waitFor(() => {
      const post = ((globalThis.fetch as any).mock.calls as any[]).find(
        (c) => c[1]?.method === 'POST',
      );
      expect(post).toBeTruthy();
      expect(post[0]).toContain('/api/v2/ia/replay');
    });
  });

  it('abre o detalhe da corrida ao clicar em "Ver divergentes"', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (url.includes('/runs/r1')) {
        return {
          ok: true,
          json: async () => ({
            status: 'done',
            total: 50,
            equivalent: 48,
            pass_rate: 0.96,
            items: [
              {
                id: 'i1',
                run_id: 'r1',
                conversation_id: 'cv1',
                user_message: 'Internet caiu',
                original_response: 'Vou verificar',
                candidate_response: 'Já vou olhar',
                verdict: 'divergente',
                judge_rationale: 'tom diferente',
              },
            ],
            page: 1,
            pageSize: 100,
          }),
        };
      }
      return {
        ok: true,
        json: async () => [
          { id: 'r1', status: 'done', total: 50, pass_rate: 0.96, created_at: '2026-07-06T10:00:00Z' },
        ],
      };
    });
    render(<ReplayPage />, { wrapper });

    const openBtn = await screen.findByRole('button', { name: /Ver divergentes/ });
    fireEvent.click(openBtn);

    // 'Divergentes' aparece em dois lugares (CardTitle + botão de filtro);
    // usamos o heading do card para desambiguar.
    expect(await screen.findByRole('heading', { name: /Divergentes/ })).toBeInTheDocument();
    expect(await screen.findByText('Internet caiu')).toBeInTheDocument();
    expect(await screen.findByText('tom diferente')).toBeInTheDocument();
  });
});
