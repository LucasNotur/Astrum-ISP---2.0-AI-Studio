/**
 * P4-01 / P4-02 — Portal do Assinante (PWA white-label)
 *
 * Acesso por CPF + nº de contrato (sem login de operador).
 * Self-service: 2ª via, diagnóstico, ordens de serviço, histórico.
 *
 * Tenant discovery:
 *   - URL param ?tenant=<tenantId>  (dev/local)
 *   - Subdomain slug (produção, futuro)
 */
import { useState, useEffect, useCallback } from 'react';

const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  amount_cents: number;
  due_date: string;
  status: 'open' | 'paid' | 'overdue' | 'cancelled';
  paid_at?: string;
  payment_url?: string;
  pix_copy_paste?: string;
}

interface ServiceOrder {
  id: string;
  type: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  description?: string;
  scheduled_for?: string;
  created_at: string;
}

interface DashboardData {
  customerId: string;
  overdueInvoices: number;
  openServiceOrders: number;
  recentInvoices: Invoice[];
  recentServiceOrders: ServiceOrder[];
}

interface DiagnosticResult {
  signal: 'ok' | 'no_signal' | 'degraded' | 'unknown';
  latencyMs?: number;
  packetLoss?: number;
  serviceOrderCreated: boolean;
  serviceOrderId?: string;
  message: string;
  simulated: boolean;
}

type Tab = 'dashboard' | 'invoices' | 'service-orders' | 'diagnostic';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function getTenantId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('tenant') ?? '';
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown, token?: string, tenantId?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

