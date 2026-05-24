import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityManager, User, SecurityDependencies } from '../../../src/lib/dataMasking';

describe('Data Masking and MFA Tests', () => {
  let deps: import('vitest').Mocked<SecurityDependencies>;
  let security: SecurityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      auditLog: vi.fn(),
    };
    security = new SecurityManager(deps);
  });

  it('1. maskCPF("123.456.789-00") -> retorna "***.***.789-00" (string exata)', () => {
    expect(security.maskCPF('123.456.789-00')).toBe('***.***.789-00');
  });

  it('2. maskPhone("(11) 99999-1234") -> retorna "(11) 99999-****" (string exata)', () => {
    expect(security.maskPhone('(11) 99999-1234')).toBe('(11) 99999-****');
  });

  it('3. maskEmail("pedro@empresa.com") -> retorna "p***@empresa.com" (string exata)', () => {
    expect(security.maskEmail('pedro@empresa.com')).toBe('p***@empresa.com');
  });

  it('4. unmask sem permissão view_sensitive_data -> PERMISSION_DENIED', async () => {
    const user: User = { id: 'u1', role: 'support', hasMfaSetup: false, mfaVerifiedForSession: false, permissions: [] };
    await expect(security.unmask(user, 'secret_data', 'needed for support')).rejects.toThrow('PERMISSION_DENIED');
  });

  it('5. unmask com permissão -> registra DATA_ACCESS no audit_logs com motivo', async () => {
    const user: User = { id: 'u1', role: 'support', hasMfaSetup: false, mfaVerifiedForSession: false, permissions: ['view_sensitive_data'] };
    await security.unmask(user, 'secret_data', 'support investigation');
    
    expect(deps.auditLog).toHaveBeenCalledWith('DATA_ACCESS', {
      userId: 'u1',
      data: 'secret_data',
      reason: 'support investigation'
    });
  });

  it('6. MFA não configurado para role=admin -> login redireciona para configuração de MFA', async () => {
    const adminUser: User = { id: 'a1', role: 'admin', hasMfaSetup: false, mfaVerifiedForSession: false, permissions: [] };
    const response = await security.login(adminUser);
    
    expect(response.redirect).toBe('/setup-mfa');
  });

  it('7. Token sem MFA verificado para role=admin -> 403 MFA_REQUIRED em rotas protegidas', async () => {
    const adminUser: User = { id: 'a1', role: 'admin', hasMfaSetup: true, mfaVerifiedForSession: false, permissions: [] };
    const response = await security.accessProtectedRoute(adminUser);
    
    expect(response.status).toBe(403);
    expect(response.error).toBe('MFA_REQUIRED');
  });
});
