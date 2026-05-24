import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OmnichannelRouter, OmnichannelDependencies } from '../../../src/routes/omnichannel';

describe('Omnichannel Tests', () => {
  let deps: import('vitest').Mocked<OmnichannelDependencies>;
  let router: OmnichannelRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      graphApi: { sendMessage: vi.fn() },
      evolutionApi: { sendMessage: vi.fn() },
      db: {
        queueMessage: vi.fn(),
        getTemplate: vi.fn(),
        logHsmSend: vi.fn(),
        processViaAIPipeline: vi.fn(),
      },
      getFacebookPageToken: vi.fn().mockResolvedValue('page-token'),
    };
    router = new OmnichannelRouter(deps);
  });

  it('1. Webhook Instagram -> normaliza payload e enfileira com source=instagram', async () => {
    const payload = { object: 'instagram', entry: [] };
    await router.handleWebhook(payload);
    
    expect(deps.db.queueMessage).toHaveBeenCalledWith('instagram', payload);
  });

  it('2. Resposta para source=instagram -> chama Graph API, NÃO chama Evolution API', async () => {
    await router.sendReply('t1', 'instagram', 'usr1', 'Hello');
    
    expect(deps.getFacebookPageToken).toHaveBeenCalledWith('t1');
    expect(deps.graphApi.sendMessage).toHaveBeenCalledWith('usr1', 'Hello', 'page-token');
    expect(deps.evolutionApi.sendMessage).not.toHaveBeenCalled();
  });

  it('3. Resposta para source=whatsapp -> chama Evolution API, NÃO chama Graph API', async () => {
    await router.sendReply('t1', 'whatsapp', '5511999999999', 'Hello');
    
    expect(deps.evolutionApi.sendMessage).toHaveBeenCalledWith('5511999999999', 'Hello');
    expect(deps.graphApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.getFacebookPageToken).not.toHaveBeenCalled();
  });

  it('4. Resposta para source=facebook -> chama Graph API com page_access_token correto', async () => {
    deps.getFacebookPageToken.mockResolvedValue('fb-page-token');
    await router.sendReply('t1', 'facebook', 'fb-usr', 'Hello FB');
    
    expect(deps.getFacebookPageToken).toHaveBeenCalledWith('t1');
    expect(deps.graphApi.sendMessage).toHaveBeenCalledWith('fb-usr', 'Hello FB', 'fb-page-token');
  });

  it('5. WebChat: mensagem enviada -> processa pelo mesmo pipeline da IA que WhatsApp', async () => {
    await router.handleWebChat('Ajuda');
    
    expect(deps.db.processViaAIPipeline).toHaveBeenCalledWith('Ajuda', 'webchat');
  });

  it('6. Template HSM com variáveis {{1}} {{2}} -> substitui corretamente na hora do envio', async () => {
    deps.db.getTemplate.mockResolvedValue({ id: 'tmpl1', status: 'APPROVED', body: 'Olá {{1}}, seu código é {{2}}.' });
    
    await router.sendHSMTemplate('t1', 'tmpl1', '55119999', ['João', '1234']);
    
    expect(deps.evolutionApi.sendMessage).toHaveBeenCalledWith('55119999', 'Olá João, seu código é 1234.');
  });

  it('7. Template com status=REJECTED -> NÃO enviado mesmo se solicitado', async () => {
    deps.db.getTemplate.mockResolvedValue({ id: 'tmpl2', status: 'REJECTED', body: 'Olá' });
    
    await router.sendHSMTemplate('t1', 'tmpl2', '55119999', []);
    
    expect(deps.evolutionApi.sendMessage).not.toHaveBeenCalled();
    expect(deps.db.logHsmSend).not.toHaveBeenCalled();
  });

  it('8. Template com status=PENDING -> NÃO enviado, lança TEMPLATE_NOT_APPROVED', async () => {
    deps.db.getTemplate.mockResolvedValue({ id: 'tmpl3', status: 'PENDING', body: 'Olá' });
    
    await expect(router.sendHSMTemplate('t1', 'tmpl3', '55119999', [])).rejects.toThrow('TEMPLATE_NOT_APPROVED');
    expect(deps.evolutionApi.sendMessage).not.toHaveBeenCalled();
  });

  it('9. sendHSMTemplate -> registra em hsm_send_logs com tenant_id correto', async () => {
    deps.db.getTemplate.mockResolvedValue({ id: 'tmpl1', status: 'APPROVED', body: 'Olá {{1}}' });
    
    await router.sendHSMTemplate('t1', 'tmpl1', '55119999', ['Maria']);
    
    expect(deps.db.logHsmSend).toHaveBeenCalledWith('t1', 'tmpl1', '55119999');
  });
});
