import Redis from 'ioredis'
import pino from 'pino'

const logger = pino({ name: 'token-blacklist' })

// Singleton — reutiliza a mesma conexão Redis do projeto
let _redis: Redis | null = null

function getRedis(): Redis {
  if (_redis) return _redis
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL não definida')
  _redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
  })
  _redis.on('error', (err) => logger.error({ err }, 'Redis blacklist error'))
  return _redis
}

const BLACKLIST_PREFIX = 'auth:blacklist:'

/**
 * AUTH-04 (auditoria 2026-08-10): fail-open vs fail-closed é um trade-off
 * segurança × disponibilidade. Default = fail-open (comportamento histórico: um Redis
 * fora NÃO derruba a autenticação, mas um token revogado passa durante a falha).
 * Em produção com dados sensíveis, setar AUTH_REVOCATION_FAIL_CLOSED=true torna a
 * revogação confiável — ao custo de que uma indisponibilidade do Redis bloqueia auth.
 */
function failClosed(): boolean {
  return process.env.AUTH_REVOCATION_FAIL_CLOSED === 'true'
}

/**
 * Adiciona um token à blacklist.
 * TTL = tempo restante até exp do token (não guardamos tokens já expirados).
 */
export async function blacklistToken(jti: string, expiresAt: number): Promise<void> {
  const ttlSeconds = expiresAt - Math.floor(Date.now() / 1000)
  if (ttlSeconds <= 0) return // já expirou, não precisa guardar
  try {
    await getRedis().set(`${BLACKLIST_PREFIX}${jti}`, '1', 'EX', ttlSeconds)
    logger.info({ jti }, 'Token adicionado à blacklist')
  } catch (err) {
    logger.error({ err, jti }, 'Falha ao blacklistar token')
    throw err
  }
}

/**
 * Verifica se um token está na blacklist.
 * Em falha do Redis: fail-open (default) permite; fail-closed (env) trata como
 * blacklistado (bloqueia). Ver failClosed()/AUTH-04.
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    const val = await getRedis().get(`${BLACKLIST_PREFIX}${jti}`)
    return val !== null
  } catch (err) {
    const fc = failClosed()
    logger.warn({ err, jti, failClosed: fc }, `Redis blacklist indisponível — ${fc ? 'fail-closed (bloqueia)' : 'fail-open'}`)
    return fc // fail-closed → considera blacklistado; fail-open → permite
  }
}

/**
 * Revoga todos os tokens de um usuário setando um "revoke timestamp".
 * Qualquer token emitido antes desse timestamp é rejeitado.
 * Útil para: troca de senha, suspeita de comprometimento, demissão.
 */
export async function revokeAllUserTokens(uid: string): Promise<void> {
  const key = `auth:revoke_before:${uid}`
  const now = Math.floor(Date.now() / 1000)
  try {
    // Guarda por 30 dias (tempo máximo de vida de um Firebase ID token refresh)
    await getRedis().set(key, now.toString(), 'EX', 60 * 60 * 24 * 30)
    logger.warn({ uid }, 'Todos os tokens do usuário revogados')
  } catch (err) {
    logger.error({ err, uid }, 'Falha ao revogar tokens do usuário')
    throw err
  }
}

/**
 * Retorna o timestamp a partir do qual tokens do usuário são válidos.
 * null = sem revogação ativa.
 */
export async function getUserRevokeTimestamp(uid: string): Promise<number | null> {
  try {
    const val = await getRedis().get(`auth:revoke_before:${uid}`)
    return val ? parseInt(val, 10) : null
  } catch (err) {
    const fc = failClosed()
    logger.warn({ err, uid, failClosed: fc }, `Redis revoke check indisponível — ${fc ? 'fail-closed (bloqueia)' : 'fail-open'}`)
    // fail-closed → retorna "agora": qualquer token com iat < now é tratado como revogado (bloqueia tudo).
    return fc ? Math.floor(Date.now() / 1000) : null
  }
}
