import argon2 from 'argon2';
import { securityLogger } from '../logging/logger';

/**
 * Configuração Argon2id seguindo recomendações OWASP 2024.
 * 
 * memoryCost: 65536 KB (64MB) — dificulta ataques de GPU
 * timeCost: 3 iterações — balanço entre segurança e performance
 * parallelism: 4 threads
 * 
 * Em um servidor moderno, cada hash leva ~200-400ms — aceitável para login.
 * Este custo torna ataques de força bruta inviáveis economicamente.
 */
const ARGON2_CONFIG: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Gera o hash de uma senha.
 * O salt é gerado automaticamente pelo Argon2 e incluído no hash.
 * Nunca armazene senhas em texto puro — apenas o hash.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (plainPassword.length < 8) {
    throw new Error('Senha deve ter no mínimo 8 caracteres.');
  }

  const hash = await argon2.hash(plainPassword, ARGON2_CONFIG);
  securityLogger.info('Senha hasheada com Argon2id');
  return hash;
}

/**
 * Verifica se uma senha corresponde ao hash armazenado.
 * Usa comparação em tempo constante para evitar timing attacks.
 */
export async function verifyPassword(
  hash: string,
  plainPassword: string
): Promise<boolean> {
  try {
    const isValid = await argon2.verify(hash, plainPassword);

    if (!isValid) {
      securityLogger.warn('Tentativa de login com senha incorreta');
    }

    return isValid;
  } catch (err) {
    securityLogger.error({ err }, 'Erro ao verificar hash de senha');
    return false;
  }
}

/**
 * Verifica se um hash precisa ser atualizado
 * (algoritmo ou parâmetros mudaram desde que foi gerado).
 */
export async function needsRehash(hash: string): Promise<boolean> {
  return argon2.needsRehash(hash, ARGON2_CONFIG);
}

/**
 * Atualiza o hash de uma senha se necessário (migração transparente).
 * Use após login bem-sucedido para manter hashes atualizados.
 */
export async function rehashIfNeeded(
  hash: string,
  plainPassword: string
): Promise<string | null> {
  if (await needsRehash(hash)) {
    securityLogger.info('Rehash de senha necessário — atualizando para parâmetros novos');
    return hashPassword(plainPassword);
  }
  return null;
}
