import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProviderFallbackOrderCard } from './ProviderFallbackOrderCard';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

interface MockResponse {
  failoverEnabled?: boolean;
  providerOrder?: string[];
  providers?: Array<{
    name: 'openai' | 'anthropic' | 'google';
    keyPresent: boolean;
    circuit: 'closed' | 'open' | 'half-open';
    avgLatency24h: number | null;
  }>;
}

const FULL_RESPONSE: MockResponse = {
  failoverEnabled: true,
  providerOrder: ['openai', 'anthropic', 'google'],
  providers: [
    { name: 'openai', keyPresent: true, circuit: 'closed', avgLatency24h: 420 },
    { name: 'anthropic', keyPresent: true, circuit: 'half-open', avgLatency24h: 980 },
    { name: 'google', keyPresent: false, circuit: 'closed', avgLatency24h: null },
  ],
};

function mockFetchResponse(body: MockResponse | null, opts: { ok?: boolean } = {}) {
  const ok = opts.ok ?? true;
  (globalThis.fetch as any).mockResolvedValue({
    ok,
    json: async () => body ?? {},
  });
}

describe('ProviderFallbackOrderCard (IA-43)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    window.localStorage.setItem('sb-access-token', 'fake-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
  });

  it('exibe estado de loading (skeleton) antes da resposta', () => {
    // Sem mockResolvedValue — fetch fica pendente, query em loading
    (globalThis.fetch as any).mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProviderFallbackOrderCard />, { wrapper });
    // Skeletons têm classe animate-pulse
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('exibe mensagem de erro quando a API responde !ok', async () => {
    mockFetchResponse(null, { ok: false });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Não foi possível consultar o status dos providers.')).toBeInTheDocument();
    });
  });

  it('exibe badge "failover on" quando failoverEnabled=true', async () => {
    mockFetchResponse(FULL_RESPONSE);
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('failover on')).toBeInTheDocument();
    });
  });

  it('exibe badge "failover off" quando failoverEnabled=false', async () => {
    mockFetchResponse({ ...FULL_RESPONSE, failoverEnabled: false });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/failover off/)).toBeInTheDocument();
    });
  });

  it('renderiza os providers na ordem do PROVIDER_ORDER', async () => {
    mockFetchResponse({
      failoverEnabled: true,
      providerOrder: ['anthropic', 'openai', 'google'],
      providers: [
        { name: 'openai', keyPresent: true, circuit: 'closed', avgLatency24h: 420 },
        { name: 'anthropic', keyPresent: true, circuit: 'closed', avgLatency24h: 410 },
        { name: 'google', keyPresent: true, circuit: 'closed', avgLatency24h: 380 },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      // Esperado: #1 Anthropic, #2 OpenAI, #3 Google
      expect(items[0]!.textContent).toMatch(/Anthropic/);
      expect(items[1]!.textContent).toMatch(/OpenAI/);
      expect(items[2]!.textContent).toMatch(/Google/);
    });
  });

  it('renderiza a numeração ordinal (#1, #2, #3)', async () => {
    mockFetchResponse(FULL_RESPONSE);
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('#3')).toBeInTheDocument();
    });
  });

  it('renderiza RiskBadge "Baixo · operando" para circuito fechado', async () => {
    mockFetchResponse({
      failoverEnabled: true,
      providerOrder: ['openai'],
      providers: [
        { name: 'openai', keyPresent: true, circuit: 'closed', avgLatency24h: 420 },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Baixo/)).toBeInTheDocument();
      expect(screen.getByText(/operando/)).toBeInTheDocument();
    });
  });

  it('renderiza RiskBadge "Médio · instável" para circuito meio-aberto', async () => {
    mockFetchResponse({
      failoverEnabled: true,
      providerOrder: ['openai'],
      providers: [
        { name: 'openai', keyPresent: true, circuit: 'half-open', avgLatency24h: 980 },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Médio/)).toBeInTheDocument();
      expect(screen.getByText(/instável/)).toBeInTheDocument();
    });
  });

  it('renderiza RiskBadge "Alto · fora" para circuito aberto', async () => {
    mockFetchResponse({
      failoverEnabled: true,
      providerOrder: ['openai'],
      providers: [
        { name: 'openai', keyPresent: true, circuit: 'open', avgLatency24h: 5000 },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Alto/)).toBeInTheDocument();
      expect(screen.getByText(/fora/)).toBeInTheDocument();
    });
  });

  it('renderiza badge "sem chave" quando keyPresent=false', async () => {
    mockFetchResponse({
      failoverEnabled: true,
      providerOrder: ['google'],
      providers: [
        { name: 'google', keyPresent: false, circuit: 'closed', avgLatency24h: null },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/sem chave/)).toBeInTheDocument();
    });
  });

  it('cai na ordem default se providerOrder vier vazio', async () => {
    mockFetchResponse({
      failoverEnabled: false,
      providerOrder: [],
      providers: [
        { name: 'openai', keyPresent: true, circuit: 'closed', avgLatency24h: 420 },
        { name: 'anthropic', keyPresent: true, circuit: 'closed', avgLatency24h: 410 },
        { name: 'google', keyPresent: true, circuit: 'closed', avgLatency24h: 380 },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items[0]!.textContent).toMatch(/OpenAI/);
      expect(items[1]!.textContent).toMatch(/Anthropic/);
      expect(items[2]!.textContent).toMatch(/Google/);
    });
  });

  it('ignora providers inválidos em providerOrder', async () => {
    mockFetchResponse({
      failoverEnabled: true,
      providerOrder: ['openai', 'foo', 'anthropic', 'bar'],
      providers: [
        { name: 'openai', keyPresent: true, circuit: 'closed', avgLatency24h: 420 },
        { name: 'anthropic', keyPresent: true, circuit: 'closed', avgLatency24h: 410 },
      ],
    });
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      // Apenas openai e anthropic devem renderizar
      expect(items).toHaveLength(2);
    });
  });

  it('inclui nota sobre o env PROVIDER_ORDER no rodapé', async () => {
    mockFetchResponse(FULL_RESPONSE);
    render(<ProviderFallbackOrderCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/PROVIDER_ORDER/)).toBeInTheDocument();
      expect(screen.getByText(/PROVIDER_FAILOVER_ENABLED/)).toBeInTheDocument();
    });
  });
});