async function apiGet<T>(path: string, token: string, tenantId: string): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
  };
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-green-500/20 text-green-400',
    open: 'bg-yellow-500/20 text-yellow-400',
    overdue: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-slate-500/20 text-slate-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
  };
  const label: Record<string, string> = {
    paid: 'Pago', open: 'Em aberto', overdue: 'Vencida',
    cancelled: 'Cancelado', in_progress: 'Em andamento', completed: 'Concluído',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? 'bg-slate-500/20 text-slate-400'}`}>
      {label[status] ?? status}
    </span>
  );
}

function InvoiceCard({ inv, onCopyPix }: { inv: Invoice; onCopyPix: (pix: string) => void }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">{formatBRL(inv.amount_cents)}</span>
        <StatusBadge status={inv.status} />
      </div>
      <div className="text-sm text-slate-400">
        Vencimento: {formatDate(inv.due_date)}
        {inv.paid_at && <span className="ml-2 text-green-400">Pago em {formatDate(inv.paid_at)}</span>}
      </div>
      {(inv.status === 'open' || inv.status === 'overdue') && (
        <div className="flex gap-2 mt-1">
          {inv.pix_copy_paste && (
            <button
              onClick={() => onCopyPix(inv.pix_copy_paste!)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-1.5 rounded-lg transition-colors"
            >
              Copiar PIX
            </button>
          )}
          {inv.payment_url && (
            <a
              href={inv.payment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-1.5 rounded-lg transition-colors text-center"
            >
              Boleto
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function OsCard({ os }: { os: ServiceOrder }) {
  const typeLabel: Record<string, string> = {
    installation: 'Instalação',
    technical_visit: 'Visita Técnica',
    maintenance: 'Manutenção',
    removal: 'Remoção',
  };
  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">{typeLabel[os.type] ?? os.type}</span>
        <StatusBadge status={os.status} />
      </div>
      {os.description && <p className="text-sm text-slate-400 line-clamp-2">{os.description}</p>}
      <div className="text-xs text-slate-500">
        {os.scheduled_for
          ? `Agendada: ${formatDate(os.scheduled_for)}`
          : `Aberta em: ${formatDate(os.created_at)}`}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PortalPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [token, setToken] = useState<string | null>(null);
  const [tenantId] = useState(() => getTenantId());

  const [cpfInput, setCpfInput] = useState('');
  const [contractInput, setContractInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  // Injeta o manifest do portal + atualiza o título
  useEffect(() => {
    const prev = document.title;
    document.title = 'Portal do Assinante';

    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/portal-manifest.json';
    document.head.appendChild(link);

    return () => {
      document.title = prev;
      link.remove();
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const cpf = cpfInput.replace(/\D/g, '');
      const { token: t } = await apiPost<{ token: string; customerId: string }>(
        '/api/v2/portal/auth',
        { cpf, contract: contractInput.trim() },
        undefined,
        tenantId,
      );
      setToken(t);
    } catch (err: any) {
      setLoginError(err.message ?? 'CPF ou contrato inválidos.');
    } finally {
      setLoginLoading(false);
    }
  };

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const data = await apiGet<DashboardData>('/api/v2/portal/dashboard', token, tenantId);
      setDashboard(data);
    } finally {
      setDataLoading(false);
    }
  }, [token, tenantId]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const { invoices: data } = await apiGet<{ invoices: Invoice[] }>('/api/v2/portal/invoices', token, tenantId);
      setInvoices(data);
    } finally {
      setDataLoading(false);
    }
  }, [token, tenantId]);

  const loadServiceOrders = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const { serviceOrders: data } = await apiGet<{ serviceOrders: ServiceOrder[] }>('/api/v2/portal/service-orders', token, tenantId);
      setServiceOrders(data);
    } finally {
      setDataLoading(false);
    }
  }, [token, tenantId]);

  useEffect(() => {
    if (!token) return;
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'invoices') loadInvoices();
    if (tab === 'service-orders') loadServiceOrders();
  }, [token, tab, loadDashboard, loadInvoices, loadServiceOrders]);

  const handleDiagnostic = async () => {
    if (!token) return;
    setDiagLoading(true);
    setDiagnostic(null);
    try {
      const result = await apiPost<DiagnosticResult>('/api/v2/portal/diagnostic', {}, token, tenantId);
      setDiagnostic(result);
    } catch (err: any) {
      setDiagnostic({
        signal: 'unknown',
        simulated: true,
        serviceOrderCreated: false,
        message: err.message ?? 'Não foi possível completar o diagnóstico.',
      });
    } finally {
      setDiagLoading(false);
    }
  };

  const handleCopyPix = async (pix: string) => {
    await navigator.clipboard.writeText(pix);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const logout = () => {
    setToken(null);
    setDashboard(null);
    setInvoices([]);
    setServiceOrders([]);
    setDiagnostic(null);
    setCpfInput('');
    setContractInput('');
  };

  // ── Layout base ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-lg">📡</div>
          <span className="font-bold text-lg">Portal do Assinante</span>
        </div>
        {token && (
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Sair
          </button>
        )}
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        {!token ? (
          // ── Login ───────────────────────────────────────────────────────────
          <div className="mt-8">
            <h1 className="text-2xl font-bold mb-1">Acesse sua conta</h1>
            <p className="text-slate-400 mb-6 text-sm">
              Informe o CPF e o número do contrato que constam na sua fatura.
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">CPF</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpfInput}
                  onChange={e => setCpfInput(formatCpf(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Nº do Contrato</label>
                <input
                  type="text"
                  placeholder="Ex: 123456 ou CT-9999"
                  value={contractInput}
                  onChange={e => setContractInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              {loginError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
              >
                {loginLoading ? 'Verificando...' : 'Entrar'}
              </button>
            </form>

            {!tenantId && (
              <p className="mt-6 text-xs text-slate-600 text-center">
                Acesso via link do provedor. Se você chegou aqui diretamente, use o link enviado pelo seu provedor.
              </p>
            )}
          </div>
        ) : (
          // ── App autenticado ──────────────────────────────────────────────────
          <>
            {/* Tabs */}
            <nav className="flex gap-1 bg-slate-800 p-1 rounded-xl mb-6">
              {([
                ['dashboard', '🏠', 'Início'],
                ['invoices', '💳', 'Faturas'],
                ['service-orders', '🔧', 'Serviços'],
                ['diagnostic', '📶', 'Diagnóstico'],
              ] as const).map(([key, icon, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    tab === key
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            {dataLoading && (
              <div className="text-center py-12 text-slate-500">Carregando...</div>
            )}

            {/* Dashboard */}
            {tab === 'dashboard' && !dataLoading && dashboard && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800 rounded-xl p-4">
                    <div className="text-3xl font-bold text-red-400">{dashboard.overdueInvoices}</div>
                    <div className="text-sm text-slate-400 mt-1">Fatura(s) vencida(s)</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-4">
                    <div className="text-3xl font-bold text-blue-400">{dashboard.openServiceOrders}</div>
                    <div className="text-sm text-slate-400 mt-1">OS em aberto</div>
                  </div>
                </div>

                {dashboard.recentInvoices.length > 0 && (
                  <>
                    <h2 className="font-semibold text-slate-300 mt-2">Faturas recentes</h2>
                    {dashboard.recentInvoices.map(inv => (
                      <InvoiceCard key={inv.id} inv={inv} onCopyPix={handleCopyPix} />
                    ))}
                    <button
                      onClick={() => setTab('invoices')}
                      className="text-indigo-400 hover:text-indigo-300 text-sm text-center transition-colors"
                    >
                      Ver todas as faturas →
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Faturas */}
            {tab === 'invoices' && !dataLoading && (
              <div className="flex flex-col gap-3">
                <h2 className="font-semibold text-slate-300">Suas faturas</h2>
                {invoices.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-8">Nenhuma fatura encontrada.</p>
                )}
                {invoices.map(inv => (
                  <InvoiceCard key={inv.id} inv={inv} onCopyPix={handleCopyPix} />
                ))}
              </div>
            )}

            {/* OS */}
            {tab === 'service-orders' && !dataLoading && (
              <div className="flex flex-col gap-3">
                <h2 className="font-semibold text-slate-300">Ordens de Serviço</h2>
                {serviceOrders.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-8">Nenhuma ordem de serviço encontrada.</p>
                )}
                {serviceOrders.map(os => (
                  <OsCard key={os.id} os={os} />
                ))}
              </div>
            )}

            {/* Diagnóstico */}
            {tab === 'diagnostic' && (
              <div className="flex flex-col gap-4">
                <div className="bg-slate-800 rounded-xl p-6 text-center">
                  <div className="text-5xl mb-4">📶</div>
                  <h2 className="font-bold text-xl mb-2">Sua internet está com problema?</h2>
                  <p className="text-slate-400 text-sm mb-6">
                    Faça um diagnóstico agora. Se detectarmos algum problema, abriremos uma ordem de serviço automaticamente.
                  </p>
                  <button
                    onClick={handleDiagnostic}
                    disabled={diagLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold px-8 py-3 rounded-xl transition-colors w-full"
                  >
                    {diagLoading ? 'Analisando conexão...' : 'Iniciar diagnóstico'}
                  </button>
                </div>

                {diagnostic && (
                  <div className={`rounded-xl p-4 border ${
                    diagnostic.signal === 'ok'
                      ? 'bg-green-500/10 border-green-500/30'
                      : diagnostic.signal === 'unknown'
                        ? 'bg-slate-800 border-slate-700'
                        : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">
                        {diagnostic.signal === 'ok' ? '✅' : diagnostic.signal === 'unknown' ? '❓' : '⚠️'}
                      </span>
                      <span className="font-semibold">
                        {diagnostic.signal === 'ok' ? 'Conexão normal' :
                         diagnostic.signal === 'no_signal' ? 'Sem sinal detectado' :
                         diagnostic.signal === 'degraded' ? 'Conexão instável' : 'Diagnóstico inconclusivo'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">{diagnostic.message}</p>
                    {diagnostic.latencyMs && (
                      <p className="text-xs text-slate-500 mt-2">
                        Latência: {diagnostic.latencyMs}ms{diagnostic.packetLoss !== undefined ? ` · Perda: ${diagnostic.packetLoss}%` : ''}
                        {diagnostic.simulated && ' · (dados simulados)'}
                      </p>
                    )}
                    {diagnostic.serviceOrderCreated && diagnostic.serviceOrderId && (
                      <div className="mt-3 bg-slate-700 rounded-lg px-3 py-2 text-sm">
                        OS aberta automaticamente: <span className="font-mono text-indigo-400">#{diagnostic.serviceOrderId}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Toast PIX copiado */}
      {copiedPix && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
          PIX copiado! ✓
        </div>
      )}

      <footer className="text-center text-xs text-slate-600 py-4 px-4">
        Portal seguro — seus dados são protegidos
      </footer>
    </div>
  );
}

export default PortalPage;
