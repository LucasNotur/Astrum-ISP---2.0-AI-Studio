/**
 * P5-01 — GET /api/v2/valor/dashboard     Dashboard Valor Gerado (auth obrigatória).
 * P5-02 — GET /api/v2/valor/status        Status page pública (sem auth).
 * P5-04 — POST /api/v2/valor/case         Gera e persiste case auditado (auth).
 *          GET  /api/v2/valor/case/:token  Lê case pelo share_token (público).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  computeValorGerado,
  generateCase,
  defaultValorGeradoDb,
  type ValorGeradoDb,
} from './valor-gerado.service';
import supabase from '../../infrastructure/database/supabase.client';

const PeriodSchema = z.object({
  period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
});

function periodDays(period: string): number {
  return { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] ?? 30;
}

const SLA_COMMITMENT = {
  uptime_pct: 99.5,
  response_time_p95_ms: 1500,
  support_response_h: 4,
};

const COMPONENTS = ['api', 'whatsapp', 'ia', 'cobranca', 'portal'] as const;

export interface ValorRoutesDeps {
  db?: ValorGeradoDb;
}

export async function valorGeradoRoutes(
  app: FastifyInstance,
  deps: ValorRoutesDeps = {},
) {
  const db = deps.db ?? defaultValorGeradoDb;

  // ── P5-01: Dashboard Valor Gerado ─────────────────────────────────────────
  app.get('/api/v2/valor/dashboard', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const query = PeriodSchema.safeParse((request as any).query);
    const period = query.success ? query.data.period : '30d';
    const { tenantId } = (request as any).user;

    const kpis = await computeValorGerado(db, tenantId, periodDays(period));
    return reply.send(kpis);
  });

  // ── P5-02: Status page pública ────────────────────────────────────────────
  app.get('/api/v2/valor/status', async (_request, reply) => {
    // busca incidentes ativos (últimas 24h sem resolved_at)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: incidents } = await (supabase as any)
      .from('status_incidents')
      .select('id, title, component, severity, status, started_at, resolved_at')
      .or(`resolved_at.is.null,resolved_at.gte.${since24h}`)
      .order('started_at', { ascending: false })
      .limit(10);

    const activeIncidents = (incidents ?? []).filter((i: any) => i.status !== 'resolved');
    const overallStatus =
      activeIncidents.some((i: any) => i.severity === 'critical') ? 'outage' :
      activeIncidents.some((i: any) => i.severity === 'major')    ? 'degraded' :
      activeIncidents.length > 0                                   ? 'minor_issues' :
      'operational';

    const componentStatus: Record<string, string> = {};
    for (const c of COMPONENTS) {
      const inc = activeIncidents.find((i: any) => i.component === c);
      componentStatus[c] = inc ? inc.status : 'operational';
    }

    return reply.send({
      status: overallStatus,
      sla: SLA_COMMITMENT,
      components: componentStatus,
      incidents: incidents ?? [],
      generatedAt: new Date().toISOString(),
    });
  });

  // ── P5-04: Gerar case auditado ────────────────────────────────────────────
  app.post('/api/v2/valor/case', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const body = z.object({ periodDays: z.number().int().min(1).max(365).default(30) })
      .safeParse(request.body);
    const days = body.success ? body.data.periodDays : 30;
    const { tenantId } = (request as any).user;

    const { kpis, shareToken } = await generateCase(db, tenantId, days);
    const shareUrl = `/api/v2/valor/case/${shareToken}`;
    return reply.code(201).send({ shareToken, shareUrl, kpis });
  });

  // ── P5-04: Ler case público pelo token ────────────────────────────────────
  app.get('/api/v2/valor/case/:token', async (request, reply) => {
    const { token } = (request as any).params as { token: string };
    const caso = await db.getCaseByToken(token);
    if (!caso) return reply.code(404).send({ error: 'Case não encontrado' });

    const recoveredBrl = caso.recoveredCents / 100;
    return reply.send({
      ...caso,
      recoveredBrl,
      generatedAt: caso.createdAt,
      methodology: {
        recoveredNote: 'R$ recuperado = soma de faturas pagas após ação CobrAI. Auditável via cobrai_jobs × invoices.',
        hoursSavedNote: `Horas = atendimentos IA × 15 min (média setor ISP).`,
        roiNote: 'ROI = R$ recuperado ÷ custo IA em BRL (USD × 5,20).',
      },
    });
  });
}
