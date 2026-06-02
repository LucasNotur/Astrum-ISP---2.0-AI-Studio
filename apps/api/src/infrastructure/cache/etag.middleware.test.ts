import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import etagPlugin from './etag.middleware';

describe('ETag Middleware', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify();
    await app.register(etagPlugin);
    app.get('/api/documents/manual.pdf', async () => ({ content: 'manual' }));
    app.get('/api/tickets', async () => []);
    await app.ready();
  });

  afterAll(() => app.close());

  it('adiciona header ETag na primeira request', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/documents/manual.pdf' });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBeDefined();
  });

  it('retorna 304 quando ETag não mudou', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/documents/manual.pdf' });
    const etag = first.headers.etag as string;

    const second = await app.inject({
      method: 'GET', url: '/api/documents/manual.pdf',
      headers: { 'if-none-match': etag }
    });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
  });

  it('não aplica ETag em rotas não-documentos', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tickets' });
    expect(res.headers.etag).toBeUndefined();
  });
});
