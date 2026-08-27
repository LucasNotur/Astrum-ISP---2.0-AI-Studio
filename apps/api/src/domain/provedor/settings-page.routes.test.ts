import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { settingsPageRoutes } from './settings-page.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFromSequence(terminals: Terminal[]) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: null, error: null }));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(settingsPageRoutes);
  await app.ready();
  return app;
}

describe('settings-page.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/settings/modules', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/modules' });
      expect(res.statusCode).toBe(401);
    });

    it('devolve enabled_modules do tenant, filtrado por tenant_id', async () => {
      mockFromSequence([{ data: { enabled_modules: { billing: true, map: false } }, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/modules' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ enabled_modules: { billing: true, map: false } });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });

    it('não vaza dado de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFromSequence([{ data: { enabled_modules: {} }, error: null }]);
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'GET', url: '/api/v2/settings/modules' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-2');
    });

    it('sem linha no banco -> devolve objeto vazio', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/modules' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ enabled_modules: {} });
    });
  });

  describe('PUT /api/v2/settings/modules', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/modules', payload: { modules: {} } });
      expect(res.statusCode).toBe(401);
    });

    it('sem body "modules" -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/modules', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('salva os toggles filtrado por tenant_id do JWT (nunca do body)', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/settings/modules',
        payload: { modules: { billing: false, map: true }, tenantId: 'outro-tenant' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ enabled_modules: { billing: false, map: true } });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET /api/v2/settings/escalation-rules', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/escalation-rules' });
      expect(res.statusCode).toBe(401);
    });

    it('devolve as regras do tenant, filtrado por tenant_id', async () => {
      const rules = [{ id: 'r1', condition_type: 'sentiment', condition_value: 'ANGRY', action: 'escalate_to_human', active: true }];
      mockFromSequence([{ data: { escalation_rules: rules }, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/escalation-rules' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ escalation_rules: rules });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });

    it('sem linha/valor não-array no banco -> devolve lista vazia', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/escalation-rules' });

      expect(res.json()).toEqual({ escalation_rules: [] });
    });
  });

  describe('PUT /api/v2/settings/escalation-rules', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/escalation-rules', payload: { escalation_rules: [] } });
      expect(res.statusCode).toBe(401);
    });

    it('sem body array -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/escalation-rules', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('salva a lista de regras filtrado por tenant_id do JWT', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      const rules = [{ id: 'r1', condition_type: 'keyword', condition_value: 'cancelar', action: 'send_alert', active: true }];

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/settings/escalation-rules',
        payload: { escalation_rules: rules },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ escalation_rules: rules });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET /api/v2/settings/company', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/company' });
      expect(res.statusCode).toBe(401);
    });

    it('devolve o perfil da empresa mapeado pra camelCase, filtrado por tenant_id', async () => {
      mockFromSequence([{
        data: {
          name: 'Fibra Norte', logo_url: 'https://x/logo.png', support_email: 'sac@fibranorte.com.br',
          support_phone: '(11) 4000-0000', working_hours: '08:00 - 20:00', timezone: 'America/Sao_Paulo',
        },
        error: null,
      }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/company' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        name: 'Fibra Norte', logoUrl: 'https://x/logo.png', supportEmail: 'sac@fibranorte.com.br',
        supportPhone: '(11) 4000-0000', workingHours: '08:00 - 20:00', timezone: 'America/Sao_Paulo',
      });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });

    it('sem linha no banco -> devolve defaults vazios', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/company' });
      expect(res.json()).toEqual({
        name: '', logoUrl: '', supportEmail: '', supportPhone: '', workingHours: '', timezone: 'America/Sao_Paulo',
      });
    });
  });

  describe('PUT /api/v2/settings/company', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/company', payload: { name: 'x' } });
      expect(res.statusCode).toBe(401);
    });

    it('corpo sem nenhum campo válido -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/company', payload: { unknownField: 'x' } });
      expect(res.statusCode).toBe(400);
    });

    it('allowlist: só grava os 6 campos conhecidos, mapeados pra snake_case, ignora o resto', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/settings/company',
        payload: {
          name: 'Fibra Norte', logoUrl: 'https://x/logo.png', supportEmail: 'sac@fibranorte.com.br',
          supportPhone: '(11) 4000-0000', workingHours: '08:00 - 20:00', timezone: 'America/Sao_Paulo',
          rolePermissions: { admin: ['*'] }, id: 'outro-tenant', // campos que NÃO fazem parte da allowlist
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({
        name: 'Fibra Norte', logo_url: 'https://x/logo.png', support_email: 'sac@fibranorte.com.br',
        support_phone: '(11) 4000-0000', working_hours: '08:00 - 20:00', timezone: 'America/Sao_Paulo',
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET/PUT /api/v2/settings/sso', () => {
    it('GET sem tenant -> 401', async () => {
      const app = await buildApp({});
      expect((await app.inject({ method: 'GET', url: '/api/v2/settings/sso' })).statusCode).toBe(401);
    });

    it('GET devolve domain vazio quando não configurado', async () => {
      mockFromSequence([{ data: { sso_config: {} }, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/sso' });
      expect(res.json()).toEqual({ domain: '' });
    });

    it('PUT sem domain (string) -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/sso', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('PUT salva sso_config filtrado por tenant do JWT', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/sso', payload: { domain: ' suaempresa.com.br ' } });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ sso_config: { domain: 'suaempresa.com.br' } });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET/PUT /api/v2/settings/theme', () => {
    it('GET devolve defaults mesclados com o que está salvo', async () => {
      mockFromSequence([{ data: { theme: { primary_color: '#ff0000' } }, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/theme' });
      expect(res.json()).toEqual(expect.objectContaining({ primary_color: '#ff0000', font_family: 'Inter' }));
    });

    it('PUT corpo vazio -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/theme', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('PUT salva theme filtrado por tenant do JWT', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      await app.inject({ method: 'PUT', url: '/api/v2/settings/theme', payload: { primary_color: '#000', outroCampo: 'ignorado' } });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ theme: { primary_color: '#000' } });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET/PUT /api/v2/settings/vector-store', () => {
    it('GET devolve config + indexedCount, filtrado por tenant do JWT', async () => {
      mockFromSequence([
        { data: { vector_store_config: { provider: 'qdrant', url: 'https://x' } }, error: null },
        { count: 7 } as any,
      ]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/vector-store' });
      expect(res.json()).toEqual(expect.objectContaining({ provider: 'qdrant', url: 'https://x', indexedCount: 7 }));
    });

    it('PUT salva vector_store_config filtrado por tenant do JWT', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      await app.inject({ method: 'PUT', url: '/api/v2/settings/vector-store', payload: { provider: 'pinecone' } });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ vector_store_config: { provider: 'pinecone' } });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });

  describe('GET/PUT /api/v2/settings/embedding-config', () => {
    it('GET devolve defaults mesclados', async () => {
      mockFromSequence([{ data: { embedding_config: { model: 'text-embedding-3-large' } }, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/settings/embedding-config' });
      expect(res.json()).toEqual(expect.objectContaining({ model: 'text-embedding-3-large', provider: 'openai' }));
    });

    it('PUT salva embedding_config filtrado por tenant do JWT', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      await app.inject({ method: 'PUT', url: '/api/v2/settings/embedding-config', payload: { model: 'text-embedding-3-large' } });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ embedding_config: { model: 'text-embedding-3-large' } });
      expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });
});
