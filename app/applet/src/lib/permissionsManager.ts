export type Role = 'admin' | 'support' | 'sales';
export type Resource = 'customers' | 'tickets' | 'audit_logs';
export type Action = 'create' | 'read' | 'update' | 'delete';

export interface User {
  id: string;
  tenant_id: string;
  role: Role;
  department: string;
}

export interface Ticket {
  id: string;
  department: string;
}

export interface PermissionServiceState {
  auditLogsDb: {
    log: (event: string, meta: any) => Promise<void>;
  };
  tenantDb: {
    getCustomPermissions: (tenantId: string, role: string) => Promise<Record<string, Record<string, boolean>> | null>;
  }
}

export class PermissionsManager {
  private failedAttempts: Map<string, number> = new Map();

  constructor(private state: PermissionServiceState) {}

  private defaultPermissions: Record<Role, Record<string, Record<string, boolean>>> = {
    admin: {
      customers: { create: true, read: true, update: true, delete: true },
      tickets: { create: true, read: true, update: true, delete: true },
      audit_logs: { read: true },
    },
    support: {
      customers: { create: true, read: true, update: true, delete: false },
      tickets: { create: true, read: true, update: true, delete: false },
      audit_logs: { read: false },
    },
    sales: {
      customers: { create: true, read: true, update: true, delete: false },
      tickets: { create: true, read: true, update: true, delete: false },
      audit_logs: { read: false },
    }
  }

  async checkPermission(user: User, resource: Resource, action: Action): Promise<boolean> {
    const customPerms = await this.state.tenantDb.getCustomPermissions(user.tenant_id, user.role);
    let hasAccess = false;

    if (customPerms && customPerms[resource] && customPerms[resource][action] !== undefined) {
      hasAccess = customPerms[resource][action];
    } else {
      hasAccess = this.defaultPermissions[user.role]?.[resource]?.[action] || false;
    }

    if (!hasAccess) {
      const attempts = (this.failedAttempts.get(user.id) || 0) + 1;
      this.failedAttempts.set(user.id, attempts);
      if (attempts === 5) {
        await this.state.auditLogsDb.log('AUTH_FAILURE', { userId: user.id });
      }
    }

    return hasAccess;
  }

  canViewTicket(user: User, ticket: Ticket): boolean {
    if (user.role === 'admin') return true;
    return user.department === ticket.department;
  }

  async authorizeRequest(user: User, resource: Resource, action: Action): Promise<{ status: number }> {
    const granted = await this.checkPermission(user, resource, action);
    if (!granted) {
      return { status: 403 };
    }
    return { status: 200 };
  }
}
