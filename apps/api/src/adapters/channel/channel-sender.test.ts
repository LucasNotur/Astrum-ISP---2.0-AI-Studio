import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('../whatsapp/message-sender.service', () => ({
  sendWhatsAppResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../meta/meta-graph.adapter', () => ({
  sendMetaMessage: vi.fn().mockResolvedValue({ messageId: 'meta-1', status: 'sent', timestamp: '' }),
}));

vi.mock('../email/email.adapter', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'email-1', status: 'sent' }),
}));

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { page_access_token: 'tok' }, error: null }),
    }),
  },
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  atendimentoLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── testes ─────────────────────────────────────────────────────────────────

describe('sendChannelResponse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('roteia WhatsApp para sendWhatsAppResponse', async () => {
    const { sendChannelResponse } = await import('./channel-sender.service');
    const { sendWhatsAppResponse } = await import('../whatsapp/message-sender.service');

    await sendChannelResponse({
      channel: 'whatsapp',
      recipientId: '5511999990000',
      content: 'Olá!',
      tenantId: 'tenant-1',
    });

    expect(sendWhatsAppResponse).toHaveBeenCalledWith(
      expect.objectContaining({ to: '5511999990000', content: 'Olá!', tenantId: 'tenant-1' }),
    );
  });

  it('roteia instagram para sendMetaMessage com pageId correto', async () => {
    const { sendChannelResponse } = await import('./channel-sender.service');
    const { sendMetaMessage } = await import('../meta/meta-graph.adapter');

    await sendChannelResponse({
      channel: 'instagram',
      recipientId: 'igsid-456',
      content: 'Oi Instagram!',
      tenantId: 'tenant-1',
      instanceName: 'page-789',
    });

    expect(sendMetaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'igsid-456',
        content: 'Oi Instagram!',
        pageId: 'page-789',
        channel: 'instagram',
      }),
    );
  });

  it('roteia messenger para sendMetaMessage', async () => {
    const { sendChannelResponse } = await import('./channel-sender.service');
    const { sendMetaMessage } = await import('../meta/meta-graph.adapter');

    await sendChannelResponse({
      channel: 'messenger',
      recipientId: 'psid-123',
      content: 'Olá Messenger!',
      tenantId: 'tenant-1',
      instanceName: 'page-messenger-99',
    });

    expect(sendMetaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'messenger', pageId: 'page-messenger-99' }),
    );
  });

  it('roteia email para sendEmail', async () => {
    const { sendChannelResponse } = await import('./channel-sender.service');
    const { sendEmail } = await import('../email/email.adapter');

    await sendChannelResponse({
      channel: 'email',
      recipientId: 'cliente@gmail.com',
      content: 'Resposta por e-mail',
      tenantId: 'tenant-1',
      instanceName: 'suporte@isp.com',
      subject: 'Re: Suporte',
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'cliente@gmail.com',
        from: 'suporte@isp.com',
        text: 'Resposta por e-mail',
      }),
    );
  });

  it('não chama nenhum adapter para canal instagram sem instanceName', async () => {
    const { sendChannelResponse } = await import('./channel-sender.service');
    const { sendMetaMessage } = await import('../meta/meta-graph.adapter');
    const { atendimentoLogger } = await import('../../infrastructure/logging/logger');

    await sendChannelResponse({
      channel: 'instagram',
      recipientId: 'igsid-999',
      content: 'Teste',
      tenantId: 'tenant-1',
      // instanceName ausente
    });

    expect(sendMetaMessage).not.toHaveBeenCalled();
    expect(atendimentoLogger.warn).toHaveBeenCalled();
  });

  it('loga e não lança erro para canal webchat', async () => {
    const { sendChannelResponse } = await import('./channel-sender.service');
    await expect(
      sendChannelResponse({
        channel: 'webchat',
        recipientId: 'session-abc',
        content: 'OK',
        tenantId: 'tenant-1',
      }),
    ).resolves.toBeUndefined();
  });
});
