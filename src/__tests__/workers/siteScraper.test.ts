import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processSiteScrapeJob } from '../../workers/siteScrapeWorker';
import redis from '../../lib/redis';
import { adminDb as db } from '../../lib/firebaseAdmin';

// Mock dependências
vi.mock('../../lib/redis', () => {
  const store: Record<string, string> = {};
  return {
    default: {
      get: vi.fn(async (key) => store[key] || null),
      set: vi.fn(async (key, val) => { store[key] = val; }),
      options: {},
      _store: store
    }
  };
});

// Helper for mocking db
const { mockBatchCommit, mockBatchSet, mockBatch, mockGetDocs, mockDb, mockSendMail } = vi.hoisted(() => {
  const mBatchCommit = vi.fn();
  const mBatchSet = vi.fn();
  const mBatch = { set: mBatchSet, commit: mBatchCommit };
  const mGetDocs = vi.fn();
  const mDb = {
    collection: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: mGetDocs,
    doc: vi.fn().mockReturnThis(),
    batch: vi.fn(() => mBatch)
  };
  const mSendMail = vi.fn();
  return { mockBatchCommit: mBatchCommit, mockBatchSet: mBatchSet, mockBatch: mBatch, mockGetDocs: mGetDocs, mockDb: mDb, mockSendMail: mSendMail };
});

vi.mock('../../lib/firebaseAdmin', () => ({
  adminDb: mockDb
}));

// Mock Nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail
    }))
  }
}));

// Mock Globals
const originalFetch = global.fetch;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('Site Scraper Worker', () => {
  let mockConsoleWarn: any;
  let mockConsoleLog: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (redis as any)._store = {};
    
    mockConsoleWarn = vi.fn();
    mockConsoleLog = vi.fn();
    console.warn = mockConsoleWarn;
    console.log = mockConsoleLog;
    
    
    // Set up default tenants
    
    
    // Email settings mock
    
mockGetDocs.mockImplementation(async function(this: any) {
      return {
        exists: true,
        data: () => ({
          active: true,
          website_url: 'https://example.com',
          email: 'admin@example.com',
          host: 'smtp.mailtrap.io',
          port: 587,
          user: 'testuser',
          pass: 'testpass'
        }),
        docs: [
          {
            id: 'tenant123',
            data: () => ({
              active: true,
              website_url: 'https://example.com',
              email: 'admin@example.com',
              domain: 'example.com'
            })
          }
        ]
      };
    });

  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  it('1. Conteúdo novo → MD5 diferente do anterior → reindexação acionada e 6. Artigos criados → tenant_id correto em todos os chunks', async () => {
    // Generate some large content
    let largeContent = '';
    for (let i = 0; i < 250; i++) {
        largeContent += 'Esta é uma frase de teste para encher o chunk. ';
    } // about 1100 characters

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `<html><body><div>${largeContent}</div></body></html>`,
      status: 200
    });

    await processSiteScrapeJob({ name: 'scrape_test' });

    // Expect redis.set to have been called inside processSiteScrapeJob
    expect(redis.set).toHaveBeenCalledWith('site_hash:tenant123', expect.any(String));

    // Verify batch operations ran to create articles
    expect(mockBatchSet).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();

    // Verify tenant_id in the chunk data
    const lastCallArgs = mockBatchSet.mock.calls[0];
    expect(lastCallArgs[1].tenant_id).toBe('tenant123'); // Ensure tenant_id is correct in chunk
    expect(lastCallArgs[1].content.length).toBeGreaterThan(0); // Content is set
    expect(lastCallArgs[1].type).toBe('website');
  });

  it('2. Sem mudanças → MD5 igual → NÃO reindexar e NÃO enviar email', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body><div>Mesmo Conteudo</div></body></html>',
      status: 200
    });

    // First run to set hash
    await processSiteScrapeJob({ name: 'scrape_test' });
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Second run
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body><div>Mesmo Conteudo</div></body></html>',
      status: 200
    });
    
    await processSiteScrapeJob({ name: 'scrape_test' });
    
    expect(redis.set).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No changes'));
  });

  it('3. URL inacessível (404) → finaliza sem erro, não reindexar, logar aviso', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    await processSiteScrapeJob({ name: 'scrape_test' });

    expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch https://example.com'));
    expect(redis.set).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('4. Conteúdo extraído → scripts e estilos removidos corretamente pelo cheerio', async () => {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `
            <html>
                <head>
                    <style>.hide { display: none; }</style>
                    <script>console.log("hello");</script>
                </head>
                <body>
                    <p>Conteudo principal</p>
                    <script>alert("script inline");</script>
                </body>
            </html>
        `,
        status: 200
      });

      await processSiteScrapeJob({ name: 'scrape_test' });

      expect(mockBatchSet).toHaveBeenCalled();
      const contentSaved = mockBatchSet.mock.calls[0][1].content;
      
      expect(contentSaved).toContain('Conteudo principal');
      expect(contentSaved).not.toContain('.hide { display: none; }');
      expect(contentSaved).not.toContain('console.log("hello");');
      expect(contentSaved).not.toContain('alert("script inline");');
  });

  it('5. Email de confirmação → contém URL do site e número de chunks indexados', async () => {
     let largeContent = '';
     for (let i = 0; i < 500; i++) {
        largeContent += 'A B C D E F G H I. ';
     } // about 9500 chars

     global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<html><body>${largeContent}</body></html>`,
        status: 200
     });

     await processSiteScrapeJob({ name: 'scrape_test' });

     expect(mockSendMail).toHaveBeenCalled();
     const mailArgs = mockSendMail.mock.calls[0][0];
     expect(mailArgs.subject).toBe('Alerta Astrum: Website Atualizado');
     expect(mailArgs.text).toContain('https://example.com');
     expect(mailArgs.text).toMatch(/Número de chunks indexados: \d+/);
  });
});
