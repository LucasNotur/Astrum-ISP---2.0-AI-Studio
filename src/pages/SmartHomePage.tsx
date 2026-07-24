import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/src/lib/supabase';
import { useAppStore } from '@/src/store/useAppStore';
import { cn } from '@/src/lib/utils';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Skeleton } from '@/src/components/Skeleton';
import { SkeletonCard } from '@/src/components/ui/micro';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

type Severity = 'critical' | 'warning' | 'info' | 'success';

interface SmartHomeItem {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  metric?: string;
  action?: { label: string; path: string };
  source: string;
}

interface SmartHomeSnapshot {
  activeCustomers?: number;
  mrrCents?: number;
  openOverdueCents?: number;
  recoverableOverdueCents?: number;
  aiResolutionRate?: number;
  openConversations?: number;
  escalatedConversations?: number;
  todayOrders?: number;
  activeIncidents?: number;
}

interface SmartHomeData {
  healthScore: number;
  healthLabel: string;
  headline: string;
  items: SmartHomeItem[];
  snapshot: SmartHomeSnapshot;
}

const SEVERITY_STYLES: Record<Severity, { border: string; bg: string; badge: string; icon: string }> = {
  critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-50/50 dark:bg-red-950/20',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    icon: 'text-red-500',
  },
  warning: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    icon: 'text-amber-500',
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/30 dark:bg-blue-950/10',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    icon: 'text-blue-500',
  },
  success: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/30 dark:bg-emerald-950/10',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    icon: 'text-emerald-500',
  },
};

function healthColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function healthRingColor(score: number): string {
  if (score >= 80) return 'stroke-emerald-500';
  if (score >= 50) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function HealthIcon({ score }: { score: number }) {
  if (score >= 80) return <ShieldCheck className="text-emerald-500" size={20} />;
  if (score >= 50) return <Shield className="text-amber-500" size={20} />;
  return <ShieldAlert className="text-red-500" size={20} />;
}

function HealthRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-muted/30"
        />
        <motion.circle
          cx="60" cy="60" r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={healthRingColor(score)}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          strokeDasharray={circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-3xl font-bold font-mono tabular-nums', healthColor(score))}>
          {score}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
          saúde
        </span>
      </div>
    </div>
  );
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function SnapshotBar({ snapshot }: { snapshot: SmartHomeSnapshot }) {
  const stats: { label: string; value: string }[] = [];
  if (snapshot.activeCustomers != null) stats.push({ label: 'Clientes', value: String(snapshot.activeCustomers) });
  if (snapshot.mrrCents != null) stats.push({ label: 'MRR', value: fmt(snapshot.mrrCents) });
  if (snapshot.openConversations != null) stats.push({ label: 'Conversas', value: String(snapshot.openConversations) });
  if (snapshot.escalatedConversations != null && snapshot.escalatedConversations > 0) stats.push({ label: 'Escaladas', value: String(snapshot.escalatedConversations) });
  if (snapshot.todayOrders != null) stats.push({ label: 'OS hoje', value: String(snapshot.todayOrders) });
  if (snapshot.activeIncidents != null && snapshot.activeIncidents > 0) stats.push({ label: 'Incidentes', value: String(snapshot.activeIncidents) });
  if (snapshot.aiResolutionRate != null) stats.push({ label: 'IA resolve', value: `${Math.round(snapshot.aiResolutionRate)}%` });

  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {stats.map((s) => (
        <div key={s.label} className="text-center px-3 py-1.5 rounded-lg bg-muted/50 min-w-[80px]">
          <p className="text-lg font-bold font-mono tabular-nums text-foreground">{s.value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

function ActionCard({ item }: { item: SmartHomeItem }) {
  const navigate = useNavigate();
  const style = SEVERITY_STYLES[item.severity];

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } }}
    >
      <Card className={cn('border-l-4 shadow-sm transition-colors hover:shadow-md', style.border, style.bg)}>
        <CardContent className="flex items-start gap-4 py-4 px-5">
          <div className="shrink-0 mt-0.5">
            {item.severity === 'critical' || item.severity === 'warning'
              ? <AlertTriangle size={18} className={style.icon} />
              : item.severity === 'success'
                ? <CheckCircle2 size={18} className={style.icon} />
                : <div className={cn('w-2 h-2 rounded-full mt-1.5', item.severity === 'info' ? 'bg-blue-500' : 'bg-muted')} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground leading-snug">{item.title}</h3>
              {item.metric && (
                <Badge variant="outline" className={cn('text-[10px] font-mono border-none shrink-0', style.badge)}>
                  {item.metric}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
          </div>
          {item.action && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs gap-1.5 h-8"
              onClick={() => navigate(item.action!.path)}
            >
              {item.action.label}
              <ArrowRight size={12} />
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function SmartHomePage() {
  const [data, setData] = useState<SmartHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id || 'DEFAULT_TENANT';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sessão não encontrada');

      const res = await fetch(`${API_BASE_URL}/api/v2/home/smart`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SmartHomeData = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="space-y-8 max-w-3xl mx-auto pt-4">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="w-36 h-36 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex justify-center gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-24 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <ShieldAlert className="text-muted-foreground" size={32} />
          <p className="text-sm text-muted-foreground">
            {error || 'Dados indisponíveis.'}
          </p>
          <p className="text-xs text-muted-foreground">
            O motor Fastify pode não estar rodando. Os dados aparecem quando o backend estiver ativo.
          </p>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw size={14} /> Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      key="smart-home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 max-w-3xl mx-auto"
    >
      {/* Health score + headline */}
      <section className="text-center space-y-4 pt-4">
        <HealthRing score={data.healthScore} />
        <div className="flex items-center justify-center gap-2">
          <HealthIcon score={data.healthScore} />
          <span className="text-sm font-semibold text-foreground">{data.healthLabel}</span>
        </div>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">{data.headline}</p>
        <Button variant="ghost" size="sm" onClick={fetchData} className="text-xs gap-1.5 text-muted-foreground">
          <RefreshCw size={12} /> Atualizar
        </Button>
      </section>

      {/* Snapshot numbers */}
      <section>
        <SnapshotBar snapshot={data.snapshot} />
      </section>

      {/* Action items */}
      {data.items.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Prioridades
          </h2>
          <motion.div
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {data.items.map((item) => (
              <ActionCard key={item.id} item={item} />
            ))}
          </motion.div>
        </section>
      )}

      {data.items.length === 0 && (
        <section className="text-center py-8">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={36} />
          <p className="text-sm text-muted-foreground">
            Nenhuma ação pendente. A operação está rodando bem.
          </p>
        </section>
      )}
    </motion.div>
  );
}

export default SmartHomePage;
