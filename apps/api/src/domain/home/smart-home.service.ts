/**
 * G-01 — Home inteligente por papel.
 *
 * Agrega dados de múltiplas fontes (incidentes, inbox, cashflow, churn, campo)
 * numa visão ranqueada por prioridade, filtrada pelo papel do usuário.
 * O cérebro (nightly reflections) escolhe o que mostrar — o usuário não monta.
 *
 * Owner vê dinheiro + rede + churn. Operator vê fila + incidentes.
 * Technician vê agenda + incidentes.
 */
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { summarizeHistory, type InvoiceRow } from '../cobranca/policy-backtest.service';

export type UserRole = 'super_admin' | 'admin' | 'operator' | 'viewer';

export type ItemSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface SmartHomeItem {
  id: string;
  severity: ItemSeverity;
  title: string;
  description: string;
  metric?: string;
  action?: { label: string; path: string };
  source: string;
}

export interface SmartHomeSnapshot {
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

export interface SmartHomeResponse {
  healthScore: number;
  healthLabel: string;
  headline: string;
  items: SmartHomeItem[];
  snapshot: SmartHomeSnapshot;
}

const SEVERITY_RANK: Record<ItemSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };

function sortItems(items: SmartHomeItem[]): SmartHomeItem[] {
  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function fmt(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export interface SmartHomePort {
  from: (table: string) => any;
}

export async function buildSmartHome(
  tenantId: string,
  role: UserRole,
  userId: string,
  db: SmartHomePort = supabaseAdmin,
): Promise<SmartHomeResponse> {
  const items: SmartHomeItem[] = [];
  const snapshot: SmartHomeSnapshot = {};
  let healthScore = 100;

  const isOwner = role === 'admin' || role === 'super_admin';
  const isOperator = role === 'operator' || isOwner;
  const isTechnician = role === 'viewer' || role === 'operator';

  const promises: Promise<void>[] = [];

  // ── 1. Incidentes ativos (todos os papéis) ──────────────────────────────
  promises.push((async () => {
    const { data } = await db.from('incidents')
      .select('id, title, status, severity, affected_customers')
      .eq('tenant_id', tenantId)
      .in('status', ['suspeita', 'confirmada', 'comunicada'])
      .order('detected_at', { ascending: false })
      .limit(10);

    const incidents = data ?? [];
    snapshot.activeIncidents = incidents.length;

    if (incidents.length > 0) {
      const critical = incidents.filter((i: any) => i.severity === 'critical' || i.severity === 'high');
      const affected = incidents.reduce((s: number, i: any) => s + (i.affected_customers ?? 0), 0);

      if (critical.length > 0) {
        healthScore -= 30;
        items.push({
          id: 'incident-critical',
          severity: 'critical',
          title: `${critical.length} incidente(s) crítico(s) na rede`,
          description: `${affected} clientes afetados. Ação imediata necessária.`,
          metric: `${affected} afetados`,
          action: { label: 'Ver incidentes', path: '/intelligence/incidents' },
          source: 'incidents',
        });
      } else {
        healthScore -= 10;
        items.push({
          id: 'incident-active',
          severity: 'warning',
          title: `${incidents.length} incidente(s) ativo(s)`,
          description: `${affected} clientes potencialmente afetados.`,
          metric: `${incidents.length} ativos`,
          action: { label: 'Ver incidentes', path: '/intelligence/incidents' },
          source: 'incidents',
        });
      }
    }
  })());

  // ── 2. Inbox / conversas (operator + owner) ─────────────────────────────
  if (isOperator) {
    promises.push((async () => {
      const { data } = await db.from('conversations')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .in('status', ['open', 'escalated', 'waiting']);

      const convs = data ?? [];
      const open = convs.filter((c: any) => c.status === 'open').length;
      const escalated = convs.filter((c: any) => c.status === 'escalated').length;
      snapshot.openConversations = open;
      snapshot.escalatedConversations = escalated;

      if (escalated > 0) {
        healthScore -= Math.min(15, escalated * 3);
        items.push({
          id: 'inbox-escalated',
          severity: escalated > 5 ? 'critical' : 'warning',
          title: `${escalated} conversa(s) escalada(s)`,
          description: 'Clientes aguardando atendimento humano.',
          metric: `${escalated} escaladas`,
          action: { label: 'Abrir inbox', path: '/chat' },
          source: 'inbox',
        });
      }

      if (open > 10) {
        items.push({
          id: 'inbox-volume',
          severity: 'info',
          title: `${open} conversas abertas`,
          description: 'Volume acima do normal — monitorar fila.',
          metric: `${open} abertas`,
          action: { label: 'Ver fila', path: '/chat' },
          source: 'inbox',
        });
      }
    })());
  }

  // ── 3. Financeiro (owner) ────────────────────────────────────────────────
  if (isOwner) {
    promises.push((async () => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

      const [{ data: invoices }, { data: customers }] = await Promise.all([
        db.from('invoices')
          .select('amount_cents, status, due_date, paid_at')
          .eq('tenant_id', tenantId)
          .gte('due_date', since),
        db.from('customers')
          .select('id, mrr_cents, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),
      ]);

      const actives = customers ?? [];
      snapshot.activeCustomers = actives.length;
      snapshot.mrrCents = actives.reduce((s: number, c: any) => s + Number(c.mrr_cents ?? 0), 0);

      const invoiceRows = (invoices ?? []) as InvoiceRow[];
      if (invoiceRows.length > 0) {
        const baseline = summarizeHistory(invoiceRows, 90);
        snapshot.openOverdueCents = baseline.unpaidCents;

        const lateRate = baseline.billedCents > 0 ? baseline.paidLateCents / baseline.billedCents : 0;
        const lossRate = baseline.billedCents > 0 ? 1 - (baseline.paidOnTimeCents + baseline.paidLateCents) / baseline.billedCents : 0;
        snapshot.recoverableOverdueCents = Math.round(
          baseline.unpaidCents * (lateRate / Math.max(0.01, lateRate + lossRate)),
        );

        if (baseline.unpaidCents > 0) {
          const overdueRate = baseline.billedCents > 0 ? baseline.unpaidCents / baseline.billedCents : 0;
          const sev: ItemSeverity = overdueRate > 0.15 ? 'critical' : overdueRate > 0.05 ? 'warning' : 'info';
          if (sev === 'critical') healthScore -= 20;
          else if (sev === 'warning') healthScore -= 10;

          items.push({
            id: 'finance-overdue',
            severity: sev,
            title: `${fmt(baseline.unpaidCents)} em inadimplência`,
            description: `~${fmt(snapshot.recoverableOverdueCents)} recuperáveis na taxa histórica.`,
            metric: fmt(baseline.unpaidCents),
            action: { label: 'Ver CobrAI', path: '/cobrai' },
            source: 'finance',
          });
        }
      }
    })());
  }

  // ── 4. Churn (owner) ─────────────────────────────────────────────────────
  if (isOwner) {
    promises.push((async () => {
      const { data, count } = await db.from('churn_scores')
        .select('customer_id, score, risk_band', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('risk_band', ['high', 'critical'])
        .order('score', { ascending: false })
        .limit(5);

      const highRisk = count ?? (data?.length ?? 0);
      if (highRisk > 0) {
        healthScore -= Math.min(15, highRisk * 3);
        items.push({
          id: 'churn-risk',
          severity: highRisk > 10 ? 'critical' : 'warning',
          title: `${highRisk} cliente(s) em risco alto de churn`,
          description: 'Modelo preditivo identificou padrões de abandono.',
          metric: `${highRisk} em risco`,
          action: { label: 'Ver churn', path: '/intelligence' },
          source: 'churn',
        });
      }
    })());
  }

  // ── 5. Reflexões do cérebro noturno (owner) ─────────────────────────────
  if (isOwner) {
    promises.push((async () => {
      const { data } = await db.from('ai_reflections')
        .select('reflection_date, metrics, hypotheses, actions')
        .eq('tenant_id', tenantId)
        .order('reflection_date', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const ref = data[0] as any;
        const metrics = ref.metrics ?? {};
        snapshot.aiResolutionRate = metrics.aiResolutionRate ?? undefined;

        const actions = (ref.actions ?? []) as any[];
        const pending = actions.filter((a: any) => a.status !== 'executed');
        if (pending.length > 0) {
          items.push({
            id: 'brain-actions',
            severity: 'info',
            title: `Cérebro sugeriu ${pending.length} ação(ões)`,
            description: `Última reflexão em ${ref.reflection_date}.`,
            metric: `${pending.length} pendentes`,
            action: { label: 'Ver reflexões', path: '/intelligence/reflections' },
            source: 'brain',
          });
        }

        const hypotheses = (ref.hypotheses ?? []) as any[];
        const critical = hypotheses.filter((h: any) => h.severity === 'high' || h.severity === 'critical');
        if (critical.length > 0) {
          items.push({
            id: 'brain-hypotheses',
            severity: 'warning',
            title: `${critical.length} hipótese(s) crítica(s) do cérebro`,
            description: critical[0]?.text?.slice(0, 120) ?? 'Verificar reflexões.',
            action: { label: 'Ver detalhes', path: '/intelligence/reflections' },
            source: 'brain',
          });
        }
      }
    })());
  }

  // ── 6. Agenda de campo (technician) ──────────────────────────────────────
  if (isTechnician) {
    promises.push((async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await db.from('service_orders')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('scheduled_for', today)
        .in('status', ['pending', 'in_progress', 'assigned']);

      const orders = data ?? [];
      snapshot.todayOrders = orders.length;

      if (orders.length > 0) {
        items.push({
          id: 'field-agenda',
          severity: 'info',
          title: `${orders.length} OS para hoje`,
          description: 'Ordens de serviço agendadas para o dia.',
          metric: `${orders.length} OS`,
          action: { label: 'Ver agenda', path: '/field' },
          source: 'field',
        });
      }
    })());
  }

  // ── 7. CTOs com capacidade crítica (owner) ──────────────────────────────
  if (isOwner) {
    promises.push((async () => {
      const { data } = await db.from('network_ctos')
        .select('id, name, used_ports, total_ports')
        .eq('tenant_id', tenantId)
        .gt('total_ports', 0);

      const ctos = (data ?? []) as any[];
      const atRisk = ctos.filter((c: any) => c.total_ports > 0 && c.used_ports / c.total_ports >= 0.85);

      if (atRisk.length > 0) {
        items.push({
          id: 'cto-capacity',
          severity: atRisk.length > 3 ? 'warning' : 'info',
          title: `${atRisk.length} CTO(s) acima de 85% de capacidade`,
          description: 'Risco de não atender novos clientes na região.',
          metric: `${atRisk.length} CTOs`,
          action: { label: 'Ver rede', path: '/network-map' },
          source: 'network',
        });
      }
    })());
  }

  await Promise.all(promises);

  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthLabel = healthScore >= 80
    ? 'Operação saudável'
    : healthScore >= 50
      ? 'Atenção necessária'
      : 'Situação crítica';

  const sorted = sortItems(items);
  const critCount = sorted.filter(i => i.severity === 'critical' || i.severity === 'warning').length;
  const headline = critCount === 0
    ? 'Tudo sob controle. Nenhuma ação urgente.'
    : `${critCount} item(ns) precisam da sua atenção.`;

  infraLogger.info(
    { tenantId, role, healthScore, items: sorted.length },
    'G-01: smart home montada',
  );

  return { healthScore, healthLabel, headline, items: sorted, snapshot };
}
