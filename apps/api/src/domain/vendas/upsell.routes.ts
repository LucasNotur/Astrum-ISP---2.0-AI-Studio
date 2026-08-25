/**
 * SPEC 1 — POST /api/v2/upsell/convert.
 *
 * Registra um evento de upsell (operador aceitou/rejeitou uma oferta) na tabela
 * `upsell_events` (migration 100). Tenant e operador vêm do JWT — nunca do body.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId, getUserId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { sanitizeUpsellInput, UpsellValidationError } from './upsell.service';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

function operatorOf(req: any): string | null {
  return getUserId(req.user);
}

export async function upsellRoutes(app: FastifyInstance) {
  app.post('/api/v2/upsell/convert', {
    onRequest: [app.authenticate],
  }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    let record;
    try {
      record = sanitizeUpsellInput(req.body, tenantId, operatorOf(req));
    } catch (err) {
      if (err instanceof UpsellValidationError) {
        return reply.code(400).send({ code: 'VALIDATION_ERROR', message: err.message });
      }
      throw err;
    }

    const { data, error } = await supabaseAdmin
      .from('upsell_events')
      .insert(record)
      .select('id')
      .single();

    if (error || !data) {
      return reply.code(500).send({ code: 'DB_ERROR', message: 'Falha ao registrar upsell.' });
    }

    return reply.send({ success: true, id: data.id });
  });
}
