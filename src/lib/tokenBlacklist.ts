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
 * Fail-open: se Redis estiver down, permite a requisição (fail-open é deliberado
 * para não derrubar o sistema em falha de infra — trocar para fail-closed se
 * o requisito de segurança for mais alto que disponibilidade).
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    const val = await getRedis().get(`${BLACKLIST_PREFIX}${jti}`)
    return val !== null
  } catch (err) {
    logger.warn({ err, jti }, 'Redis blacklist indisponível — fail-open')
    return false // fail-open: preferimos disponibilidade a bloqueio total
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
    logger.warn({ err, uid }, 'Redis revoke check indisponível — fail-open')
    return null
  }
}
