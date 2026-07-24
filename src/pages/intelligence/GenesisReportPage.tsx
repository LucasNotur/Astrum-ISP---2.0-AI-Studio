import React from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Zap, Users, DollarSign, MessageSquare, AlertTriangle, TrendingUp, Loader2,
} from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { StatCard } from '@/src/components/intelligence/StatCard';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { cn } from '@/src/lib/utils';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface RetroReport {
  contactsAnalyzed: number;
  profilesWritten: number;
  payerMix: Record<string, number>;
  styleMix: Record<string, number>;
  topIssuesGlobal: Array<{ issue: string; count: number }>;
  headline: string;
}

const PAYER_LABELS: Record<string, string> = {
  bom_pagador: 'Bom pagador',
  atrasador_leve: 'Atrasa leve',
  inadimplente: 'Inadimplente',
  novo: 'Novo',
};

const STYLE_LABELS: Record<string, string> = {
  formal: 'Formal',
  tecnico: 'Técnico',
  informal: 'Informal',
  neutro: 'Neutro',
};

const PAYER_COLORS: Record<string, string> = {
  bom_pagador: 'bg-emerald-500',
  atrasador_leve: 'bg-amber-500',
  inadimplente: 'bg-red-500',
  novo: 'bg-zinc-400',
};

function MixBar({ mix, labels, colors }: { mix: Record<string, number>; labels: Record<string, string>; colors?: Record<string, string> }) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const entries = Object.entries(mix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className={cn('transition-all', colors?.[key] ?? 'bg-primary')}
            style={{ width: `${(value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-full', colors?.[key] ?? 'bg-primary')} />
            <span className="text-muted-foreground">{labels[key] ?? key}</span>
            <span className="font-mono font-medium">{value}</span>
            <span className="text-muted-foreground">({Math.round((value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GenesisReportPage() {
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const [report, setReport] = React.useState<RetroReport | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/v2/genesis/retro-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<RetroReport>;
    },
    onSuccess: (data) => setReport(data),
  });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Análise WhatsApp Engine"
        subtitle="Perfil completo da sua base a partir do histórico de conversas"
        action={
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !token}
            className="gap-1.5"
          >
            {mutation.isPending ? (
              <><Loader2 size={14} className="animate-spin" />Analisando...</>
            ) : (
              <><Zap size={14} />Rodar análise completa</>
            )}
          </Button>
        }
      />

      {mutation.isError && (
        <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-4 text-red-700 dark:text-red-400 text-sm">
            Erro: {(mutation.error as Error).message}
          </CardContent>
        </Card>
      )}

      {!report && !mutation.isPending && (
        <EmptyState
          icon={MessageSquare}
          title="Nenhuma análise realizada"
          description="Conecte o WhatsApp e importe o histórico, depois rode a análise para obter o perfil da sua base."
          action={
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !token}>
              <Zap size={14} className="mr-1.5" />
              Rodar primeira análise
            </Button>
          }
        />
      )}

      {mutation.isPending && !report && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Analisando conversas... isso pode levar alguns minutos.</p>
        </div>
      )}

      {report && (
        <>
          <Card className="border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30">
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-foreground leading-relaxed">{report.headline}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label="Contatos analisados"
              value={report.contactsAnalyzed}
              icon={<Users size={16} />}
            />
            <StatCard
              label="Perfis gravados"
              value={report.profilesWritten}
              icon={<DollarSign size={16} />}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign size={14} />
                Mix de pagadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MixBar mix={report.payerMix} labels={PAYER_LABELS} colors={PAYER_COLORS} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare size={14} />
                Estilo de comunicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MixBar mix={report.styleMix} labels={STYLE_LABELS} />
            </CardContent>
          </Card>

          {report.topIssuesGlobal.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Top problemas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.topIssuesGlobal.map((item, i) => {
                    const maxCount = report.topIssuesGlobal[0]?.count ?? 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-6 text-right">
                          {item.count}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 rounded-full bg-primary/60 transition-all"
                              style={{ width: `${(item.count / maxCount) * 100}%`, minWidth: '8px' }}
                            />
                            <span className="text-xs text-foreground whitespace-nowrap">{item.issue}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
