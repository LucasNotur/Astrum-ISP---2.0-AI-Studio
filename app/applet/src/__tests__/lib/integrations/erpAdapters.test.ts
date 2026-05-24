import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  VoalleAdapter, 
  RadiusNetAdapter, 
  HubSoftAdapter, 
  IXCAdapter, 
  getERPAdapter,
  ERPError
} from '../../../lib/integrations/erpAdapters';
import { redisClient } from '../../../lib/redis';

vi.mock('../../../lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
  }
}));

describe('ERP Adapters Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockResponse = (status: number, json: any) => ({
    status,
    json: async () => json
  });

  it('1. VoalleAdapter.authenticate() -> obtém token OAuth2 e cacheia no Redis por 1 hora', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { access_token: 'token_123' }));
    vi.mocked(redisClient.get).mockResolvedValue(null);
    
    const adapter = new VoalleAdapter('t1', 'http://api', fetchFn);
    const token = await adapter.authenticate();
    
    expect(token).toBe('token_123');
    expect(redisClient.setex).toHaveBeenCalledWith('voalle_token_t1', 3600, 'token_123');
  });

  it('2. VoalleAdapter com token expirado -> renova automaticamente sem falha', async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce('expired_token').mockResolvedValue(null);
    
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(mockResponse(401, {}))
      .mockResolvedValueOnce(mockResponse(200, { access_token: 'new_token' }))
      .mockResolvedValueOnce(mockResponse(200, { name: 'John Doe', overdue: false, state: 'OK' }));
    
    const adapter = new VoalleAdapter('t1', 'http://api', fetchFn);
    const result = await adapter.getBillingStatus('123');
    
    expect(result.customer_name).toBe('John Doe');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(redisClient.setex).toHaveBeenCalledWith('voalle_token_t1', 3600, 'new_token');
  });

  it('3. RadiusNetAdapter.getConnectionStatus -> retorna { connected: boolean, latency_ms: number }', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { is_connected: true, ping: 45 }));
    const adapter = new RadiusNetAdapter('http://api', fetchFn);
    
    const result = await adapter.getConnectionStatus('123');
    
    expect(result).toEqual({
      connected: true,
      latency_ms: 45
    });
  });

  it('4. HubSoftAdapter.getBillingStatus -> retorna schema IDÊNTICO ao IXCAdapter', async () => {
    const fetchIxc = vi.fn().mockResolvedValue(mockResponse(200, { cliente: 'Jane', inadimplente: false, situacao: 'Ativo' }));
    const ixcAdapter = new IXCAdapter('http://ixc', fetchIxc);
    const ixcSchema = await ixcAdapter.getBillingStatus('1');

    const fetchHubSoft = vi.fn().mockResolvedValue(mockResponse(200, { customerName: 'Jane', hasOverdueInvoices: false, billingStatus: 'Ativo' }));
    const hubSoftAdapter = new HubSoftAdapter('http://hubsoft', fetchHubSoft);
    const hubSoftSchema = await hubSoftAdapter.getBillingStatus('1');

    expect(Object.keys(hubSoftSchema)).toEqual(Object.keys(ixcSchema));
  });

  it('5. VoalleAdapter.getBillingStatus -> retorna schema IDÊNTICO ao IXCAdapter', async () => {
    const fetchIxc = vi.fn().mockResolvedValue(mockResponse(200, { cliente: 'Jane', inadimplente: false, situacao: 'Ativo' }));
    const ixcAdapter = new IXCAdapter('http://ixc', fetchIxc);
    const ixcSchema = await ixcAdapter.getBillingStatus('1');

    vi.mocked(redisClient.get).mockResolvedValue('token');
    const fetchVoalle = vi.fn().mockResolvedValue(mockResponse(200, { name: 'Jane', overdue: false, state: 'Ativo' }));
    const voalleAdapter = new VoalleAdapter('t1', 'http://voalle', fetchVoalle);
    const voalleSchema = await voalleAdapter.getBillingStatus('1');

    expect(Object.keys(voalleSchema)).toEqual(Object.keys(ixcSchema));
  });

  it('6. Qualquer adapter com API retornando 503 -> lança ERP_UNAVAILABLE, nunca expõe erro interno', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(503, { internal_error: 'DB_DOWN' }));
    
    const voalle = new VoalleAdapter('t1', 'http://api', fetchFn);
    await expect(voalle.authenticate()).rejects.toThrow(ERPError);
    await expect(voalle.authenticate()).rejects.toThrow('Serviço indisponível');
    
    const radius = new RadiusNetAdapter('http://api', fetchFn);
    await expect(radius.getConnectionStatus('123')).rejects.toThrow(ERPError);

    const hub = new HubSoftAdapter('http://api', fetchFn);
    await expect(hub.getBillingStatus('123')).rejects.toThrow(ERPError);
  });

  it('7. getERPAdapter com erp_type=voalle -> instância de VoalleAdapter', () => {
    const adapter = getERPAdapter('voalle');
    expect(adapter).toBeInstanceOf(VoalleAdapter);
  });

  it('8. getERPAdapter com erp_type=radiusnet -> instância de RadiusNetAdapter', () => {
    const adapter = getERPAdapter('radiusnet');
    expect(adapter).toBeInstanceOf(RadiusNetAdapter);
  });
});
