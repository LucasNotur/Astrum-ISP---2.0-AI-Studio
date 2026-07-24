import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../apps/api/src/infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/cache/redis.client', () => ({
  default: { get: vi.fn(), set: vi.fn() },
  connection: {},
}));
vi.mock('../../../../apps/api/src/infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../apps/api/src/infrastructure/queue/bullmq.client', () => ({
  setupDLQ: vi.fn(),
}));
vi.mock('../../../../apps/api/src/infrastructure/observability/sentry-worker.helper', () => ({
  addSentryToWorker: vi.fn(),
}));

import { processSiteScrapeJob, type SiteScrapeWorkerPorts } from './site-scrape.worker';

function makeJob(data: any = {}): any {
  return { data, id: 'test-job' };
}

function makePorts(
  tenants: any[],
  previousHash: string | null,
  htmlResponse: string,
): SiteScrapeWorkerPorts {
  const upserted: any[] = [];
  return {
    db: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          upsert: (row: any) => { upserted.push(row); return Promise.resolve({ error: null }); },
        };
        if (table === 'tenants') {
          chain.then = (cb: any) => Promise.resolve({ data: tenants }).then(cb);
          return chain;
        }
        chain.then = (cb: any) => Promise.resolve({ data: [], error: null }).then(cb);
        return chain;
      },
      _upserted: upserted,
    } as any,
    cache: {
      get: vi.fn().mockResolvedValue(previousHash),
      set: vi.fn().mockResolvedValue('OK'),
    },
    fetchFn: vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(htmlResponse),
    }) as any,
  };
}

describe('S81 — SiteScrape Worker', () => {
  it('scrapa, chunka e grava no knowledge_base quando conteúdo mudou', async () => {
    const html = '<html><body><p>Plano 100MB por R$79,90.</p></body></html>';
    const ports = makePorts(
      [{ id: 't1', website_url: 'https://isp.com', email: 'admin@isp.com' }],
      null,
      html,
    );
    const result = await processSiteScrapeJob(makeJob(), ports);
    expect(result.scraped).toBe(1);
    expect(result.changed).toBe(1);
    expect((ports.db as any)._upserted.length).toBeGreaterThan(0);
    expect((ports.db as any)._upserted[0].type).toBe('website');
  });

  it('não grava se hash não mudou', async () => {
    const html = '<html><body>Same content</body></html>';
    const crypto = await import('crypto');
    const content = 'Same content';
    const hash = crypto.createHash('md5').update(content).digest('hex');
    const ports = makePorts(
      [{ id: 't1', website_url: 'https://isp.com', email: 'a@b.com' }],
      hash,
      html,
    );
    const result = await processSiteScrapeJob(makeJob(), ports);
    expect(result.scraped).toBe(1);
    expect(result.changed).toBe(0);
  });

  it('pula tenant sem website_url', async () => {
    const ports = makePorts(
      [{ id: 't1', website_url: null, email: 'a@b.com' }],
      null,
      '',
    );
    const result = await processSiteScrapeJob(makeJob(), ports);
    expect(result.scraped).toBe(0);
  });

  it('continua se fetch falha para um tenant', async () => {
    const ports = makePorts(
      [{ id: 't1', website_url: 'https://down.com', email: 'a@b.com' }],
      null,
      '',
    );
    (ports.fetchFn as any).mockResolvedValue({ ok: false, status: 503 });
    const result = await processSiteScrapeJob(makeJob(), ports);
    expect(result.scraped).toBe(0);
    expect(result.changed).toBe(0);
  });
});
