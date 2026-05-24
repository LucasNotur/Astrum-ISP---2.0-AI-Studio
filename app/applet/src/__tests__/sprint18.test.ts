import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sprint18, IXCAdapter, SGPAdapter, RBXAdapter, Dependencies } from '../lib/sprint18';

describe('Sprint 18 Tests', () => {
  let deps: import('vitest').Mocked<Dependencies>;
  let sprint: Sprint18;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      db: {
        getTenantByApiKey: vi.fn(),
        getTicketsByTenant: vi.fn(),
        saveDailyReport: vi.fn(),
        getScraperLastMd5: vi.fn(),
        setScraperLastMd5: vi.fn(),
      },
      redis: {
        incrementApiUsage: vi.fn(),
      },
      pdf: {
        generate: vi.fn(),
      },
      email: {
        send: vi.fn(),
      },
      ai: {
        callAnthropic: vi.fn(),
      }
    };
    sprint = new Sprint18(deps);
  });

  it('1. GET /api/v1/tickets sem X-API-Key -> 401', async () => {
    const res = await sprint.getTickets(undefined);
    expect(res.status).toBe(401);
  });

  it('2. API Key do tenant A -> retorna APENAS tickets do tenant A (nunca do B)', async () => {
    deps.db.getTenantByApiKey.mockResolvedValue('tenantA');
    deps.redis.incrementApiUsage.mockResolvedValue(1);
    deps.db.getTicketsByTenant.mockResolvedValue([{ id: 't1', tenant_id: 'tenantA' }]);

    const res = await sprint.getTickets('keyA');
    expect(res.status).toBe(200);
    expect(res.data).toEqual([{ id: 't1', tenant_id: 'tenantA' }]);
    expect(deps.db.getTicketsByTenant).toHaveBeenCalledWith('tenantA');
  });

  it('3. 1001ª request na hora com mesma API Key -> 429', async () => {
    deps.db.getTenantByApiKey.mockResolvedValue('tenantA');
    deps.redis.incrementApiUsage.mockResolvedValue(1001);

    const res = await sprint.getTickets('keyA');
    expect(res.status).toBe(429);
    expect(deps.db.getTicketsByTenant).not.toHaveBeenCalled();
  });

  it('4. Job daily_report com tenant sem logo_url -> gera PDF com placeholder, não crasha', async () => {
    deps.pdf.generate.mockResolvedValue('http://pdf.url');
    await sprint.runDailyReport('t1', '2026-05-24', undefined);

    expect(deps.pdf.generate).toHaveBeenCalledWith('t1', {}, 'https://placeholder.com/logo.png');
    expect(deps.db.saveDailyReport).toHaveBeenCalledWith('t1', '2026-05-24', 'http://pdf.url');
  });

  it('5. Job daily_report rodando 2x no mesmo dia -> sobrescreve, não duplica', async () => {
    // Since saveDailyReport simulates an upsert
    deps.pdf.generate.mockResolvedValue('http://pdf.url.v2');
    await sprint.runDailyReport('t1', '2026-05-24', 'logo.png');
    await sprint.runDailyReport('t1', '2026-05-24', 'logo.png');

    expect(deps.db.saveDailyReport).toHaveBeenCalledTimes(2);
    expect(deps.db.saveDailyReport).toHaveBeenLastCalledWith('t1', '2026-05-24', 'http://pdf.url.v2');
  });

  it('6. SGPAdapter.getBillingStatus -> schema IDÊNTICO ao IXCAdapter', async () => {
    const ixc = new IXCAdapter();
    const sgp = new SGPAdapter();

    const ixcRes = await ixc.getBillingStatus('c1');
    const sgpRes = await sgp.getBillingStatus('c1');

    expect(Object.keys(ixcRes).sort()).toEqual(Object.keys(sgpRes).sort());
    // Checking exact properties
    expect(sgpRes).toHaveProperty('status');
    expect(sgpRes).toHaveProperty('amount');
    expect(sgpRes).toHaveProperty('due_date');
  });

  it('7. RBXAdapter.getBillingStatus -> schema IDÊNTICO ao IXCAdapter', async () => {
    const ixc = new IXCAdapter();
    const rbx = new RBXAdapter();

    const ixcRes = await ixc.getBillingStatus('c1');
    const rbxRes = await rbx.getBillingStatus('c1');

    expect(Object.keys(ixcRes).sort()).toEqual(Object.keys(rbxRes).sort());
    expect(rbxRes).toHaveProperty('status');
    expect(rbxRes).toHaveProperty('amount');
    expect(rbxRes).toHaveProperty('due_date');
  });

  it('8. Marketplace: integração Offline -> não bloqueia carregamento das outras', async () => {
    const intA = { id: 'A', load: vi.fn().mockResolvedValue(undefined) };
    const intOffline = { id: 'Offline', load: vi.fn().mockRejectedValue(new Error('Offline')) };
    const intC = { id: 'C', load: vi.fn().mockResolvedValue(undefined) };

    const loaded = await sprint.loadMarketplaceIntegrations([intA, intOffline, intC]);
    
    expect(loaded).toContain('A');
    expect(loaded).toContain('C');
    expect(loaded).not.toContain('Offline');
  });

  it('9. Scraper: MD5 igual ao anterior -> NÃO reindexar nem enviar email', async () => {
    deps.db.getScraperLastMd5.mockResolvedValue('old_hash');
    
    await sprint.runScraper('http://site.com', 'old_hash');
    
    expect(deps.db.setScraperLastMd5).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('10. Temperatura Anthropic com 0.2 configurado -> usa 0.7 fixo sem lançar erro', async () => {
    await sprint.callAnthropicModel('Hello', 0.2);
    
    expect(deps.ai.callAnthropic).toHaveBeenCalledWith('Hello', 0.7);
  });
});
