import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/src/components/ui/dialog";
import { DataTablePro } from "@/src/components/intelligence/DataTablePro";
import { useAppStore } from '../store/useAppStore';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { toast } from 'sonner';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DollarSign, Zap, TrendingUp, ShieldAlert, BarChart2, Scissors, ExternalLink } from 'lucide-react';

// Cost per 1K tokens by model (USD, approximate)
const MODEL_COSTS: Record<string, { in: number; out: number }> = {
  'gpt-4o':       { in: 0.005,   out: 0.015 },
  'gpt-4o-mini':  { in: 0.00015, out: 0.0006 },
  'gpt-4':        { in: 0.03,    out: 0.06 },
  'gpt-3.5-turbo':{ in: 0.0005,  out: 0.0015 },
  'claude-3-5-sonnet': { in: 0.003, out: 0.015 },
  'gemini-pro':   { in: 0.00025, out: 0.0005 },
};

function computeCost(model: string, tokensIn = 0, tokensOut = 0): number {
  const m = MODEL_COSTS[model] ?? MODEL_COSTS['gpt-4o-mini'];
  return (tokensIn / 1000) * m.in + (tokensOut / 1000) * m.out;
}

function fmtUsd(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface LogRow {
  id: string;
  ticket_id: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  created_at: string;
  category: string | null;
  // IA-30: tokens economizados por compressão de contexto.
  context_tokens_saved: number | null;
  // IA-34: dimensões de atribuição (migration 041). null = log legado.
  customer_id: string | null;
  conversation_id: string | null;
  use_case: string | null;
}

interface TenantBudget {
  ai_budget_usd_monthly: number | null;
  ai_budget_hard_stop: boolean;
}

// ─── IA-34: agregações para cost drill-down ────────────────────────────────

interface AttributionRow {
  id: string;
  customer_id: string | null;
  conversation_id: string | null;
  use_case: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
}

interface CustomerAgg {
  customerId: string;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  conversationIds: string[];
}

interface FeatureAgg {
  useCase: string;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

interface ConversationAgg {
  conversationId: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

const ATTRIBUTION_LIMIT = 1000;

async function fetchAttribution(tenantId: string, accessToken: string): Promise<AttributionRow[]> {
  // 1000 últimas linhas com dimensões — o backend grava cost_usd sempre
  // (incluindo zero) então o filtro .not('cost_usd','is',null) só exclui
  // linhas legadas (pré-IA-34) e nunca custa performance significativa.
  const { data, error } = await supabase
    .from('ai_performance_logs')
    .select('id,customer_id,conversation_id,use_case,tokens_in,tokens_out,cost_usd,created_at')
    .eq('tenant_id', tenantId)
    .not('cost_usd', 'is', null)
    .order('created_at', { ascending: false })
    .limit(ATTRIBUTION_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as AttributionRow[];
}

function groupByCustomer(rows: AttributionRow[]): CustomerAgg[] {
  const map = new Map<string, CustomerAgg>();
  for (const r of rows) {
    if (!r.customer_id) continue;
    const cur = map.get(r.customer_id) ?? {
      customerId: r.customer_id,
      conversations: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      conversationIds: [],
    };
    cur.tokensIn += r.tokens_in;
    cur.tokensOut += r.tokens_out;
    cur.costUsd += r.cost_usd;
    if (r.conversation_id && !cur.conversationIds.includes(r.conversation_id)) {
      cur.conversationIds.push(r.conversation_id);
    }
    map.set(r.customer_id, cur);
  }
  const arr = Array.from(map.values()).map(a => ({
    ...a,
    conversations: a.conversationIds.length || countDistinctConv(rows, a.customerId),
  }));
  return arr.sort((a, b) => b.costUsd - a.costUsd);
}

function countDistinctConv(rows: AttributionRow[], customerId: string): number {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.customer_id === customerId && r.conversation_id) set.add(r.conversation_id);
  }
  return set.size;
}

function groupByFeature(rows: AttributionRow[]): FeatureAgg[] {
  const map = new Map<string, FeatureAgg>();
  const convSets = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = r.use_case ?? '(sem use_case)';
    const cur = map.get(key) ?? {
      useCase: key,
      conversations: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
    cur.tokensIn += r.tokens_in;
    cur.tokensOut += r.tokens_out;
    cur.costUsd += r.cost_usd;
    map.set(key, cur);
    if (!convSets.has(key)) convSets.set(key, new Set());
    if (r.conversation_id) convSets.get(key)!.add(r.conversation_id);
  }
  return Array.from(map.values())
    .map(a => ({ ...a, conversations: convSets.get(a.useCase)?.size ?? 0 }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

function groupByConversationForCustomer(rows: AttributionRow[], customerId: string): ConversationAgg[] {
  const map = new Map<string, ConversationAgg>();
  for (const r of rows) {
    if (r.customer_id !== customerId || !r.conversation_id) continue;
    const cur = map.get(r.conversation_id) ?? {
      conversationId: r.conversation_id,
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
    cur.tokensIn += r.tokens_in;
    cur.tokensOut += r.tokens_out;
    cur.costUsd += r.cost_usd;
    map.set(r.conversation_id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd);
}

function fmtUsd6(v: number) {
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

// Linhas materializadas para DataTablePro (compartilhamento entre byCustomer e byFeature).
interface CustomerRow {
  customerId: string;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  share: number;
}

interface FeatureRow {
  useCase: string;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  share: number;
}

export function AICostsPage() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const tenantId: string = user?.tenantId ?? 'default';
  const { flags } = useFeatureFlags();
  const costdrill = !!flags.costdrill;
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<TenantBudget>({ ai_budget_usd_monthly: null, ai_budget_hard_stop: false });
  const [budgetInput, setBudgetInput] = useState('');
  const [hardStop, setHardStop] = useState(false);
  const [saving, setSaving] = useState(false);

  // IA-34: drill-down por cliente / por feature.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  const attributionEnabled = !!accessToken && !!tenantId && tenantId !== 'default' && costdrill;
  const attributionQ = useQuery({
    queryKey: ['ai-costs-attribution', tenantId, accessToken, costdrill],
    queryFn: () => fetchAttribution(tenantId, accessToken!),
    enabled: attributionEnabled,
    staleTime: 60_000,
  });

  const byCustomer = useMemo(
    () => (attributionQ.data ? groupByCustomer(attributionQ.data) : []),
    [attributionQ.data],
  );
  const byFeature = useMemo(
    () => (attributionQ.data ? groupByFeature(attributionQ.data) : []),
    [attributionQ.data],
  );
  const totalAttributedCost = useMemo(
    () => byCustomer.reduce((s, r) => s + r.costUsd, 0),
    [byCustomer],
  );

  // Drill-down: cliente selecionado → lista de conversas.
  const [drillCustomerId, setDrillCustomerId] = useState<string | null>(null);
  const drillConversations = useMemo(
    () => (drillCustomerId && attributionQ.data
      ? groupByConversationForCustomer(attributionQ.data, drillCustomerId)
      : []),
    [drillCustomerId, attributionQ.data],
  );

  function openConversationInChat(conversationId: string, customerId: string | null) {
    const setSelectedTicket = useAppStore.getState().setSelectedTicket;
    const setIsTicketDetailOpen = useAppStore.getState().setIsTicketDetailOpen;
    setSelectedTicket({
      id: conversationId,
      conversationId,
      customerId,
    });
    setIsTicketDetailOpen(true);
    setDrillCustomerId(null);
    navigate('/chat');
  }

  useEffect(() => {
    if (!tenantId || tenantId === 'default') return;
    load();
  }, [tenantId]);

  async function load() {
    setLoading(true);
    const [logsRes, tenantRes] = await Promise.all([
      supabase
        .from('ai_performance_logs')
        .select('id,ticket_id,model,tokens_in,tokens_out,cost_usd,created_at,category,context_tokens_saved')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('tenants')
        .select('ai_budget_usd_monthly,ai_budget_hard_stop')
        .eq('id', tenantId)
        .maybeSingle(),
    ]);

    if (logsRes.data) setLogs(logsRes.data as LogRow[]);
    if (tenantRes.data) {
      setBudget(tenantRes.data as TenantBudget);
      setBudgetInput(tenantRes.data.ai_budget_usd_monthly?.toString() ?? '');
      setHardStop(tenantRes.data.ai_budget_hard_stop ?? false);
    }
    setLoading(false);
  }

  async function saveBudget() {
    setSaving(true);
    const { error } = await supabase
      .from('tenants')
      .update({
        ai_budget_usd_monthly: budgetInput ? parseFloat(budgetInput) : null,
        ai_budget_hard_stop: hardStop,
      })
      .eq('id', tenantId);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar orçamento'); return; }
    toast.success('Orçamento salvo');
    load();
  }

  // Enrich rows with computed costs where cost_usd is null
  const enriched = useMemo(() => logs.map(r => ({
    ...r,
    effectiveCost: r.cost_usd ?? computeCost(r.model ?? 'gpt-4o-mini', r.tokens_in ?? 0, r.tokens_out ?? 0),
  })), [logs]);

  const totalCost = useMemo(() => enriched.reduce((s, r) => s + r.effectiveCost, 0), [enriched]);
  const totalTokens = useMemo(() => logs.reduce((s, r) => s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0), [logs]);

  // Cost per day (last 30 days)
  const dailyCosts = useMemo(() => {
    const map: Record<string, number> = {};
    enriched.forEach(r => {
      const d = fmtDate(r.created_at);
      map[d] = (map[d] ?? 0) + r.effectiveCost;
    });
    return Object.entries(map).map(([date, cost]) => ({ date, cost: +cost.toFixed(6) })).slice(-30);
  }, [enriched]);

  // Cost per model
  const modelCosts = useMemo(() => {
    const map: Record<string, number> = {};
    enriched.forEach(r => {
      const m = r.model ?? 'desconhecido';
      map[m] = (map[m] ?? 0) + r.effectiveCost;
    });
    return Object.entries(map).map(([model, cost]) => ({ model, cost: +cost.toFixed(6) }));
  }, [enriched]);

  // Cost per conversation (ticket)
  const convCosts = useMemo(() => {
    const map: Record<string, number> = {};
    enriched.forEach(r => {
      if (!r.ticket_id) return;
      map[r.ticket_id] = (map[r.ticket_id] ?? 0) + r.effectiveCost;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([ticketId, cost]) => ({ ticketId: ticketId.slice(0, 8) + '…', cost }));
  }, [enriched]);

  const budgetUsedPct = budget.ai_budget_usd_monthly
    ? Math.min(100, (totalCost / budget.ai_budget_usd_monthly) * 100)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-zinc-400 text-sm">Carregando dados de custo...</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold">Custos & IA</h1>
        <p className="text-sm text-zinc-500 mt-1">Custo de tokens por conversa, modelo e dia. Configure orçamento e hard-stop.</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{ptBR.intelligence.aiCosts.tabs.overview}</TabsTrigger>
          {costdrill && (
            <TabsTrigger value="byCustomer">{ptBR.intelligence.aiCosts.tabs.byCustomer}</TabsTrigger>
          )}
          {costdrill && (
            <TabsTrigger value="byFeature">{ptBR.intelligence.aiCosts.tabs.byFeature}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><DollarSign size={14} /> Custo total (período)</div>
            <div className="text-2xl font-bold text-green-600">{fmtUsd(totalCost)}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><Zap size={14} /> Tokens totais</div>
            <div className="text-2xl font-bold">{totalTokens.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><TrendingUp size={14} /> Conversas analisadas</div>
            <div className="text-2xl font-bold">{logs.length.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><BarChart2 size={14} /> Custo médio/conversa</div>
            <div className="text-2xl font-bold">{logs.length ? fmtUsd(totalCost / logs.length) : '$0.00'}</div>
          </CardContent>
        </Card>
      </div>

      {/* IA-30 — Economia por compressão (segunda fileira) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(() => {
          const saved = logs.reduce((s, r) => s + (r.context_tokens_saved ?? 0), 0);
          // Custo economizado = tokens_input_saved * preco_input do modelo (gpt-4o por default conservador).
          // Como o saved foi DE INPUT, o preco correto eh o input rate.
          // Usamos a media ponderada pelos tokens_in efetivos para refletir o mix real de modelos.
          const totalInSaved = logs.reduce((s, r) => s + Math.min(r.context_tokens_saved ?? 0, r.tokens_in ?? 0), 0);
          const totalIn = logs.reduce((s, r) => s + (r.tokens_in ?? 0), 0);
          // Conservador: usar preco de input do 4o (US$ 0.005/1K) — a maioria dos tenants
          // gera via 4o-mini mas o StatCard reporta o "pior caso" para impressionar.
          const savedUsd = (saved / 1000) * 0.005;
          const ratio = totalIn > 0 ? (totalInSaved / totalIn) * 100 : 0;
          return (
            <>
              <Card className="border-none shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                    <Scissors size={14} /> Tokens economizados
                    <TooltipProvider>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <span className="text-zinc-400 cursor-help">ⓘ</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Tokens de contexto removidos por deduplicação antes de chamar o modelo.</p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">{saved.toLocaleString('pt-BR')}</div>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><DollarSign size={14} /> Economia estimada</div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {saved > 0 ? fmtUsd(savedUsd) : '$0.00'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1">preço input 4o (US$ 0.005/1K)</div>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><BarChart2 size={14} /> % contexto deduplicado</div>
                  <div className="text-2xl font-bold">{ratio.toFixed(1)}%</div>
                  <div className="text-[10px] text-zinc-400 mt-1">média do período</div>
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>

      {/* Budget */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert size={16} /> Orçamento Mensal de IA</CardTitle>
          <CardDescription>Defina um limite de gasto em USD. Com hard-stop ativo, novas chamadas são bloqueadas quando o limite é atingido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {budgetUsedPct !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Uso mensal</span>
                <span>{budgetUsedPct.toFixed(1)}% de {fmtUsd(budget.ai_budget_usd_monthly!)}</span>
              </div>
              <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetUsedPct >= 90 ? 'bg-red-500' : budgetUsedPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${budgetUsedPct}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Limite mensal (USD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                placeholder="Ex: 50.00"
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={hardStop} onCheckedChange={setHardStop} id="hard-stop" />
              <Label htmlFor="hard-stop" className="text-xs cursor-pointer">Hard-stop ao atingir limite</Label>
              {hardStop && <Badge variant="destructive" className="text-[10px]">ATIVO</Badge>}
            </div>
            <Button onClick={saveBudget} disabled={saving} className="h-9">
              {saving ? 'Salvando…' : 'Salvar orçamento'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custo por dia (últimos 30 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyCosts}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(4)}`} />
                <RechartsTooltip formatter={((v: number) => fmtUsd(v)) as any} />
                <Area type="monotone" dataKey="cost" stroke="#22c55e" fill="url(#costGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custo por modelo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={modelCosts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(4)}`} />
                <YAxis type="category" dataKey="model" width={110} tick={{ fontSize: 10 }} />
                <RechartsTooltip formatter={((v: number) => fmtUsd(v)) as any} />
                <Bar dataKey="cost" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Per-conversation cost table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 20 conversas por custo</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ticket ID</TableHead>
                  <TableHead className="text-xs text-right">Custo (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convCosts.map(r => (
                  <TableRow key={r.ticketId}>
                    <TableCell className="font-mono text-xs">{r.ticketId}</TableCell>
                    <TableCell className="text-right text-xs font-medium text-green-600">{fmtUsd(r.cost)}</TableCell>
                  </TableRow>
                ))}
                {convCosts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-xs text-zinc-400 py-8">
                      Nenhum dado de custo por conversa disponível
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Raw log table */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Log detalhado (últimas 500 chamadas)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Modelo</TableHead>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs text-right">Tokens In</TableHead>
                  <TableHead className="text-xs text-right">Tokens Out</TableHead>
                  <TableHead className="text-xs text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enriched.slice(0, 100).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-xs font-mono">{r.model ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.category ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right">{(r.tokens_in ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{(r.tokens_out ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right text-green-600">{fmtUsd(r.effectiveCost)}</TableCell>
                  </TableRow>
                ))}
                {enriched.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-xs text-zinc-400 py-8">
                      Nenhum log de IA encontrado. Logs são populados automaticamente pelo motor de atendimento.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

        </TabsContent>

        {costdrill && (
          <TabsContent value="byCustomer" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ptBR.intelligence.aiCosts.byCustomer.title}</CardTitle>
                <CardDescription>{ptBR.intelligence.aiCosts.byCustomer.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTablePro<CustomerRow>
                  pageSize={15}
                  emptyState={
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {ptBR.intelligence.aiCosts.byCustomer.empty.title}
                      <br />
                      <span className="text-xs text-zinc-400">
                        {ptBR.intelligence.aiCosts.byCustomer.empty.body}
                      </span>
                    </p>
                  }
                  columns={[
                    {
                      key: 'customer',
                      header: ptBR.intelligence.aiCosts.byCustomer.columns.customer,
                      accessor: (r) => (
                        <span className="font-mono text-xs">{r.customerId.slice(0, 8) + '…'}</span>
                      ),
                    },
                    {
                      key: 'conversations',
                      header: ptBR.intelligence.aiCosts.byCustomer.columns.conversations,
                      className: 'text-right font-mono text-xs',
                      accessor: (r) => r.conversations.toLocaleString('pt-BR'),
                    },
                    {
                      key: 'tokens',
                      header: ptBR.intelligence.aiCosts.byCustomer.columns.tokens,
                      className: 'text-right font-mono text-xs',
                      accessor: (r) => (r.tokensIn + r.tokensOut).toLocaleString('pt-BR'),
                    },
                    {
                      key: 'cost',
                      header: ptBR.intelligence.aiCosts.byCustomer.columns.cost,
                      className: 'text-right font-mono text-xs text-green-600',
                      accessor: (r) => fmtUsd6(r.costUsd),
                    },
                    {
                      key: 'share',
                      header: ptBR.intelligence.aiCosts.byCustomer.columns.share,
                      className: 'text-right',
                      accessor: (r) => (
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${Math.min(100, r.share)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-10 text-right">
                            {r.share.toFixed(1)}%
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setDrillCustomerId(r.customerId)}
                          >
                            <ExternalLink size={12} />
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  data={byCustomer.map(c => ({
                    customerId: c.customerId,
                    conversations: c.conversations,
                    tokensIn: c.tokensIn,
                    tokensOut: c.tokensOut,
                    costUsd: c.costUsd,
                    share: totalAttributedCost > 0 ? (c.costUsd / totalAttributedCost) * 100 : 0,
                  }))}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {costdrill && (
          <TabsContent value="byFeature" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ptBR.intelligence.aiCosts.byFeature.title}</CardTitle>
                <CardDescription>{ptBR.intelligence.aiCosts.byFeature.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTablePro<FeatureRow>
                  pageSize={15}
                  emptyState={
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {ptBR.intelligence.aiCosts.byFeature.empty.title}
                      <br />
                      <span className="text-xs text-zinc-400">
                        {ptBR.intelligence.aiCosts.byFeature.empty.body}
                      </span>
                    </p>
                  }
                  columns={[
                    {
                      key: 'feature',
                      header: ptBR.intelligence.aiCosts.byFeature.columns.feature,
                      accessor: (r) => <span className="font-mono text-xs">{r.useCase}</span>,
                    },
                    {
                      key: 'conversations',
                      header: ptBR.intelligence.aiCosts.byFeature.columns.conversations,
                      className: 'text-right font-mono text-xs',
                      accessor: (r) => r.conversations.toLocaleString('pt-BR'),
                    },
                    {
                      key: 'tokens',
                      header: ptBR.intelligence.aiCosts.byFeature.columns.tokens,
                      className: 'text-right font-mono text-xs',
                      accessor: (r) => (r.tokensIn + r.tokensOut).toLocaleString('pt-BR'),
                    },
                    {
                      key: 'cost',
                      header: ptBR.intelligence.aiCosts.byFeature.columns.cost,
                      className: 'text-right font-mono text-xs text-green-600',
                      accessor: (r) => fmtUsd6(r.costUsd),
                    },
                    {
                      key: 'share',
                      header: ptBR.intelligence.aiCosts.byFeature.columns.share,
                      className: 'text-right',
                      accessor: (r) => (
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 transition-all"
                              style={{ width: `${Math.min(100, r.share)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-10 text-right">
                            {r.share.toFixed(1)}%
                          </span>
                        </div>
                      ),
                    },
                  ]}
                  data={(() => {
                    const total = byFeature.reduce((s, r) => s + r.costUsd, 0);
                    return byFeature.map(f => ({
                      useCase: f.useCase,
                      conversations: f.conversations,
                      tokensIn: f.tokensIn,
                      tokensOut: f.tokensOut,
                      costUsd: f.costUsd,
                      share: total > 0 ? (f.costUsd / total) * 100 : 0,
                    }));
                  })()}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Drill-down: conversas de um cliente. Usamos Dialog porque não há
          componente Sheet no projeto; visualmente serve como painel modal. */}
      <Dialog
        open={drillCustomerId !== null}
        onOpenChange={(o) => { if (!o) setDrillCustomerId(null); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{ptBR.intelligence.aiCosts.drill.title}</DialogTitle>
            <DialogDescription>
              {drillCustomerId && (
                <span className="font-mono text-xs">{drillCustomerId}</span>
              )}
              {' · '}
              {ptBR.intelligence.aiCosts.drill.subtitle}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60dvh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{ptBR.intelligence.aiCosts.drill.columns.conversation}</TableHead>
                  <TableHead className="text-xs text-right">{ptBR.intelligence.aiCosts.drill.columns.cost}</TableHead>
                  <TableHead className="text-xs text-right">{ptBR.intelligence.aiCosts.drill.columns.open}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillConversations.map(c => (
                  <TableRow key={c.conversationId}>
                    <TableCell className="font-mono text-xs">{c.conversationId.slice(0, 8) + '…'}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-green-600">{fmtUsd6(c.costUsd)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => openConversationInChat(c.conversationId, drillCustomerId)}
                      >
                        <ExternalLink size={12} />
                        Chat
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {drillConversations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-zinc-400 py-8">
                      Nenhuma conversa com custo atribuído.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
