import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import {
  listPersonas,
  createPersona,
  updatePersona,
  deletePersona,
  PersonaValidationError,
  type PersonaStore,
  type PersonaFields,
  type PersonaRow,
} from './personas.service';

/**
 * CRUD de personas de IA por tenant (AIConfigPage). Antes o front batia em
 * `/api/personas` (rota nunca montada → 404) apesar de o legado
 * `personaManager.ts` existir. Portado (R5) para o Fastify, escrevendo na MESMA
 * fonte que o `messageWorker` lê: coleção `ai_personas` no `legacy_docs`.
 *
 *   GET    /api/v2/personas
 *   POST   /api/v2/personas
 *   PUT    /api/v2/personas/:id
 *   DELETE /api/v2/personas/:id
 *
 * Tenant vem do JWT (dropado o `?tenantId`/`x-tenant-id` do front).
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

/** Store sobre `legacy_docs` (path `ai_personas/<id>`, parent_path NULL, campos em `data`). */
function legacyPersonaStore(): PersonaStore {
  const COLLECTION = 'ai_personas';
  return {
    async listByTenant(tenantId) {
      const { data, error } = await supabaseAdmin
        .from('legacy_docs')
        .select('path,data')
        .eq('collection', COLLECTION)
        .is('parent_path', null)
        .eq('data->>tenant_id', tenantId)
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => ({
        id: String(r.path).split('/').pop()!,
        data: r.data as PersonaFields,
      })) as PersonaRow[];
    },
    async getById(id) {
      const { data, error } = await supabaseAdmin
        .from('legacy_docs')
        .select('path,data')
        .eq('path', `${COLLECTION}/${id}`)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { id, data: (data as any).data as PersonaFields };
    },
    async upsert(id, fields) {
      const { error } = await supabaseAdmin.from('legacy_docs').upsert({
        path: `${COLLECTION}/${id}`,
        collection: COLLECTION,
        parent_path: null,
        data: fields,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    async remove(id) {
      const { error } = await supabaseAdmin
        .from('legacy_docs')
        .delete()
        .eq('path', `${COLLECTION}/${id}`);
      if (error) throw new Error(error.message);
    },
  };
}

export async function personasRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const store = legacyPersonaStore();

  app.get('/api/v2/personas', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    try {
      return await listPersonas(store, tenantId);
    } catch (e: any) {
      return reply.code(500).send({ code: 'DB_ERROR', message: e.message });
    }
  });

  app.post('/api/v2/personas', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    try {
      const { id } = await createPersona(store, tenantId, (req.body ?? {}) as any);
      return reply.code(201).send({ id });
    } catch (e: any) {
      if (e instanceof PersonaValidationError) return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message });
      return reply.code(500).send({ code: 'DB_ERROR', message: e.message });
    }
  });

  app.put('/api/v2/personas/:id', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const id = String((req.params as any).id);
    try {
      await updatePersona(store, tenantId, id, (req.body ?? {}) as any);
      return { success: true };
    } catch (e: any) {
      if (e instanceof PersonaValidationError) {
        // "não encontrada" → 404; validação de campo → 400
        const code = /não encontrada/i.test(e.message) ? 404 : 400;
        return reply.code(code).send({ code: code === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message: e.message });
      }
      return reply.code(500).send({ code: 'DB_ERROR', message: e.message });
    }
  });

  app.delete('/api/v2/personas/:id', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const id = String((req.params as any).id);
    try {
      await deletePersona(store, tenantId, id);
      return { success: true };
    } catch (e: any) {
      if (e instanceof PersonaValidationError) return reply.code(404).send({ code: 'NOT_FOUND', message: e.message });
      return reply.code(500).send({ code: 'DB_ERROR', message: e.message });
    }
  });
}
