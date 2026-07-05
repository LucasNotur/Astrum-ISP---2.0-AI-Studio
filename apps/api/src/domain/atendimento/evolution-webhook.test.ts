import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMessageJob } from './evolution-webhook.routes';
import type { ParsedEvolutionMessage } from './evolution-payload';

const msg: ParsedEvolutionMessage = {
  instanceName: 'isp-acme',
  remoteJid: '5511999998888@s.whatsapp.net',
  senderPhone: '5511999998888',
  messageId: 'MSG1',
  textMessage: 'oi',
  isAudio: false,
  audioUrl: '',
  isImage: false,
  isDocument: false,
  base64Media: '',
  mediaMimeType: '',
  fromMe: false,
};

describe('buildMessageJob', () => {
  it('constrói MessageJobData com todos os campos de mídia', () => {
    const job = buildMessageJob('tenant-1', { ...msg, isAudio: true, audioUrl: 'http://a/x.ogg' });
    expect(job).toMatchObject({
      tenantId: 'tenant-1',
      senderPhone: '5511999998888',
      messageContent: 'oi',
      channel: 'whatsapp',
      messageId: 'MSG1',
      instanceName: 'isp-acme',
      isAudio: true,
      audioUrl: 'http://a/x.ogg',
    });
  });

  it('preserva o messageId para dedup (jobId evo:MSG1)', () => {
    const job = buildMessageJob('t1', msg);
    expect(job.messageId).toBe('MSG1');
  });
});

// resolveTenantByInstance com Supabase mockado
const evoInstanceRow = { data: null as any };
const tenantRow = { data: null as any };

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(table === 'tenant_evolution_instances' ? evoInstanceRow : tenantRow),
    })),
  },
}));

describe('resolveTenantByInstance', () => {
  beforeEach(() => {
    evoInstanceRow.data = null;
    tenantRow.data = null;
  });

  it('resolve pela tabela multi-instância primeiro', async () => {
    evoInstanceRow.data = { tenant_id: 'tenant-A' };
    const { resolveTenantByInstance } = await import('./evolution-webhook.routes');
    expect(await resolveTenantByInstance('isp-acme')).toBe('tenant-A');
  });

  it('cai para coluna direta em tenants se não houver mapeamento dedicado', async () => {
    tenantRow.data = { id: 'tenant-B' };
    const { resolveTenantByInstance } = await import('./evolution-webhook.routes');
    expect(await resolveTenantByInstance('isp-legacy')).toBe('tenant-B');
  });

  it('retorna null para instância desconhecida (→ 403 na rota)', async () => {
    const { resolveTenantByInstance } = await import('./evolution-webhook.routes');
    expect(await resolveTenantByInstance('desconhecida')).toBeNull();
  });
});
