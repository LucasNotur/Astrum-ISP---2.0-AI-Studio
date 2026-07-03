import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { useAppStore } from '../store/useAppStore';
import { toast } from 'sonner';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DollarSign, Zap, TrendingUp, ShieldAlert, BarChart2 } from 'lucide-react';

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
}

interface TenantBudget {
  ai_budget_usd_monthly: number | null;
  ai_budget_hard_stop: boolean;
}

export function AICostsPage() {
  const { user } = useAppStore();
  const tenantId: string = user?.tenantId ?? 'default';
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<TenantBudget>({ ai_budget_usd_monthly: null, ai_budget_hard_stop: false });
  const [budgetInput, setBudgetInput] = useState('');
  const [hardStop, setHardStop] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantId === 'default') return;
    load();
  }, [tenantId]);

  async function load() {
    setLoading(true);
    const [logsRes, tenantRes] = await Promise.all([
      supabase
        .from('ai_performance_logs')
        .select('id,ticket_id,model,tokens_in,tokens_out,cost_usd,created_at,category')
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
    </motion.div>
  );
}
