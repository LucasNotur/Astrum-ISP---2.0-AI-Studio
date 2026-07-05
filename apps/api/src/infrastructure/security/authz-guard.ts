/**
 * Authz Guard — verificações de autorização por tenant (anti-IDOR) e LGPD.
 * Plano Mestre V2, S85. Funções puras usadas pelas rotas v2 e pelo audit OWASP.
 */

export interface Principal {
  userId: string;
  tenantId: string;
  role: 'viewer' | 'operator' | 'admin' | 'super_admin';
}

/**
 * Anti-IDOR: um recurso só pode ser acessado se pertencer ao tenant do principal.
 * super_admin transcende tenant (suporte da plataforma).
 */
export function canAccessResource(principal: Principal, resourceTenantId: string): boolean {
  if (principal.role === 'super_admin') return true;
  return principal.tenantId === resourceTenantId;
}

const ROLE_RANK: Record<Principal['role'], number> = {
  viewer: 1, operator: 2, admin: 3, super_admin: 4,
};

/** RBAC: principal tem pelo menos o papel mínimo exigido. */
export function hasMinRole(principal: Principal, minRole: Principal['role']): boolean {
  return ROLE_RANK[principal.role] >= ROLE_RANK[minRole];
}

/**
 * Right to be forgotten (LGPD, dossiê item 99): monta o plano de expurgo de um cliente.
 * Retorna as tabelas/serviços a limpar. Só admin+ do próprio tenant pode acionar.
 */
export interface ForgetPlan {
  allowed: boolean;
  reason?: string;
  targets: string[];
}

export function planCustomerForget(principal: Principal, customerTenantId: string): ForgetPlan {
  if (!canAccessResource(principal, customerTenantId)) {
    return { allowed: false, reason: 'cross_tenant', targets: [] };
  }
  if (!hasMinRole(principal, 'admin')) {
    return { allowed: false, reason: 'insufficient_role', targets: [] };
  }
  return {
    allowed: true,
    targets: [
      'customers', 'messages', 'conversations', 'invoices',
      'service_orders', 'zep_memory', 'qdrant_vectors', 'r2_media',
    ],
  };
}
