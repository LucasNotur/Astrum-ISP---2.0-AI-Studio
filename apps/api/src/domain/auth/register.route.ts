import type { FastifyInstance } from 'fastify';
import { hashPassword } from '../../infrastructure/auth/password.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { registerBodySchema } from '../../../../../packages/shared/src/schemas';

export async function registerRoute(fastify: FastifyInstance) {
  fastify.post('/api/v2/auth/register', {
    onRequest: [fastify.authenticate],
    preHandler: [
      async (req: any, reply: any) => {
        if (!['super_admin', 'admin'].includes(req.user?.role)) {
          return reply.status(403).send({ code: 'FORBIDDEN', message: 'Apenas admins podem criar usuários.' });
        }
      },
      validateBody(registerBodySchema)
    ],
  }, async (request, reply) => {
    const { name, email, password, tenantId, role } = (request as any).validatedBody;
    const passwordHash = await hashPassword(password);

    const { data: user, error } = await supabaseAdmin.from('users').insert({
      name, email: email.toLowerCase(), password_hash: passwordHash, tenant_id: tenantId, role,
    }).select('id, email, role').single();

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ code: 'EMAIL_EXISTS', message: 'Email já cadastrado.' });
      }
      securityLogger.error({ err: error }, 'Erro ao criar usuário');
      return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Erro ao criar usuário.' });
    }

    securityLogger.info({ userId: user.id, role }, 'Novo usuário criado');
    return reply.status(201).send({ id: user.id, email: user.email, role: user.role });
  });
}
