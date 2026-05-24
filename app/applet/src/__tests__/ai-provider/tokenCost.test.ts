import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateCost, accumulateTokenCost, syncTokenCosts, PROVIDER_PRICES, EmailService, FirestoreDB } from '../../../src/ai-provider/tokenCost';
import { redisClient } from '../../../src/lib/redis';

vi.mock('../../../src/lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
    incr: vi.fn(),
    incrbyfloat: vi.fn()
  }
}));

describe('Token Cost Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. OpenAI com prompt_tokens=1000, completion_tokens=500 -> custo calculado corretamente em USD', () => {
    const cost = calculateCost('openai', 1000, 500);
    // (1000 / 1000000) * 2.50 + (500 / 1000000) * 10.00
    // 0.0025 + 0.0050 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 5);
  });

  it('2. Gemini Flash -> usa preço correto ($0.075/1M input)', () => {
    expect(PROVIDER_PRICES['gemini-flash'].input).toBe(0.075);
    const cost = calculateCost('gemini-flash', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.075, 5);
  });

  it('3. Anthropic Haiku -> usa preço correto ($0.25/1M input)', () => {
    expect(PROVIDER_PRICES['anthropic-haiku'].input).toBe(0.25);
    const cost = calculateCost('anthropic-haiku', 1_000_000, 0);
    expect(cost).toBeCloseTo(0.25, 5);
  });

  it('4. Redis INCRBYFLOAT -> custo acumulado corretamente por tenant por mês', async () => {
    const emailService: import('vitest').Mocked<EmailService> = {
      sendEmail: vi.fn()
    };
    const month = new Date().toISOString().slice(0, 7);
    
    vi.mocked(redisClient.incrbyfloat).mockResolvedValue(1.50);

    await accumulateTokenCost('tenant-1', 1.50, emailService, 'admin@admin.com');

    expect(redisClient.incrbyfloat).toHaveBeenCalledWith(`token_cost:tenant-1:${month}`, 1.50);
  });

  it('5. Custo acima do threshold do plano PRO -> dispara email de alerta', async () => {
    const emailService: import('vitest').Mocked<EmailService> = {
      sendEmail: vi.fn()
    };
    
    // totalCost goes from 9.00 + 1.50 = 10.50
    vi.mocked(redisClient.incrbyfloat).mockResolvedValue(10.50);

    await accumulateTokenCost('tenant-1', 1.50, emailService, 'admin@admin.com');

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'admin@admin.com', 
      'Cost Alert', 
      expect.stringContaining('PRO plan threshold')
    );
  });

  it('6. Job sync_token_costs -> lê Redis e salva no Firestore com cost_usd e cost_brl', async () => {
    vi.mocked(redisClient.get).mockResolvedValue('10.0'); // 10 USD

    const docMock = { set: vi.fn() };
    const collectionMock = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(docMock) });
    const db: import('vitest').Mocked<FirestoreDB> = { collection: collectionMock };
    
    const month = new Date().toISOString().slice(0, 7);
    const exchangeRate = 5.0; // 1 USD = 5 BRL

    await syncTokenCosts(['tenant-1'], db, exchangeRate);

    expect(redisClient.get).toHaveBeenCalledWith(`token_cost:tenant-1:${month}`);
    expect(docMock.set).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      month,
      cost_usd: 10.0,
      cost_brl: 50.0
    });
  });

  it('7. Nenhum provider retorna NaN, Infinity ou undefined no cálculo de custo', () => {
    expect(calculateCost('unknown-provider', 1000, 500)).toBe(0);
    expect(calculateCost('openai', NaN, 500)).toBe(0);
    expect(calculateCost('openai', 1000, Infinity)).toBe(0);
  });
});
