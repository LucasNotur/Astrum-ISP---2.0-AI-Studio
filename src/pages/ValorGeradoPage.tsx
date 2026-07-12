/**
 * P5-01 + P5-04 — Dashboard "Valor Gerado" + gerador de case auditado.
 *
 * Consome:
 *   GET  /api/v2/valor/dashboard?period=30d  → ValorKpis
 *   POST /api/v2/valor/case                  → { shareToken, shareUrl, kpis }
 */
import React, { useEffect, useState } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Loader2, DollarSign, Bot, Clock, Ticket, TrendingUp, RefreshCw, Share2, Copy, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAppStore } from '@/src/store/useAppStore';
import { supabase } from '@/src/lib/supabase';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d' | '1y';

interface ValorKpis {
  period: string;
  periodDays: number;
  recoveredCents: number;
  recoveredBrl: number;
  aiResolved: number;
  totalAttendances: number;
  aiResolutionRatePct: number;
  hoursSaved: number;
  ticketsAvoided: number;
  aiCostUsd: number;
  roiMultiple: number;
  methodology: {
    recoveredNote: string;
    hoursSavedNote: string;
    roiNote: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', '1y': '1 ano',
};

function roiColor(roi: number) {
  if (roi >= 5) return 'text-emerald-600 dark:text-emerald-400';
  if (roi >= 2) return 'text-amber-600 dark:text-amber-400';
  return 'text-zinc-500';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30')}>
      <CardContent className="pt-5 pb-4 flex items-start gap-4">
        <div className={cn(
          'p-2 rounded-lg shrink-0',
          highlight ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary',
        )}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-bold truncate', highlight && 'text-emerald-700 dark:text-emerald-300')}>
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MethodologyAccordion({ data }: { data: ValorKpis['methodology'] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-zinc-200/70 dark:border-white/5">
      <button
        className="flex items-center justify-between w-full px-5 py-4 text-sm font-medium text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Info size={14} />
          Metodologia de cálculo
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-4 flex flex-col gap-3 text-xs text-muted-foreground border-t border-zinc-100 dark:border-white/5">
          <p><strong className="text-foreground">R$ Recuperado:</strong> {data.recoveredNote}</p>
          <p><strong className="text-foreground">Horas Economizadas:</strong> {data.hoursSavedNote}</p>
          <p><strong className="text-foreground">ROI:</strong> {data.roiNote}</p>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ValorGeradoPage() {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id ?? 'DEFAULT_TENANT';

  const [kpis, setKpis]         = useState<ValorKpis | null>(null);
  const [period, setPeriod]      = useState<Period>('30d');
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl]  = useState<string | null>(null);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? '';
  }

  async function load(p: Period) {
    setLoading(true);
    setError(null);
    setShareUrl(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/valor/dashboard?period=${p}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setKpis(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function generateCase() {
    setGenerating(true);
    try {
      const token = await getToken();
      const days = kpis?.periodDays ?? 30;
      const res = await fetch(`${API_BASE_URL}/api/v2/valor/case`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ periodDays: days }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const url = `${window.location.origin}${data.shareUrl}`;
      setShareUrl(url);
      toast.success('Case gerado com link público de 30 dias');
    } catch (e) {
      toast.error(`Erro ao gerar case: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copiado!');
  }

  useEffect(() => { load(period); }, [period]);

  const hasData = kpis && kpis.totalAttendances > 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Valor Gerado</h1>
          <p className="text-sm text-muted-foreground">
            ROI auditável da Astrum no seu ISP — metodologia aberta
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '30d', '90d', '1y'] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'default' : 'outline'}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => load(period)} disabled={loading}>
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-4 text-red-700 dark:text-red-400 text-sm">
            Erro ao carregar dados: {error}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !kpis && (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {kpis && (
        <>
          {/* ROI — hero destaque */}
          <Card className="border-emerald-400 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/40 dark:to-transparent">
            <CardContent className="pt-6 pb-5 flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm text-muted-foreground mb-1">Retorno sobre investimento em IA</p>
                <p className={cn('text-6xl font-black', roiColor(kpis.roiMultiple))}>
                  {kpis.roiMultiple > 0 ? `${kpis.roiMultiple}×` : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {kpis.roiMultiple >= 1
                    ? `Para cada R$1 investido em IA, a Astrum gerou R$${kpis.roiMultiple} em retorno.`
                    : 'Acumule dados de cobrança para ver o ROI calculado.'}
                </p>
              </div>
              <div className="h-px w-full sm:h-20 sm:w-px bg-emerald-200 dark:bg-emerald-800" />
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm text-muted-foreground mb-1">Custo de IA no período</p>
                <p className="text-2xl font-bold">
                  {kpis.aiCostUsd > 0 ? `$${kpis.aiCostUsd.toFixed(2)}` : '$0.00'}
                  <span className="text-base font-normal text-muted-foreground ml-1">USD</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {BRL(kpis.aiCostUsd * 5.2)} (USD × 5,20)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="R$ Recuperado"
              value={kpis.recoveredBrl > 0 ? BRL(kpis.recoveredBrl) : '—'}
              sub="via CobrAI no período"
              icon={<DollarSign size={18} />}
              highlight={kpis.recoveredBrl > 0}
            />
            <KpiCard
              label="Resolvido pela IA"
              value={`${kpis.aiResolutionRatePct}%`}
              sub={`${kpis.aiResolved} de ${kpis.totalAttendances} atendimentos`}
              icon={<Bot size={18} />}
            />
            <KpiCard
              label="Horas Economizadas"
              value={kpis.hoursSaved > 0 ? `${kpis.hoursSaved}h` : '—'}
              sub="equipe liberada"
              icon={<Clock size={18} />}
            />
            <KpiCard
              label="Tickets Evitados"
              value={String(kpis.ticketsAvoided)}
              sub="resolvidos sem escalar"
              icon={<Ticket size={18} />}
            />
          </div>

          {/* Barra de progresso da taxa IA */}
          {kpis.totalAttendances > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={14} />
                  Taxa de resolução autônoma
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${kpis.aiResolutionRatePct}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-12 text-right">{kpis.aiResolutionRatePct}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mundiale.ai (concorrente) anuncia 84% — a Astrum mede o seu de forma auditável.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Sem dados ainda */}
          {!hasData && (
            <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40">
              <CardContent className="pt-4 text-amber-800 dark:text-amber-300 text-sm flex flex-col gap-1">
                <strong>Aguardando dados de produção</strong>
                <p>
                  O dashboard popula automaticamente conforme a Astrum processa atendimentos e cobranças reais.
                  Aplique a migration <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">068_p5_valor_gerado.sql</code> e
                  ative o motor de atendimento para começar a acumular métricas.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Case engine */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Share2 size={15} />
                Gerar Case Auditado
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Gera um link público com os números do período selecionado — metodologia de cálculo
                inclusa. Compartilhe com um prospect ou anexe a uma proposta comercial.
              </p>

              {shareUrl ? (
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                  <span className="text-xs font-mono flex-1 truncate text-muted-foreground">
                    {shareUrl}
                  </span>
                  <Button size="sm" variant="ghost" onClick={copyShareUrl}>
                    <Copy size={13} />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={generateCase}
                  disabled={generating}
                  className="self-start"
                >
                  {generating
                    ? <><Loader2 size={13} className="animate-spin mr-2" />Gerando...</>
                    : <><Share2 size={13} className="mr-2" />Gerar link compartilhável</>}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Metodologia */}
          <MethodologyAccordion data={kpis.methodology} />
        </>
      )}
    </div>
  );
}
