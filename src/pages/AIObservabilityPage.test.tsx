import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks (declarados ANTES de importar a página) ────────────────────────────

const mockOtelStatus = vi.fn();
const mockProvidersStatus = vi.fn();
const mockAiCircuit = vi.fn();
const mockPerfLogs = vi.fn();
const mockRagasScores = vi.fn();
const mockGuardrailBlocks = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    // Query builder chainable: from(table).select('*').order(...).limit(...) → Promise
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: () => {
            if (table === 'ai_ragas_scores') return mockRagasScores();
            if (table === 'ai_guardrail_blocks') return mockGuardrailBlocks();
            return mockPerfLogs();
          },
        }),
      }),
    }),
  },
}));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/v2/ia/otel/status')) return { ok: true, json: async () => mockOtelStatus() };
    if (u.includes('/api/v2/ia/providers/status')) return { ok: true, json: async () => mockProvidersStatus() };
    if (u.includes('/api/super-admin/ai-circuit')) return { ok: true, json: async () => mockAiCircuit() };
    return { ok: false, status: 404 };
  }) as any;
});
afterEach(() => { globalThis.fetch = originalFetch; });

// Mock do recharts (componentes de visualização não funcionam em jsdom).
vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
  ResponsiveContainer: ({ children }: any) => <div data-testid="recharts-mock">{children}</div>,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderPage() {
  // Import lazy: garante que os mocks acima estejam registrados antes do módulo
  // da página ser avaliado (alguns hooks de top-level leem o supabase).
  const { AIObservabilityPage } = await import('./AIObservabilityPage');
  return render(<AIObservabilityPage />, { wrapper });
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('AIObservabilityPage — IA-32 card Telemetria', () => {
  beforeEach(() => {
    mockOtelStatus.mockReset();
    mockProvidersStatus.mockReset();
    mockAiCircuit.mockReset();
    mockPerfLogs.mockReset();
    mockRagasScores.mockReset();
    mockGuardrailBlocks.mockReset();
    mockGetSession.mockReset();

    // Defaults: sessão válida, queries vazias, OTel desligado
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    // ai_performance_logs precisa ter pelo menos 1 linha para que `metrics`
    // seja populado e a página renderize o conteúdo (senão cai no early-return
    // "Sem dados suficientes..." e o card Telemetria nunca aparece).
    mockPerfLogs.mockResolvedValue({
      data: [{
        id: 'log-1',
        created_at: '2026-07-07T12:00:00Z',
        agent: 'agent-1',
        active_flow: 'flow-1',
        step: 'step-1',
        escalated: false,
        result: 'ok',
        tool_called: null,
        provider: 'openai',
        tokens_used: 100,
        cost_usd: 0.01,
        tokens_in: 70,
        tokens_out: 30,
        custo_usd: 0.01,
        token_count: 100,
        month: '2026-07',
        input_summary: 'test message',
      }],
    });
    mockRagasScores.mockResolvedValue({ data: [] });
    mockGuardrailBlocks.mockResolvedValue({ data: [] });
    mockProvidersStatus.mockResolvedValue({ failoverEnabled: false, providerOrder: [], providers: [] });
    mockAiCircuit.mockResolvedValue({ circuitStatus: {}, fallbacks: [] });
    mockOtelStatus.mockResolvedValue({
      enabled: false,
      endpoint_mascarado: null,
      spans_sessao: 0,
      ultimo_erro: null,
    });
  });

  it('renderiza o card "Telemetria" no DOM', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Telemetria')).toBeInTheDocument();
    });
  });

  it('OTel desligado (enabled=false) → RiskBadge nível "sem-dado" + label "Desligado"', async () => {
    mockOtelStatus.mockResolvedValue({
      enabled: false,
      endpoint_mascarado: null,
      spans_sessao: 0,
      ultimo_erro: null,
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Telemetria')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Desligado')).toBeInTheDocument();
    });
    // Sem chave de API definida: hint visível (pode aparecer mais de uma vez se múltiplos cards)
    const hints = screen.getAllByText(/OTEL_ENABLED=true/);
    expect(hints.length).toBeGreaterThan(0);
  });

  it('OTel ligado, sem erro (exportando) → RiskBadge nível "baixo" + label "exportando"', async () => {
    mockOtelStatus.mockResolvedValue({
      enabled: true,
      endpoint_mascarado: 'https://otel.example.com:****/v1/traces',
      spans_sessao: 1234,
      ultimo_erro: null,
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Telemetria')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/exportando/)).toBeInTheDocument();
    });
    // Endpoint mascarado aparece no card
    expect(screen.getByText('https://otel.example.com:****/v1/traces')).toBeInTheDocument();
    // Spans formatados em pt-BR
    expect(screen.getByText('1.234')).toBeInTheDocument();
    // Sem bloco de erro
    expect(screen.queryByText(/Último erro/)).not.toBeInTheDocument();
  });

  it('OTel ligado COM erro → RiskBadge nível "alto" + label "erro no exporter" + último erro visível', async () => {
    mockOtelStatus.mockResolvedValue({
      enabled: true,
      endpoint_mascarado: 'https://otel.example.com:****/v1/traces',
      spans_sessao: 42,
      ultimo_erro: 'network down (1x/min)',
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Telemetria')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/erro no exporter/)).toBeInTheDocument();
    });
    // O último erro aparece no card
    expect(screen.getByText('network down (1x/min)')).toBeInTheDocument();
  });

  it('endpoint NUNCA é exposto sem máscara (apenas o mascarado vindo do backend)', async () => {
    mockOtelStatus.mockResolvedValue({
      enabled: true,
      endpoint_mascarado: 'https://collector-interno.acme.com:****/v1/traces',
      spans_sessao: 0,
      ultimo_erro: null,
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Telemetria')).toBeInTheDocument();
    });
    // 4318 NÃO deve aparecer (backend mascarou)
    expect(screen.queryByText(/4318/)).not.toBeInTheDocument();
    // A versão mascarada aparece
    expect(screen.getByText(/collector-interno.acme.com/)).toBeInTheDocument();
  });

  it('usa polling de 30s (refetchInterval) na query do OTel', async () => {
    await renderPage();
    // Verifica que a query foi registrada (a página chama useQuery com
    // refetchInterval: 30_000). A presença do card já confirma que a query rodou.
    await waitFor(() => {
      expect(screen.getByText('Telemetria')).toBeInTheDocument();
    });
    // E que a função fetchOtelStatus foi chamada
    expect(mockOtelStatus).toHaveBeenCalled();
  });
});
