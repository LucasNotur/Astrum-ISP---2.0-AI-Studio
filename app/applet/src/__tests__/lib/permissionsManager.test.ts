import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionsManager, User, PermissionServiceState } from '../../../src/lib/permissionsManager';

describe('Permissions Manager Tests', () => {
  let state: import('vitest').Mocked<PermissionServiceState>;
  let manager: PermissionsManager;

  const adminUser: User = { id: 'u1', tenant_id: 't1', role: 'admin', department: 'IT' };
  const supportUser: User = { id: 'u2', tenant_id: 't1', role: 'support', department: 'Suporte' };
  const salesUser: User = { id: 'u3', tenant_id: 't1', role: 'sales', department: 'Vendas' };

  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      auditLogsDb: { log: vi.fn() },
      tenantDb: { getCustomPermissions: vi.fn().mockResolvedValue(null) },
    };
    manager = new PermissionsManager(state);
  });

  it('1. checkPermission(userId, customers, delete) com role=support -> false', async () => {
    const canDelete = await manager.checkPermission(supportUser, 'customers', 'delete');
    expect(canDelete).toBe(false);
  });

  it('2. checkPermission(userId, customers, delete) com role=admin -> true', async () => {
    const canDelete = await manager.checkPermission(adminUser, 'customers', 'delete');
    expect(canDelete).toBe(true);
  });

  it('3. ABAC: operador do depto Vendas -> NÃO vê tickets do depto Suporte', () => {
    const ticket = { id: 'tk1', department: 'Suporte' };
    expect(manager.canViewTicket(salesUser, ticket)).toBe(false);
  });

  it('4. DELETE /api/customers/:id sem permissão delete_customers -> 403', async () => {
    // support User doesn't have delete on customers
    const response = await manager.authorizeRequest(supportUser, 'customers', 'delete');
    expect(response.status).toBe(403);
  });

  it('5. GET /api/audit-logs sem permissão view_audit_logs -> 403', async () => {
    // support User doesn't have read on audit_logs
    const response = await manager.authorizeRequest(supportUser, 'audit_logs', 'read');
    expect(response.status).toBe(403);
  });

  it('6. Permissões customizadas do tenant -> sobrescrevem permissões padrão do role', async () => {
    state.tenantDb.getCustomPermissions.mockResolvedValue({
      customers: { delete: true } // allow support role to delete customers for this specific tenant
    });
    const canDelete = await manager.checkPermission(supportUser, 'customers', 'delete');
    expect(canDelete).toBe(true);
  });

  it('7. 5 tentativas com permissão negada -> registra AUTH_FAILURE no audit_logs', async () => {
    for (let i = 0; i < 5; i++) {
        await manager.checkPermission(supportUser, 'customers', 'delete');
    }
    
    expect(state.auditLogsDb.log).toHaveBeenCalledTimes(1);
    expect(state.auditLogsDb.log).toHaveBeenCalledWith('AUTH_FAILURE', { userId: supportUser.id });
  });
});
