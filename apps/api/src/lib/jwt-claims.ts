type JwtUserRecord = Record<string, unknown> | null | undefined;

/**
 * Leitura única e canônica do tenantId vindo do JWT.
 *
 * O JWT do Astrum usa camelCase (`tenantId`), mas tokens antigos (e alguns fluxos)
 * carregavam snake_case (`tenant_id`). Em 2026-08-24, 11 rotas liam só
 * `user.tenant_id` e rejeitavam todo usuário real. Este fallback camelCase→snake_case
 * existe uma única vez aqui — rotas e serviços devem usar este helper em vez de
 * acessar `user.tenantId`/`user.tenant_id` direto (regra ESLint no-restricted-syntax).
 */
export function getTenantId(user: unknown): string | null {
  const u = user as JwtUserRecord;
  const id = u?.tenantId ?? u?.tenant_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Leitura única e canônica do userId vindo do JWT.
 *
 * O JWT do Astrum usa `userId`, com fallbacks históricos `uid` (Firebase legado) e
 * `sub` (claim padrão JWT). Mesmo padrão de fallback que as rotas de unmask e
 * negociação já usavam manualmente (`u.userId ?? u.uid ?? u.sub`).
 */
export function getUserId(user: unknown): string | null {
  const u = user as JwtUserRecord;
  const id = u?.userId ?? u?.uid ?? u?.sub;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
