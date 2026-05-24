import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logSecurityEvent, auditMiddleware } from '../../lib/audit';
import { adminDb } from '../../lib/firebaseAdmin';

vi.mock('../../lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      add: vi.fn()
    }))
  }
}));

vi.mock('firebase-admin/firestore', () => {
  const Timestamp = { fromDate: vi.fn((date) => ({ _mockDate: date, toDate: () => date })) };
  const FieldValue = { serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP') };
  return { Timestamp, FieldValue };
});

describe('Audit Log Tests', () => {
  const mockAdd = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (adminDb.collection as any).mockReturnValue({ add: mockAdd });
  });

  it('1. logSecurityEvent(TENANT_MISMATCH) -> deve salvar em audit_logs com event_type, tenant_id e timestamp obrigatórios', async () => {
    await logSecurityEvent('TENANT_MISMATCH', { tenant_id: 'tenant-123' });
    
    expect(adminDb.collection).toHaveBeenCalledWith('audit_logs');
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const log = mockAdd.mock.calls[0][0];
    
    expect(log.event_type).toBe('TENANT_MISMATCH');
    expect(log.tenant_id).toBe('tenant-123');
    expect(log.timestamp).toBeDefined();
  });

  it('2. logSecurityEvent(DATA_ACCESS) -> deve incluir user_id e resource_id', async () => {
    await logSecurityEvent('DATA_ACCESS', { 
      tenant_id: 'tenant-123', 
      user_id: 'user-456',
      resource_id: 'doc-789'
    });
    
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const log = mockAdd.mock.calls[0][0];
    
    expect(log.user_id).toBe('user-456');
    expect(log.resource_id).toBe('doc-789');
  });

  it('3. logSecurityEvent(DATA_MUTATION) -> deve incluir old_value e new_value', async () => {
    await logSecurityEvent('DATA_MUTATION', { 
      tenant_id: 'tenant-123',
      old_value: { name: 'João' },
      new_value: { name: 'João Silva' }
    });
    
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const log = mockAdd.mock.calls[0][0];
    
    expect(log.old_value).toEqual({ name: 'João' });
    expect(log.new_value).toEqual({ name: 'João Silva' });
  });

  it('4. logSecurityEvent(LGPD_FORGET_ME) -> deve incluir hash SHA256 dos dados apagados', async () => {
    const deletedData = { email: 'user@example.com', phone: '123456' };
    await logSecurityEvent('LGPD_FORGET_ME', { 
      tenant_id: 'tenant-123',
      deleted_data: deletedData
    });
    
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const log = mockAdd.mock.calls[0][0];
    console.log('LOG OBJECT FOR TEST 4:', log);
    
    expect(log).toHaveProperty('hash');
    expect(log.hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash regex
  });

  it('5. Log salvo -> campo expires_at deve ser 365 dias no futuro', async () => {
    await logSecurityEvent('TENANT_MISMATCH', { tenant_id: 'tenant-123' });
    
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const log = mockAdd.mock.calls[0][0];
    
    expect(log.expires_at).toBeDefined();
    
    const expiresAtDate = typeof log.expires_at.toDate === 'function' ? log.expires_at.toDate() : new Date(log.expires_at); 
    const now = new Date();
    const diffDays = Math.round((expiresAtDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    expect(diffDays).toBe(365);
  });

  it('6. logSecurityEvent sem tenant_id -> deve lançar erro de validação, não salvar log incompleto', async () => {
    await expect(logSecurityEvent('TENANT_MISMATCH', {})).rejects.toThrow('ValidationError');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('7. Middleware auditMiddleware em rota PUT /api/customers/:id -> deve registrar DATA_MUTATION automaticamente', async () => {
    const req = {
      method: 'PUT',
      path: '/api/customers/123',
      user: { tenantId: 'tenant-123', uid: 'user-456' },
      ip: '127.0.0.1',
      params: { id: 'cust-789' },
      body: { name: 'Updated Name', tenant_id: 'tenant-123' },
      headers: {}
    };
    
    const res = {
      statusCode: 200,
      send: vi.fn(),
      connection: {}
    };
    const next = vi.fn();
    
    auditMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    
    // call the wrapped res.send
    res.send({ success: true });
    
    // wait for async logSecurityEvent to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    console.log('MOCK ADD CALLS IN TEST 7:', mockAdd.mock.calls);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const log = mockAdd.mock.calls[0][0];
    
    expect(log.event_type).toBe('DATA_MUTATION');
    expect(log.tenant_id).toBe('tenant-123');
    expect(log.new_value).toEqual(req.body);
  });
});
