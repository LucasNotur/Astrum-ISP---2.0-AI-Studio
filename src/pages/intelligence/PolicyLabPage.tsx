import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  FlaskConical, TrendingUp, DollarSign, AlertTriangle, Info,
  ChevronRight, Loader2, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? '';
}

// ── Tipos que espelham o BacktestResult do backend ───────────────────────────

interface HistoryBaseline {
  windowDays: number;
  invoicesTotal: number;
  billedCents: number;
  paidOnTimeCents: number;
  paidLateCents: number;
  unpaidCents: number;
  avgDaysLate: number | null;
}

interface BacktestResult {
  baseline: HistoryBaseline;
  projectedGainCents: { pessimista: number; base: number; otimista: number };
  discountCostCents: number;
  netGainBaseCents: number;
  assumptions: string[];
  disclaimer: string;
}

interface PolicyForm {
  reminderDaysBefore: number;
  remindersAfterDue: string; // "3,7,15"
  settlementDiscountPct: number;
  primaryChannel: 'whatsapp' | 'email' | 'sms';
  windowDays: number;
}

const BRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PCT = (n: number) => `${(n * 100).toFixed(1)}%`;

function ScenarioCell({ label, cents, highlight }: { label: string; cents: number; highlight?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center rounded-lg p-3 border', highlight ? 'bg-astrum-fiber/5 border-astrum-fiber/30' : 'bg-muted/40 border-transparent')}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      <span className={cn('font-mono text-lg font-bold', cents >= 0 ? 'text-astrum-signal' : 'text-astrum-red')}>
        {BRL(cents)}
      </span>
    </div>
  );
}

export default function PolicyLabPage() {
  const [form, setForm] = useState<PolicyForm>({
    reminderDaysBefore: 3,
    remindersAfterDue: '3,7,15',
    settlementDiscountPct: 0,
    primaryChannel: 'whatsapp',
    windowDays: 90,
  });

  const mutation = useMutation<BacktestResult, Error, PolicyForm>({
    mutationFn: async (f) => {
      const token = await getToken();
      const days = f.remindersAfterDue.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
      const res = await fetch(`${API_BASE_URL}/api/v2/cobranca/backtest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: {
            reminderDaysBefore: f.reminderDaysBefore,
            remindersAfterDue: days.length ? days : [3, 7, 15],
            settlementDiscountPct: f.settlementDiscountPct,
            primaryChannel: f.primaryChannel,
          },
          window_days: f.windowDays,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const r = mutation.data;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Policy Lab"
        subtitle="Teste sua régua de cobrança no histórico real antes de ligar"
        action={
          <Badge variant="secondary" className="gap-1 text-xs">
            <FlaskConical size={11} />
            Backtesting D-02
          </Badge>
        }
      />

      {/* Formulário de política */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configure a régua a testar</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Lembrete antes do vencimento (dias)</span>
            <input
              type="number"
              min={0}
              max={30}
              value={form.reminderDaysBefore}
              onChange={(e) => setForm((f) => ({ ...f, reminderDaysBefore: Number(e.target.value) }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Cobranças pós-vencimento (dias separados por vírgula)</span>
            <input
              type="text"
              value={form.remindersAfterDue}
              onChange={(e) => setForm((f) => ({ ...f, remindersAfterDue: e.target.value }))}
              placeholder="3,7,15"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Desconto de quitação (%)</span>
            <input
              type="number"
              min={0}
              max={30}
              step={1}
              value={form.settlementDiscountPct}
              onChange={(e) => setForm((f) => ({ ...f, settlementDiscountPct: Number(e.target.value) }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Canal principal</span>
            <div className="flex gap-2">
              {(['whatsapp', 'email', 'sms'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setForm((f) => ({ ...f, primaryChannel: ch }))}
                  className={cn(
                    'flex-1 h-9 rounded-md border text-sm font-medium transition-colors',
                    form.primaryChannel === ch
                      ? 'bg-astrum-fiber text-white border-astrum-fiber'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {ch === 'whatsapp' ? 'WhatsApp' : ch === 'email' ? 'E-mail' : 'SMS'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Janela de histórico (dias)</span>
            <div className="flex gap-2">
              {[30, 60, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => setForm((f) => ({ ...f, windowDays: d }))}
                  className={cn(
                    'flex-1 h-9 rounded-md border text-sm font-medium transition-colors',
                    form.windowDays === d
                      ? 'bg-astrum-fiber text-white border-astrum-fiber'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </label>

          <div className="sm:col-span-2 flex justify-end pt-2">
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending}
              className="gap-2"
            >
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Rodar backtesting
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {mutation.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-astrum-red/30 bg-astrum-red/5 p-4 text-sm text-astrum-red">
          <AlertTriangle size={16} className="shrink-0" />
          {mutation.error.message}
        </div>
      )}

      {/* Resultados */}
      {r && (
        <>
          {/* Baseline (fatos) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico observado ({r.baseline.windowDays}d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Faturado', cents: r.baseline.billedCents, icon: DollarSign },
                  { label: 'Pago em dia', cents: r.baseline.paidOnTimeCents, icon: TrendingUp, positive: true },
                  { label: 'Recuperado', cents: r.baseline.paidLateCents, icon: TrendingUp, positive: true },
                  { label: 'Não pago', cents: r.baseline.unpaidCents, icon: AlertTriangle, negative: true },
                ].map(({ label, cents, icon: Icon, positive, negative }) => (
                  <div key={label} className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className={cn('font-mono text-lg font-bold', positive && 'text-astrum-signal', negative && 'text-astrum-red')}>
                      {BRL(cents)}
                    </span>
                    {label === 'Não pago' && r.baseline.billedCents > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {PCT(r.baseline.unpaidCents / r.baseline.billedCents)} do faturado
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {r.baseline.avgDaysLate !== null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Média de atraso nos pagamentos tardios: <span className="font-mono font-semibold">{r.baseline.avgDaysLate}d</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Projeção por cenário */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ganho projetado com a nova régua</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <ScenarioCell label="Pessimista" cents={r.projectedGainCents.pessimista} />
                <ScenarioCell label="Base" cents={r.netGainBaseCents} highlight />
                <ScenarioCell label="Otimista" cents={r.projectedGainCents.otimista} />
              </div>
              {r.discountCostCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  Custo do desconto de quitação (cenário base):{' '}
                  <span className="font-mono text-astrum-orange font-semibold">{BRL(r.discountCostCents)}</span>
                  {' '}— já deduzido do ganho líquido.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Assumptions + disclaimer */}
          <Card className="border-muted">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info size={14} className="mt-0.5 shrink-0 text-astrum-fiber" />
                <div className="space-y-1">
                  {r.assumptions.map((a, i) => (
                    <p key={i}><ChevronRight size={10} className="inline mr-1 text-astrum-fiber" />{a}</p>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-dashed pt-3 leading-relaxed">
                {r.disclaimer}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
