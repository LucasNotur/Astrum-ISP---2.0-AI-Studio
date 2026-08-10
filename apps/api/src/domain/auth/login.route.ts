import type { FastifyInstance } from 'fastify';
import { verifyPassword, rehashIfNeeded, hashPassword } from '../../infrastructure/auth/password.service';
import { generateTokenPair } from '../../infrastructure/auth/jwt.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { loginBodySchema } from '../../../../../packages/shared/src/schemas';

// AUTH-03: hash "dummy" para equalizar o tempo de resposta quando o e-mail não existe.
// Sem isso, argon2.verify só roda para e-mail existente → o delta de latência revela quais
// e-mails têm conta (enumeração de usuário). Calculado uma vez, sob demanda.
let _dummyHash: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!_dummyHash) _dummyHash = hashPassword('x'.repeat(16));
  return _dummyHash;
}

export async function loginRoute(fastify: FastifyInstance) {
  fastify.post('/api/v2/auth/login', {
    preHandler: [validateBody(loginBodySchema)]
  }, async (request, reply) => {
    const { email, password } = (request as any).validatedBody;

    // Buscar usuário
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, role, password_hash, active, must_reset_password')
      .eq('email', email.toLowerCase())
      .single();

    // Resposta genérica — nunca revelar se o email existe
    const GENERIC_ERROR = { code: 'INVALID_CREDENTIALS', message: 'Email ou senha incorretos.' };

    if (!user || !user.active) {
      // AUTH-03: roda um argon2.verify contra o hash dummy para o tempo de resposta ser
      // equivalente ao de um e-mail existente (fecha o oráculo de enumeração de usuário).
      await verifyPassword(await dummyHash(), password).catch(() => {});
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

    // force_reset (S77): usuário migrado do Firebase precisa redefinir a senha antes de
    // receber sessão plena. Não emitimos tokens neste caso.
    if (user.must_reset_password) {
      const { buildLoginResult } = await import('./login-response');
      const result = buildLoginResult(user as any, { accessToken: '', refreshToken: '' });
      securityLogger.info({ userId: user.id }, 'Login exige redefinição de senha (migração)');
      return reply.status(200).send(result);
    }

    const tokens = await generateTokenPair(
      fastify,
      { userId: user.id, tenantId: user.tenant_id, role: user.role as any },
      { userAgent: request.headers['user-agent'], ipAddress: request.ip }
    );

    securityLogger.info({ userId: user.id, tenantId: user.tenant_id }, 'Login bem-sucedido');
    return reply.send({ kind: 'ok', tokens });
  });
}
