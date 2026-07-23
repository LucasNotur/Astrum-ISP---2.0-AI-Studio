import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import supabase from '../../infrastructure/database/supabase.client';
import { applyTransition, type OsEvent } from './os-lifecycle.service';
import { osLifecyclePorts } from './os-lifecycle.repo';
import { optimizeRoute, type RouteStop, type GeoPoint } from './route-optimizer.service';

const OS_EVENTS = [
  'criada', 'atribuida', 'aceita', 'a_caminho', 'chegou',
  'iniciada', 'pausada', 'retomada', 'concluida', 'cancelada', 'reagendada',
] as const;

const transitionBodySchema = z.object({
  event: z.enum(OS_EVENTS),
  lat: z.number().optional(),
  lng: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  completion: z.object({
    checklistTotal: z.number().int().min(0),
    checklistDone: z.number().int().min(0),
    photosDepois: z.number().int().min(0),
    hasSignature: z.boolean(),
    justification: z.string().optional(),
    requires: z.object({
      checklist: z.boolean().optional(),
      photoDepois: z.boolean().optional(),
      signature: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

const agendaQuerySchema = z.object({
  date: z.string().optional(),
});

const optimizeBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function fieldOpsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v2/field/agenda?date=YYYY-MM-DD
   * OSs atribuídas ao técnico logado, não-terminais, na ordem da rota.
   */
  fastify.get('/api/v2/field/agenda', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'read'), validateQuery(agendaQuerySchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;

    // Resolve o técnico logado (technicians.user_id).
    const { data: tech } = await supabase
      .from('technicians')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!tech) return reply.code(404).send({ code: 'NOT_A_TECHNICIAN', message: 'Usuário não é um técnico.' });

    let query = supabase
      .from('service_orders')
      .select('id, customer_name, address, latitude, longitude, status, type, description, scheduled_for, time_window_start, time_window_end, premise_id')
      .eq('tenant_id', tenantId)
      .eq('assigned_to', tech.id)
      .not('status', 'in', '(concluido,cancelado,completed,cancelled)')
      .order('scheduled_for', { ascending: true });

    const { data, error } = await query;
    if (error) return reply.code(500).send({ code: 'AGENDA_ERROR', message: 'Falha ao carregar agenda.' });

    return { technician_id: tech.id, orders: data ?? [] };
  });

  /**
   * POST /api/v2/field/os/:id/transition
   * Aplica UM evento à máquina de estados da OS. Valida transição e gate de
   * conclusão; grava evento imutável + atualiza status.
   */
  fastify.post('/api/v2/field/os/:id/transition', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'write'), validateBody(transitionBodySchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const serviceOrderId = (request.params as any).id as string;
    const body = (request as any).validatedBody as z.infer<typeof transitionBodySchema>;

    const { data: tech } = await supabase
      .from('technicians')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!tech) return reply.code(404).send({ code: 'NOT_A_TECHNICIAN', message: 'Usuário não é um técnico.' });

    const result = await applyTransition({
      tenantId,
      serviceOrderId,
      technicianId: tech.id,
      event: body.event as OsEvent,
      lat: body.lat,
      lng: body.lng,
      metadata: body.metadata,
      completion: body.completion,
    }, osLifecyclePorts);

    if (!result.ok) {
      // Conclusão bloqueada por gate → 422; transição inválida/terminal → 409.
      const code = result.missing ? 422 : 409;
      return reply.code(code).send({
        code: result.missing ? 'COMPLETION_BLOCKED' : 'INVALID_TRANSITION',
        message: result.error,
        missing: result.missing,
        from: result.fromPhase,
      });
    }

    return reply.code(200).send({
      ok: true,
      from: result.fromPhase,
      to: result.toPhase,
      status: result.status,
    });
  });

  /**
   * POST /api/v2/field/route/optimize  body { date? }
   * Otimiza a rota do dia do técnico logado (NN + 2-opt) e persiste route_plan/route_stops.
   */
  fastify.post('/api/v2/field/route/optimize', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'write'), validateBody(optimizeBodySchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof optimizeBodySchema>;
    const date = body.date ?? new Date().toISOString().slice(0, 10);

    const { data: tech } = await supabase
      .from('technicians')
      .select('id, base_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!tech) return reply.code(404).send({ code: 'NOT_A_TECHNICIAN', message: 'Usuário não é um técnico.' });

    // Ponto de partida: base do técnico → primeira base do tenant → primeira OS.
    let start: GeoPoint | null = null;
    if (tech.base_id) {
      const { data: base } = await supabase
        .from('bases').select('latitude, longitude').eq('id', tech.base_id).maybeSingle();
      if (base?.latitude != null && base?.longitude != null) start = { latitude: base.latitude, longitude: base.longitude };
    }
    if (!start) {
      const { data: base } = await supabase
        .from('bases').select('latitude, longitude').eq('tenant_id', tenantId).limit(1).maybeSingle();
      if (base?.latitude != null && base?.longitude != null) start = { latitude: base.latitude, longitude: base.longitude };
    }

    // OSs do dia, atribuídas, não-terminais, com coordenada.
    const { data: orders, error } = await supabase
      .from('service_orders')
      .select('id, latitude, longitude, scheduled_for')
      .eq('tenant_id', tenantId)
      .eq('assigned_to', tech.id)
      .not('status', 'in', '(concluido,cancelado,completed,cancelled)')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) return reply.code(500).send({ code: 'OPTIMIZE_ERROR', message: 'Falha ao carregar OSs.' });

    const stops: RouteStop[] = (orders ?? [])
      .filter((o: any) => {
        if (!o.scheduled_for) return true; // sem agendamento entra no dia corrente
        return String(o.scheduled_for).slice(0, 10) === date;
      })
      .map((o: any) => ({ serviceOrderId: o.id, latitude: o.latitude, longitude: o.longitude }));

    if (start === null) {
      if (stops.length === 0) return reply.code(200).send({ date, total_km: 0, stops: [] });
      const first = stops[0]!;
      start = { latitude: first.latitude, longitude: first.longitude };
    }

    const optimized = optimizeRoute(start, stops);

    // Persiste o plano do dia (idempotente: limpa o anterior do mesmo técnico+data).
    const { data: prior } = await supabase
      .from('route_plans').select('id').eq('tenant_id', tenantId).eq('technician_id', tech.id).eq('date', date);
    for (const p of prior ?? []) {
      await supabase.from('route_stops').delete().eq('route_plan_id', (p as any).id);
      await supabase.from('route_plans').delete().eq('id', (p as any).id);
    }

    const { data: plan, error: planErr } = await supabase
      .from('route_plans')
      .insert({
        tenant_id: tenantId, technician_id: tech.id, date, status: 'planejada',
        total_km_estimated: optimized.totalKm, optimized_at: new Date().toISOString(),
        algorithm: optimized.algorithm,
      })
      .select('id').single();

    if (planErr || !plan) return reply.code(500).send({ code: 'PLAN_SAVE_ERROR', message: 'Falha ao salvar rota.' });

    if (optimized.order.length > 0) {
      await supabase.from('route_stops').insert(
        optimized.order.map((s, i) => ({
          tenant_id: tenantId, route_plan_id: plan.id, service_order_id: s.serviceOrderId, position: i + 1,
        })),
      );
    }

    return reply.code(200).send({
      date,
      route_plan_id: plan.id,
      total_km: optimized.totalKm,
      algorithm: optimized.algorithm,
      stops: optimized.order.map((s, i) => ({ position: i + 1, service_order_id: s.serviceOrderId })),
    });
  });
}
