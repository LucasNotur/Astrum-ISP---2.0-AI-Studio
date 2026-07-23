import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../infrastructure/validation/zod-validator';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import supabase from '../../infrastructure/database/supabase.client';
import { applyTransition, type OsEvent } from './os-lifecycle.service';
import { osLifecyclePorts } from './os-lifecycle.repo';

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
}
