import type { FastifyInstance } from 'fastify';
import { getUserId } from '../../lib/jwt-claims';
import { verifyPassword } from '../../infrastructure/auth/password.service';
import { generateTokenPair, verifyMfaPendingToken } from '../../infrastructure/auth/jwt.service';
import {
  generateEnrollment,
  verifyCode,
  saveEnrollment,
  confirmEnrollment,
  disableMfa,
  getMfaState,
  decryptSecret,
} from '../../infrastructure/auth/mfa.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { mfaCodeBodySchema, mfaChallengeBodySchema, mfaDisableBodySchema } from '../../../../../packages/shared/src/schemas';

/**
 * 2º fator (TOTP) para o login próprio do apps/api — migration 107.
 * enroll/verify/disable exigem sessão já autenticada (o usuário já provou a senha).
 * challenge é o único endpoint público: recebe o mfaToken de 5min emitido pelo login
 * quando totp_enabled=true, nunca um access token completo.
 */
export async function mfaRoutes(fastify: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (fastify as any).authenticate(req, reply); }];

  fastify.post('/api/v2/auth/mfa/enroll', { onRequest: auth }, async (request, reply) => {
    const userId = getUserId((request as any).user) ?? '';
    const state = await getMfaState(userId);
    if (state?.totp_enabled) {
      return reply.status(409).send({ code: 'MFA_ALREADY_ENABLED', message: 'MFA já está habilitado. Desabilite antes de refazer o cadastro.' });
    }

    const { data: row } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
    if (!row) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });

    const { secret, otpauthUrl } = generateEnrollment(row.email);
    await saveEnrollment(userId, secret);

    securityLogger.info({ userId: userId }, 'MFA enrollment iniciado');
    return reply.send({ secret, otpauthUrl });
  });

  fastify.post('/api/v2/auth/mfa/verify', {
    onRequest: auth,
    preHandler: [validateBody(mfaCodeBodySchema)],
  }, async (request, reply) => {
    const userId = getUserId((request as any).user) ?? '';
    const { code } = (request as any).validatedBody;

    const state = await getMfaState(userId);
    if (state?.totp_enabled) {
      return reply.status(409).send({ code: 'MFA_ALREADY_ENABLED', message: 'MFA já está habilitado.' });
    }
    if (!state?.totp_secret_enc) {
      return reply.status(400).send({ code: 'MFA_NOT_ENROLLED', message: 'Nenhum cadastro de MFA pendente. Chame /mfa/enroll primeiro.' });
    }

    const secret = decryptSecret(state.totp_secret_enc);
    if (!verifyCode(secret, code)) {
      securityLogger.warn({ userId: userId }, 'Código TOTP inválido na confirmação do enrollment');
      return reply.status(401).send({ code: 'INVALID_CODE', message: 'Código inválido.' });
    }

    await confirmEnrollment(userId);
    return reply.send({ ok: true });
  });

  fastify.post('/api/v2/auth/mfa/disable', {
    onRequest: auth,
    preHandler: [validateBody(mfaDisableBodySchema)],
  }, async (request, reply) => {
    const userId = getUserId((request as any).user) ?? '';
    const { password } = (request as any).validatedBody;

    const { data: row } = await supabaseAdmin.from('users').select('password_hash').eq('id', userId).single();
    if (!row || !(await verifyPassword(row.password_hash, password))) {
      return reply.status(401).send({ code: 'INVALID_CREDENTIALS', message: 'Senha incorreta.' });
    }

    await disableMfa(userId);
    return reply.send({ ok: true });
  });

  fastify.post('/api/v2/auth/mfa/challenge', {
    preHandler: [validateBody(mfaChallengeBodySchema)],
  }, async (request, reply) => {
    const { mfaToken, code } = (request as any).validatedBody;

    let pending;
    try {
      pending = verifyMfaPendingToken(fastify, mfaToken);
    } catch {
      return reply.status(401).send({ code: 'INVALID_MFA_TOKEN', message: 'Sessão de MFA inválida ou expirada. Faça login novamente.' });
    }

    const state = await getMfaState(pending.userId);
    if (!state?.totp_enabled || !state.totp_secret_enc) {
      securityLogger.error({ userId: pending.userId }, 'mfa/challenge para usuário sem MFA habilitado');
      return reply.status(400).send({ code: 'MFA_NOT_ENABLED', message: 'MFA não está habilitado para este usuário.' });
    }

    const secret = decryptSecret(state.totp_secret_enc);
    if (!verifyCode(secret, code)) {
      securityLogger.warn({ userId: pending.userId }, 'Código TOTP inválido no login');
      return reply.status(401).send({ code: 'INVALID_CODE', message: 'Código inválido.' });
    }

    const tokens = await generateTokenPair(
      fastify,
      { userId: pending.userId, tenantId: pending.tenantId, role: pending.role },
      { userAgent: request.headers['user-agent'], ipAddress: request.ip },
    );

    securityLogger.info({ userId: pending.userId, tenantId: pending.tenantId }, 'Login bem-sucedido (MFA)');
    return reply.send({ kind: 'ok', tokens });
  });
}
