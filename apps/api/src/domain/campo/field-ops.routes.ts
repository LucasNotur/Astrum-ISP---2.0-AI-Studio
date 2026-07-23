import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import supabase from '../../infrastructure/database/supabase.client';
import { applyTransition, type OsEvent } from './os-lifecycle.service';
import { osLifecyclePorts } from './os-lifecycle.repo';
import { optimizeRoute, type RouteStop, type GeoPoint } from './route-optimizer.service';
import { computeShiftKm, auditKmDivergence, type Breadcrumb } from './field-km.service';
import {
  computeOsDurations, aggregateKmByDay, averageDurationByType,
  type OsTimelineEvent, type DayKm, type TypedDuration,
} from './field-reports.service';

const OS_EVENTS = [
  'criada', 'atribuida', 'aceita', 'a_caminho', 'chegou',
  'iniciada', 'pausada', 'retomada', 'concluida', 'cancelada', 'reagendada',
] as const;

/** Resolve o técnico logado a partir do user_id. Null se o usuário não é técnico. */
async function getTech(tenantId: string, userId: string): Promise<{ id: string; base_id: string | null } | null> {
  const { data } = await supabase
    .from('technicians')
    .select('id, base_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as any) ?? null;
}

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

const shiftStartSchema = z.object({
  startOdometerKm: z.number().optional(),
  vehicle: z.string().optional(),
  baseId: z.string().uuid().optional(),
});

const shiftEndSchema = z.object({
  shiftId: z.string().uuid(),
  endOdometerKm: z.number().optional(),
});

const locationSchema = z.object({
  shiftId: z.string().uuid().optional(),
  points: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
    accuracyM: z.number().optional(),
    speedKmh: z.number().optional(),
    recordedAt: z.string(),
  })).min(1).max(500),
});

const mediaSchema = z.object({
  kind: z.enum(['fachada', 'antes', 'depois', 'equipamento', 'base_cto', 'assinatura', 'documento', 'serial', 'outro']),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  takenAt: z.string().optional(),
  diagnosisId: z.string().uuid().optional(),
  note: z.string().optional(),
});

const reportsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
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

  // ─── Jornada (shift) ───────────────────────────────────────────────────────

  /** POST /api/v2/field/shift/start — abre a jornada do técnico (odômetro opcional). */
  fastify.post('/api/v2/field/shift/start', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'write'), validateBody(shiftStartSchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof shiftStartSchema>;
    const tech = await getTech(tenantId, userId);
    if (!tech) return reply.code(404).send({ code: 'NOT_A_TECHNICIAN', message: 'Usuário não é um técnico.' });

    const { data, error } = await supabase.from('technician_shifts').insert({
      tenant_id: tenantId, technician_id: tech.id,
      start_odometer_km: body.startOdometerKm ?? null,
      vehicle: body.vehicle ?? null,
      base_id: body.baseId ?? tech.base_id ?? null,
    }).select('id, started_at').single();

    if (error || !data) return reply.code(500).send({ code: 'SHIFT_START_ERROR', message: 'Falha ao abrir jornada.' });
    return reply.code(201).send({ shift_id: data.id, started_at: data.started_at });
  });

  /** POST /api/v2/field/shift/end — fecha a jornada e calcula o km por GPS. */
  fastify.post('/api/v2/field/shift/end', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'write'), validateBody(shiftEndSchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof shiftEndSchema>;
    const tech = await getTech(tenantId, userId);
    if (!tech) return reply.code(404).send({ code: 'NOT_A_TECHNICIAN', message: 'Usuário não é um técnico.' });

    const { data: shift } = await supabase
      .from('technician_shifts').select('start_odometer_km')
      .eq('tenant_id', tenantId).eq('id', body.shiftId).eq('technician_id', tech.id).maybeSingle();
    if (!shift) return reply.code(404).send({ code: 'SHIFT_NOT_FOUND', message: 'Jornada não encontrada.' });

    const { data: points } = await supabase
      .from('technician_locations')
      .select('latitude, longitude, accuracy_m, recorded_at')
      .eq('tenant_id', tenantId).eq('shift_id', body.shiftId);

    const breadcrumbs: Breadcrumb[] = (points ?? []).map((p: any) => ({
      latitude: p.latitude, longitude: p.longitude, accuracyM: p.accuracy_m ?? undefined, recordedAt: p.recorded_at,
    }));
    const kmResult = computeShiftKm(breadcrumbs);

    const { error } = await supabase.from('technician_shifts').update({
      ended_at: new Date().toISOString(),
      end_odometer_km: body.endOdometerKm ?? null,
      computed_km: kmResult.km,
    }).eq('tenant_id', tenantId).eq('id', body.shiftId).eq('technician_id', tech.id);

    if (error) return reply.code(500).send({ code: 'SHIFT_END_ERROR', message: 'Falha ao fechar jornada.' });

    const startOdo = (shift as any).start_odometer_km;
    const audit = body.endOdometerKm != null && startOdo != null
      ? auditKmDivergence(kmResult.km, body.endOdometerKm - startOdo)
      : null;
    return reply.code(200).send({ shift_id: body.shiftId, computed_km: kmResult.km, points_used: kmResult.usedPoints, audit });
  });

  /** POST /api/v2/field/location — ping de breadcrumbs em lote (economia de bateria). */
  fastify.post('/api/v2/field/location', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'write'), validateBody(locationSchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const body = (request as any).validatedBody as z.infer<typeof locationSchema>;
    const tech = await getTech(tenantId, userId);
    if (!tech) return reply.code(404).send({ code: 'NOT_A_TECHNICIAN', message: 'Usuário não é um técnico.' });

    const rows = body.points.map((p) => ({
      tenant_id: tenantId, technician_id: tech.id, shift_id: body.shiftId ?? null,
      latitude: p.lat, longitude: p.lng, accuracy_m: p.accuracyM ?? null, speed_kmh: p.speedKmh ?? null,
      recorded_at: p.recordedAt,
    }));
    const { error } = await supabase.from('technician_locations').insert(rows);
    if (error) return reply.code(500).send({ code: 'LOCATION_ERROR', message: 'Falha ao registrar localização.' });
    return reply.code(202).send({ accepted: rows.length });
  });

  // ─── Mídia e dossiê ────────────────────────────────────────────────────────

  /** POST /api/v2/field/os/:id/media — registra mídia tipada (foto antes/depois, etc). */
  fastify.post('/api/v2/field/os/:id/media', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'write'), validateBody(mediaSchema)],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const serviceOrderId = (request.params as any).id as string;
    const body = (request as any).validatedBody as z.infer<typeof mediaSchema>;
    const tech = await getTech(tenantId, userId);

    const { data, error } = await supabase.from('service_order_media').insert({
      tenant_id: tenantId, service_order_id: serviceOrderId, technician_id: tech?.id ?? null,
      kind: body.kind, url: body.url, thumbnail_url: body.thumbnailUrl ?? null,
      latitude: body.lat ?? null, longitude: body.lng ?? null, taken_at: body.takenAt ?? null,
      diagnosis_id: body.diagnosisId ?? null, note: body.note ?? null,
    }).select('id').single();

    if (error || !data) return reply.code(500).send({ code: 'MEDIA_ERROR', message: 'Falha ao registrar mídia.' });
    return reply.code(201).send({ id: data.id });
  });

  /** GET /api/v2/field/os/:id/dossie — timeline + mídia + checklist + materiais + tempos. */
  fastify.get('/api/v2/field/os/:id/dossie', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'read')],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const serviceOrderId = (request.params as any).id as string;

    const [os, events, media, checklist, materials] = await Promise.all([
      supabase.from('service_orders').select('*').eq('tenant_id', tenantId).eq('id', serviceOrderId).maybeSingle(),
      supabase.from('service_order_events').select('event, created_at, latitude, longitude, metadata').eq('tenant_id', tenantId).eq('service_order_id', serviceOrderId).order('created_at', { ascending: true }),
      supabase.from('service_order_media').select('kind, url, thumbnail_url, latitude, longitude, taken_at, note').eq('tenant_id', tenantId).eq('service_order_id', serviceOrderId).order('created_at', { ascending: true }),
      supabase.from('service_order_checklist_items').select('item_key, label, required, done, done_at').eq('tenant_id', tenantId).eq('service_order_id', serviceOrderId),
      supabase.from('service_order_materials').select('name, serial_number, quantity, unit').eq('tenant_id', tenantId).eq('service_order_id', serviceOrderId),
    ]);

    if (!os.data) return reply.code(404).send({ code: 'OS_NOT_FOUND', message: 'OS não encontrada.' });

    const timeline: OsTimelineEvent[] = (events.data ?? []).map((e: any) => ({ event: e.event, at: e.created_at }));
    const durations = computeOsDurations(timeline);

    return {
      order: os.data,
      timeline: events.data ?? [],
      media: media.data ?? [],
      checklist: checklist.data ?? [],
      materials: materials.data ?? [],
      durations,
    };
  });

  // ─── Relatórios (gestor) ───────────────────────────────────────────────────

  /** GET /api/v2/field/reports/km — km/dia por técnico (janela opcional). */
  fastify.get('/api/v2/field/reports/km', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'read'), validateQuery(reportsQuerySchema)],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const q = (request as any).validatedQuery as z.infer<typeof reportsQuerySchema>;

    let query = supabase.from('technician_shifts')
      .select('started_at, computed_km').eq('tenant_id', tenantId).not('computed_km', 'is', null);
    if (q.from) query = (query as any).gte('started_at', q.from);
    if (q.to) query = (query as any).lte('started_at', q.to);

    const { data } = await query;
    const perDay: DayKm[] = (data ?? []).map((s: any) => ({ day: String(s.started_at).slice(0, 10), km: Number(s.computed_km) }));
    return { by_day: aggregateKmByDay(perDay), total_km: Math.round(perDay.reduce((a, d) => a + d.km, 0) * 100) / 100 };
  });

  /** GET /api/v2/field/reports/tempo — tempo médio de execução por tipo de OS. */
  fastify.get('/api/v2/field/reports/tempo', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'read')],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;

    const { data: orders } = await supabase
      .from('service_orders').select('id, type').eq('tenant_id', tenantId).in('status', ['concluido', 'completed']).limit(500);

    const items: TypedDuration[] = [];
    for (const o of orders ?? []) {
      const { data: evs } = await supabase
        .from('service_order_events').select('event, created_at').eq('tenant_id', tenantId).eq('service_order_id', (o as any).id);
      const timeline: OsTimelineEvent[] = (evs ?? []).map((e: any) => ({ event: e.event, at: e.created_at }));
      const d = computeOsDurations(timeline);
      if (d.execucaoMin != null) items.push({ type: (o as any).type ?? 'servico', execucaoMin: d.execucaoMin });
    }
    return { by_type: averageDurationByType(items), sample: items.length };
  });

  /** GET /api/v2/field/live — (gestor) técnicos + última posição + OSs ativas hoje. */
  fastify.get('/api/v2/field/live', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('service_orders', 'read')],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;

    const { data: techs } = await supabase
      .from('technicians').select('id, name, status, current_task, vehicle, plate').eq('tenant_id', tenantId);

    const live = await Promise.all((techs ?? []).map(async (t: any) => {
      const { data: loc } = await supabase
        .from('technician_locations').select('latitude, longitude, recorded_at')
        .eq('tenant_id', tenantId).eq('technician_id', t.id)
        .order('recorded_at', { ascending: false }).limit(1).maybeSingle();
      const { count } = await supabase
        .from('service_orders').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('assigned_to', t.id)
        .not('status', 'in', '(concluido,cancelado,completed,cancelled)');
      return {
        technician_id: t.id, name: t.name, status: t.status, vehicle: t.vehicle, plate: t.plate,
        last_location: loc ?? null, active_orders: count ?? 0,
      };
    }));

    return { technicians: live };
  });
}
