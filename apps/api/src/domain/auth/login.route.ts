import type { FastifyInstance } from 'fastify';
import { verifyPassword, rehashIfNeeded } from '../../infrastructure/auth/password.service';
import { generateTokenPair } from '../../infrastructure/auth/jwt.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { loginBodySchema } from '../../../../../packages/shared/src/schemas';

export async function loginRoute(fastify: FastifyInstance) {
  fastify.post('/api/v2/auth/login', {
    preHandler: [validateBody(loginBodySchema)]
  }, async (request, reply) => {
    const { email, password } = (request as any).validatedBody;

    // Buscar usuário
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, password_hash, active')
      .eq('email', email.toLowerCase())
      .single();

    // Resposta genérica — nunca revelar se o email existe
    const GENERIC_ERROR = { code: 'INVALID_CREDENTIALS', message: 'Email ou senha incorretos.' };

    if (!user || !user.active) {
      securityLogger.warn({ email }, 'Tentativa de login com email não encontrado ou inativo');
      return reply.status(401).send(GENERIC_ERROR);
    }

    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      return reply.status(401).send(GENERIC_ERROR);
    }

    // Atualizar last_login_at
    await supabaseAdmin
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Rehash transparente se parâmetros mudaram
    const newHash = await rehashIfNeeded(user.password_hash, password);
    if (newHash) {
      await supabaseAdmin
        .from('users')
        .update({ password_hash: newHash })
        .eq('id', user.id);
    }

    const tokens = await generateTokenPair(
      fastify,
      { userId: user.id, tenantId: user.tenant_id, role: user.role as any },
      { userAgent: request.headers['user-agent'], ipAddress: request.ip }
    );

    securityLogger.info({ userId: user.id, tenantId: user.tenant_id }, 'Login bem-sucedido');
    return reply.send(tokens);
  });
}
