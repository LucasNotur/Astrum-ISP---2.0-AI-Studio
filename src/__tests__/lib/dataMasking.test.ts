import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maskCPF, maskPhone, maskEmail, unmask } from '../../src/lib/dataMasking';
import * as auditModule from '../../src/lib/audit';
import * as permissionMiddleware from '../../src/middleware/permissionMiddleware';

vi.mock('../../src/lib/audit');
vi.mock('../../src/middleware/permissionMiddleware');

describe('dataMasking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('maskCPF', () => {
    it('should mask a valid CPF', () => {
      expect(maskCPF('123.456.789-00')).toBe('***.***.789-**');
    });

    it('should handle small or invalid strings', () => {
      expect(maskCPF('123')).toBe('***.***.XXX-**');
      expect(maskCPF('')).toBe('');
    });
  });

  describe('maskPhone', () => {
    it('should mask a valid phone', () => {
      expect(maskPhone('11987654321')).toBe('(**) *****-4321');
    });

    it('should mask other phone formats', () => {
      expect(maskPhone('1234')).toBe('(XX) XXXXX-****');
    });
  });

  describe('maskEmail', () => {
    it('should mask standard email', () => {
      expect(maskEmail('email@example.com')).toBe('e***@example.com');
    });
  });

  describe('unmask', () => {
    it('should unmask if permitted via sensitive_data view', async () => {
      vi.mocked(permissionMiddleware.checkPermissionAdmin).mockImplementation(async (userId, resource) => {
        if (resource === 'sensitive_data') return true;
        return false;
      });

      const value = await unmask('secret-value', 'user-1', 'reason', 'tenant-1');
      expect(value).toBe('secret-value');
      expect(auditModule.logAuditEvent).toHaveBeenCalled();
    });

    it('should throw an error if no permission exists', async () => {
      vi.mocked(permissionMiddleware.checkPermissionAdmin).mockResolvedValue(false);

      await expect(unmask('secret-value', 'user-1', 'reason', 'tenant-1')).rejects.toThrow(/Acesso Negado/);
      expect(auditModule.logAuditEvent).toHaveBeenCalled();
    });

    it('should throw an error if userId or tenantId are missing', async () => {
      await expect(unmask('secret', '', 'reason', 'tenant-1')).rejects.toThrow(/required for unmasking/);
    });
  });
});
