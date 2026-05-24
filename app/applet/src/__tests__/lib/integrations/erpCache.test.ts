import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { withCache, TTL, cleanNullUndefined } from '../../../lib/integrations/erpCache';
import { redisClient } from '../../../lib/redis';

vi.mock('../../../lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
  }
}));

const mockCache = new Map<string, string>();

describe('ERP Cache Tests', () => {

  beforeEach(() => {
    mockCache.clear();
    vi.mocked(redisClient.get).mockImplementation(async (key: string) => mockCache.get(key) || null);
    vi.mocked(redisClient.setex).mockImplementation(async (key: string, ttl: number, val: string) => {
      mockCache.set(key, val);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1. Primeira chamada -> chama fetchFn e salva no Redis', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'hello' });
    const result = await withCache('test-key', 60, fetchFn);
    
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(redisClient.setex).toHaveBeenCalledWith('test-key', 60, JSON.stringify({ data: 'hello' }));
    expect(result).toEqual({ data: 'hello' });
  });

  it('2. Segunda chamada (mesmo key, cache válido) -> NÃO chama fetchFn (mock calls = 1)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'hello' });
    
    await withCache('test-key-2', 60, fetchFn);
    const result2 = await withCache('test-key-2', 60, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result2).toEqual({ data: 'hello' });
  });

  it('3. Cache de status de conexão -> TTL = 60 segundos', () => {
    expect(TTL.CONNECTION_STATUS).toBe(60);
  });

  it('4. Cache de faturas -> TTL = 120 segundos', () => {
    expect(TTL.INVOICES).toBe(120);
  });

  it('5. Cache de dados cadastrais -> TTL = 300 segundos', () => {
    expect(TTL.CUSTOMER_DATA).toBe(300);
  });

  it('6. Cache expirado -> chama fetchFn novamente', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'hello' });
    await withCache('test-key-exp', 60, fetchFn); 
    
    mockCache.delete('test-key-exp');
    
    await withCache('test-key-exp', 60, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('7. GET /api/erp/billing-status -> retorna objeto completo sem campos null ou undefined', async () => {
    const app = express();
    app.get('/api/erp/billing-status', async (req, res) => {
      const fetchApi = async () => ({
        customer_name: 'John Doe',
        has_overdue: false,
        pix_code: null,
        boleto_url: undefined,
        status: 'OK'
      });

      const rawData = await withCache('billing-123', TTL.CUSTOMER_DATA, fetchApi);
      res.json(cleanNullUndefined(rawData));
    });

    const response = await request(app).get('/api/erp/billing-status');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      customer_name: 'John Doe',
      has_overdue: false,
      status: 'OK'
    });
    
    expect(response.body).not.toHaveProperty('pix_code');
    expect(response.body).not.toHaveProperty('boleto_url');
  });
});
