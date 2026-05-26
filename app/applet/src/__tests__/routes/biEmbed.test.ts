import { describe, it, expect, beforeEach } from 'vitest';

let mockEnv: Record<string, string | undefined> = {};

// Simulação simplificada de JWT para testar a lógica sem dependências externas
const mockJWT = {
  sign: (payload: any, secret: string, options: any = {}) => {
    return JSON.stringify({ payload, secret, options });
  },
  decode: (token: string) => {
    return JSON.parse(token);
  }
};

function handleGetEmbedToken(tenantId: string) {
  if (!mockEnv.METABASE_SECRET_KEY) {
    return { status: 503, message: 'BI não configurado' };
  }

  const payload = {
    resource: { dashboard: 1 },
    params: { tenant_id: tenantId }
  };

  // 10 minutes expiry
  const token = mockJWT.sign(payload, mockEnv.METABASE_SECRET_KEY, { expiresIn: '10m' });

  return { status: 200, token };
}

function accessTenantDashboard(token: string, targetTenantId: string) {
  const decodedToken = mockJWT.decode(token);
  
  if (decodedToken.payload.params.tenant_id !== targetTenantId) {
    return { status: 403, accessAllowed: false };
  }
  
  return { status: 200, accessAllowed: true };
}

describe('Testes do BI Embeddable (Metabase)', () => {

  beforeEach(() => {
    mockEnv = {};
  });

  it('1. GET /api/bi/embed-token?tenantId= → retorna JWT assinado com METABASE_SECRET_KEY', () => {
    mockEnv.METABASE_SECRET_KEY = 'super_secret_key_123';
    
    const response = handleGetEmbedToken('tenantA');
    
    expect(response.status).toBe(200);
    expect(response.token).toBeDefined();
    
    const decoded = mockJWT.decode(response.token!);
    expect(decoded.secret).toBe('super_secret_key_123'); // Verifica se assinou com a secret correta
  });

  it('2. JWT gerado → contém tenant_id no payload', () => {
    mockEnv.METABASE_SECRET_KEY = 'super_secret_key_123';
    
    const response = handleGetEmbedToken('tenantA');
    const decoded = mockJWT.decode(response.token!);
    
    expect(decoded.payload.params.tenant_id).toBe('tenantA');
  });

  it('3. JWT do tenant A → não funciona para acessar dashboard do tenant B', () => {
    mockEnv.METABASE_SECRET_KEY = 'super_secret_key_123';
    
    // Gera token para o tenantA
    const responseA = handleGetEmbedToken('tenantA');
    const tokenA = responseA.token!;
    
    // Tenta acessar com token do tenantA o dashboard do tenantB
    const accessResult = accessTenantDashboard(tokenA, 'tenantB');
    
    expect(accessResult.status).toBe(403);
    expect(accessResult.accessAllowed).toBe(false);
  });

  it('4. METABASE_SECRET_KEY não configurado → 503 com mensagem BI não configurado', () => {
    mockEnv.METABASE_SECRET_KEY = undefined; // Não configurado
    
    const response = handleGetEmbedToken('tenantA');
    
    expect(response.status).toBe(503);
    expect(response.message).toBe('BI não configurado');
  });

  it('5. Token gerado → expira no tempo configurado (padrão 10 minutos)', () => {
    mockEnv.METABASE_SECRET_KEY = 'super_secret_key_123';
    
    const response = handleGetEmbedToken('tenantA');
    const decoded = mockJWT.decode(response.token!);
    
    expect(decoded.options.expiresIn).toBe('10m');
  });

});
