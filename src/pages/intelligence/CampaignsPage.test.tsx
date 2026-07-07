import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CampaignsPage from './CampaignsPage';

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
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

const TWO_CAMPAIGNS = {
  campaigns: [
    {
      campaignKey: 'cobranca_d1',
      status: 'convergiu',
      variants: [
        {
          id: 'v1',
          variantKey: 'A',
          template: 'Olá {{customerName}}, pague sua fatura de R$ {{amountBRL}}.',
          alpha: 5,
          beta: 2,
          status: 'active',
          sent: 30,
          paid: 18,
          expired: 12,
          conversionRate: 0.6,
          ci95Low: 0.42,
          ci95High: 0.78,
        },
        {
          id: 'v2',
          variantKey: 'B',
          template: '{{customerName}}, sua fatura {{amountBRL}} está aberta. Pague hoje.',
          alpha: 2,
          beta: 5,
          status: 'active',
          sent: 30,
          paid: 9,
          expired: 21,
          conversionRate: 0.3,
          ci95Low: 0.15,
          ci95High: 0.45,
        },
      ],
    },
    {
      campaignKey: 'cobranca_d5',
      status: 'explorando',
      variants: [
        {
          id: 'v3',
          variantKey: 'A',
          template: 'Lembrete: fatura aberta {{amountBRL}}.',
          alpha: 1,
          beta: 1,
          status: 'paused',
          sent: 0,
          paid: 0,
          expired: 0,
          conversionRate: 0,
          ci95Low: 0,
          ci95High: 0,
        },
      ],
    },
  ],
};

const EMPTY = { campaigns: [] };

describe('CampaignsPage (IA-26)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza duas campanhas, badges, e identifica o líder pelo conversionRate', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => TWO_CAMPAIGNS,
    });

    render(<CampaignsPage />, { wrapper });

    // título
    expect(await screen.findByText('Campanhas Inteligentes')).toBeInTheDocument();

    // campaign keys visíveis
    expect(await screen.findByText('cobranca_d1')).toBeInTheDocument();
    expect(await screen.findByText('cobranca_d5')).toBeInTheDocument();

    // badges
    expect(await screen.findByText('convergiu')).toBeInTheDocument();
    expect(await screen.findByText('explorando')).toBeInTheDocument();

    // líder A na primeira campanha (conversionRate 0.6 > 0.3)
    expect(screen.getByText('líder')).toBeInTheDocument();

    // tabela: status "Pausada" para a variante da segunda campanha
    expect(screen.getByText('Pausada')).toBeInTheDocument();
  });

  it('exibe conversão como % mono com IC95 abaixo', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => TWO_CAMPAIGNS,
    });

    render(<CampaignsPage />, { wrapper });

    // 60.0% e 30.0% no formato pt-BR (com ponto decimal)
    expect(await screen.findByText('60.0%')).toBeInTheDocument();
    expect(await screen.findByText('30.0%')).toBeInTheDocument();

    // IC95 visível
    expect(screen.getByText(/IC95: 42\.0%–78\.0%/).textContent).toMatch(/42\.0%/);
  });

  it('trunca template longo e mostra título completo (tooltip nativo)', async () => {
    const longTemplate =
      'Olá {{customerName}}, identificamos que sua fatura {{invoiceId}} no valor de R$ {{amountBRL}} está aberta há {{daysOverdue}} dias. Pague pelo link {{paymentLink}} e evite suspensão.';
    const dataWithLongTpl = {
      campaigns: [
        {
          campaignKey: 'k',
          status: 'explorando',
          variants: [
            {
              id: 'v1',
              variantKey: 'A',
              template: longTemplate,
              alpha: 1,
              beta: 1,
              status: 'active',
              sent: 0,
              paid: 0,
              expired: 0,
              conversionRate: 0,
              ci95Low: 0,
              ci95High: 0,
            },
          ],
        },
      ],
    };
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => dataWithLongTpl,
    });

    render(<CampaignsPage />, { wrapper });

    const longTpl = await screen.findByTitle(longTemplate);
    expect(longTpl).toBeInTheDocument();
    // o texto renderizado está truncado (60 + …)
    expect(longTpl.textContent?.endsWith('…')).toBe(true);
    expect((longTpl.textContent ?? '').length).toBeLessThan(longTemplate.length);
  });

  it('empty state mostra copy correto E botão "Criar primeira variante" (primary)', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => EMPTY,
    });

    render(<CampaignsPage />, { wrapper });

    expect(
      await screen.findByText('Nenhuma campanha com variantes ainda.'),
    ).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: 'Criar primeira variante' });
    expect(cta).toBeInTheDocument();
  });

  it('abre o dialog de Pausar e dispara PATCH com status="paused"', async () => {
    (globalThis.fetch as any).mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => TWO_CAMPAIGNS });
    });

    render(<CampaignsPage />, { wrapper });

    const pauseButtons = await screen.findAllByRole('button', { name: 'Pausar' });
    fireEvent.click(pauseButtons[0]!);

    expect(
      await screen.findByText('Pausar a variante A?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ela sai do sorteio imediatamente. Os envios já feitos continuam contando conversão.',
      ),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Pausar' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls;
      const patchCall = calls.find(
        ([u, o]: [string, any]) => o?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      const [calledUrl, calledOpts] = patchCall!;
      expect(calledUrl).toMatch(/\/api\/v2\/ia\/campaigns\/variants\//);
      expect(JSON.parse(calledOpts.body)).toEqual({ status: 'paused' });
    });
  });

  it('abre dialog "Nova variante" e envia POST com campaign_key, variant_key e template', async () => {
    let postCalled = false;
    (globalThis.fetch as any).mockImplementation((url: string, opts?: any) => {
      if (opts?.method === 'POST') {
        postCalled = true;
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, variant: { id: 'v-new' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => TWO_CAMPAIGNS });
    });

    render(<CampaignsPage />, { wrapper });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Nova variante' }),
    );

    const campaignInput = await screen.findByPlaceholderText('ex.: cobranca_d1');
    const variantInput = screen.getByPlaceholderText('ex.: A');
    const templateArea = screen.getByLabelText('Template') as HTMLTextAreaElement;

    fireEvent.change(campaignInput, { target: { value: 'nova_campanha' } });
    fireEvent.change(variantInput, { target: { value: 'X' } });
    fireEvent.change(templateArea, {
      target: { value: 'Oi {{customerName}}, pague R$ {{amountBRL}}' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Criar variante' }));

    await waitFor(() => expect(postCalled).toBe(true));
  });
});
