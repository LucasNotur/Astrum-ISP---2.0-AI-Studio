import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';

/**
 * IA-09 — CTO Packet Loss Alert Worker.
 *
 * Verifica CTOs com packet_loss_pct médio > 5% na última hora
 * e cria ticket de alerta (com deduplicação).
 *
 * Flag: CTO_ALERT_ENABLED (default false).
 * Agendamento: cron a cada 15 minutos (gerenciado externamente via BullMQ scheduler).
 */

function isCtoAlertEnabled(): boolean {
  return (process.env.CTO_ALERT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

interface CtoAlert {
  tenantId: string;
  ctoId: string;
  avgLoss: number;
}

async function findCtosAboveThreshold(): Promise<CtoAlert[]> {
  const cutoff = new Date(Date.now() - 3600_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('network_metrics')
    .select('tenant_id, cto_id')
    .eq('metric', 'packet_loss_pct')
    .gte('collected_at', cutoff);

  if (error || !data) return [];

  // Agrupar por cto_id e calcular média no lado da aplicação
  const groups = new Map<string, { tenantId: string; values: number[] }>();
  for (const row of data) {
    const key = `${row.tenant_id}:${row.cto_id}`;
    if (!groups.has(key)) groups.set(key, { tenantId: row.tenant_id, values: [] });
    // Precisamos dos valores — faz outra query simplificada
  }

  // Query agregada
  const { data: aggregated, error: aggErr } = await supabaseAdmin.rpc('cto_packet_loss_1h', {
    threshold_pct: 5,
    since: cutoff,
  }).catch(() => ({ data: null, error: new Error('RPC not available') }));

  // Fallback: query manual
  if (aggErr || !aggregated) {
    const { data: metrics } = await supabaseAdmin
      .from('network_metrics')
      .select('tenant_id, cto_id, value')
      .eq('metric', 'packet_loss_pct')
      .gte('collected_at', cutoff);

    if (!metrics) return [];

    const sums = new Map<string, { tenantId: string; sum: number; count: number }>();
    for (const m of metrics) {
      const key = `${m.tenant_id}:${m.cto_id}`;
      if (!sums.has(key)) sums.set(key, { tenantId: m.tenant_id, sum: 0, count: 0 });
      const entry = sums.get(key)!;
      entry.sum += m.value;
      entry.count++;
    }

    return Array.from(sums.entries())
      .filter(([, v]) => v.count > 0 && v.sum / v.count > 5)
      .map(([key, v]) => {
        const [tenantId, ctoId] = key.split(':');
        return { tenantId: tenantId!, ctoId: ctoId!, avgLoss: v.sum / v.count };
      });
  }

  return (aggregated as any[])?.map((r: any) => ({
    tenantId: r.tenant_id,
    ctoId: r.cto_id,
    avgLoss: r.avg_loss_pct,
  })) ?? [];
}

export async function runCtoAlertCheck(): Promise<void> {
  if (!isCtoAlertEnabled()) {
    infraLogger.warn('CTO alert: engine disabled (CTO_ALERT_ENABLED=off)');
    return;
  }

  infraLogger.info('CTO alert: checking for packet loss...');

  const alerts = await findCtosAboveThreshold();

  if (alerts.length === 0) {
    infraLogger.info('CTO alert: no CTOs above threshold');
    return;
  }

  for (const alert of alerts) {
    // Dedupe: não abrir ticket se já existe ticket aberto da mesma CTO com mesmo título
    const ticketTitle = `[REDE] Perda de pacotes na CTO ${alert.ctoId}`;

    const { data: existing } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('tenant_id', alert.tenantId)
      .eq('title', ticketTitle)
      .in('status', ['open', 'in_progress'])
      .limit(1);

    if (existing && existing.length > 0) {
      infraLogger.info({ tenantId: alert.tenantId, ctoId: alert.ctoId }, 'CTO alert: ticket already exists (skipping)');
      continue;
    }

    await supabaseAdmin.from('tickets').insert({
      tenant_id: alert.tenantId,
      title: ticketTitle,
      description: `Perda média de pacotes de ${alert.avgLoss.toFixed(1)}% na última hora. Verificar CTO.`,
      status: 'open',
      priority: 'high',
    });

    infraLogger.info({ tenantId: alert.tenantId, ctoId: alert.ctoId, avgLoss: alert.avgLoss.toFixed(1) }, 'CTO alert: ticket created');
  }

  infraLogger.info({ alertCount: alerts.length }, 'CTO alert: check complete');
}
