import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../lib/dbAdmin', () => ({
  getIntegrationKeys: vi.fn(),
}));

import { sendHSMTemplate, TemplateNotApprovedError } from '../../lib/whatsappSender';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { getIntegrationKeys } from '../../lib/dbAdmin';

/** Mocka `supabaseAdmin.from('hsm_templates').select().eq().eq().eq().limit().maybeSingle()`. */
function mockTemplateLookup(template: any) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: template });
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = maybeSingle;
  chain.insert = vi.fn().mockResolvedValue({ error: null });
  (supabaseAdmin.from as any).mockReturnValue(chain);
  return chain;
}

describe('sendHSMTemplate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (getIntegrationKeys as any).mockResolvedValue({
      evolutionUrl: 'https://evo.example.com/',
      evolutionInstance: 'inst-1',
      evolutionApiKey: 'evo-key',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'evo-msg-1' }),
    }) as any;
  });

  it('template não encontrado (ou não aprovado) -> TemplateNotApprovedError', async () => {
    mockTemplateLookup(null);
    await expect(sendHSMTemplate('t-1', 'boas_vindas', '5511999999999', {}))
      .rejects.toThrow(TemplateNotApprovedError);
  });

  it('variável esperada no body ausente -> lança', async () => {
    mockTemplateLookup({ id: 'tpl-1', body: 'Olá {{1}}', language: 'pt_BR' });
    await expect(sendHSMTemplate('t-1', 'boas_vindas', '5511999999999', {}))
      .rejects.toThrow('MISSING_TEMPLATE_VARIABLE');
  });

  it('credenciais Evolution ausentes -> lança', async () => {
    mockTemplateLookup({ id: 'tpl-1', body: 'Olá {{1}}', language: 'pt_BR' });
    (getIntegrationKeys as any).mockResolvedValue({});
    await expect(sendHSMTemplate('t-1', 'boas_vindas', '5511999999999', { '1': 'João' }))
      .rejects.toThrow('Evolution API credentials not configured.');
  });

  it('envia via Evolution e registra o log com o id do template', async () => {
    const chain = mockTemplateLookup({ id: 'tpl-1', body: 'Olá {{1}}', language: 'pt_BR' });
    const result = await sendHSMTemplate('t-1', 'boas_vindas', '5511999999999', { '1': 'João' });

    expect(result).toEqual({ id: 'evo-msg-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendTemplate/inst-1',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(supabaseAdmin.from).toHaveBeenCalledWith('hsm_send_logs');
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 't-1',
      template_id: 'tpl-1',
      template_name: 'boas_vindas',
      recipient: '5511999999999',
    }));
  });

  it('resposta não-ok da Evolution -> lança com o erro', async () => {
    mockTemplateLookup({ id: 'tpl-1', body: 'Olá {{1}}', language: 'pt_BR' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'boom' }),
    }) as any;

    await expect(sendHSMTemplate('t-1', 'boas_vindas', '5511999999999', { '1': 'João' }))
      .rejects.toThrow(/Failed to send HSM Template/);
  });
});
