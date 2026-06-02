import type { FastifyInstance } from 'fastify';
import { r2Adapter } from '../../adapters/storage/r2.adapter';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { requirePlanCapacity } from '../onboarding/plan-limits.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { iaLogger } from '../../infrastructure/logging/logger';
import { outboxService } from '../../infrastructure/queue/outbox.service';

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export async function documentRoutes(fastify: FastifyInstance) {
  // Upload de manual/documento para base de conhecimento RAG
  fastify.post('/api/v2/documents/upload', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('ai_config', 'write'),
      requirePlanCapacity('documents'),
    ],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ code: 'NO_FILE', message: 'Nenhum arquivo enviado.' });
    }

    const contentType = data.mimetype;
    const fileType = ALLOWED_TYPES[contentType];

    if (!fileType) {
      return reply.status(415).send({
        code: 'UNSUPPORTED_TYPE',
        message: `Tipo de arquivo não suportado. Aceitos: ${Object.values(ALLOWED_TYPES).join(', ')}`,
      });
    }

    const buffer = await data.toBuffer();

    if (buffer.length > MAX_SIZE_BYTES) {
      return reply.status(413).send({
        code: 'FILE_TOO_LARGE',
        message: 'Arquivo muito grande. Máximo: 50MB.',
      });
    }

    // Upload para R2
    const uploaded = await r2Adapter.upload(
      tenantId, 'documents', data.filename, buffer, contentType
    );

    // Registrar no banco (status: processing — RAG indexará via Outbox Pattern)
    const { data: doc, error } = await supabaseAdmin
      .from('knowledge_documents')
      .insert({
        tenant_id: tenantId,
        filename: data.filename,
        file_type: fileType,
        file_size_bytes: uploaded.size,
        status: 'processing',
        r2_key: uploaded.key,
        qdrant_collection: `tenant_${tenantId}`,
        uploaded_by: userId,
      })
      .select('id, filename, status')
      .single();

    if (error) throw error;

    iaLogger.info({ tenantId, documentId: doc.id, filename: data.filename }, 'Documento enviado, registrando outbox');
    
    // Publicar via Outbox para indexação assíncrona
    await outboxService.publish(tenantId, 'document.uploaded', {
      documentId: doc.id,
      fileKey: uploaded.key,
      filename: data.filename,
    });

    const { promptCacheService } = await import('../../infrastructure/ai/prompt-cache.service');
    await promptCacheService.invalidate(tenantId);

    return reply.status(201).send({
      id: doc.id,
      filename: doc.filename,
      status: doc.status,
      message: 'Documento recebido. A indexação para o RAG começará em instantes.',
    });
  });

  // Listar documentos do tenant
  fastify.get('/api/v2/documents', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const { tenantId } = (request as any).user;

    const { data } = await supabaseAdmin
      .from('knowledge_documents')
      .select('id, filename, file_type, status, chunks_count, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    return { documents: data ?? [] };
  });

  // Gerar URL de download para um documento
  fastify.get('/api/v2/documents/:id/download', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { id } = request.params as { id: string };

    const { data: doc } = await supabaseAdmin
      .from('knowledge_documents')
      .select('r2_key, filename')
      .eq('id', id)
      .eq('tenant_id', tenantId) // garantia extra de isolamento
      .single();

    if (!doc) {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Documento não encontrado.' });
    }

    const url = await r2Adapter.getPresignedUrl(doc.r2_key, 900); // 15 minutos
    return { url, filename: doc.filename, expiresInSeconds: 900 };
  });
}
