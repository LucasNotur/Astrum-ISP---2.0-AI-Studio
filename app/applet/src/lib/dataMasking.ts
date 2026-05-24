export interface User {
  id: string;
  role: string;
  hasMfaSetup: boolean;
  mfaVerifiedForSession: boolean;
  permissions: string[];
}

export interface SecurityDependencies {
  auditLog: (event: string, meta: any) => Promise<void>;
}

export class SecurityManager {
  constructor(private deps: SecurityDependencies) {}

  maskCPF(cpf: string): string {
    return cpf.replace(/^\d{3}\.\d{3}/, '***.***');
  }

  maskPhone(phone: string): string {
    return phone.replace(/-\d{4}$/, '-****');
  }

  maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    return `${local[0]}***@${domain}`;
  }

  async unmask(user: User, data: string, reason: string): Promise<string> {
    if (!user.permissions.includes('view_sensitive_data')) {
      throw new Error('PERMISSION_DENIED');
    }
    await this.deps.auditLog('DATA_ACCESS', { userId: user.id, data, reason });
    return data;
  }

  async login(user: User): Promise<{ redirect?: string, token?: string }> {
    if (user.role === 'admin' && !user.hasMfaSetup) {
      return { redirect: '/setup-mfa' };
    }
    return { token: 'sample-jwt-token' };
  }

  async accessProtectedRoute(user: User): Promise<{ status: number, error?: string }> {
    if (user.role === 'admin' && !user.mfaVerifiedForSession) {
      return { status: 403, error: 'MFA_REQUIRED' };
    }
    return { status: 200 };
  }
}
