import { describe, it, expect, vi } from 'vitest';
import { extractVariables, renderTemplate, validateTemplate, sendProactiveMessage, HsmTemplate, HsmPorts } from './hsm-template.service';

const TEMPLATE: HsmTemplate = {
  id: 'tpl1', tenantId: 't1', name: 'Boas-vindas', language: 'pt_BR',
  category: 'utility', bodyText: 'Olá {{1}}, bem-vindo ao {{2}}!',
  variables: ['{{1}}', '{{2}}'], status: 'approved', createdAt: '2026-07-22',
};

function makePorts(): HsmPorts {
  return {
    listTemplates: vi.fn().mockResolvedValue([TEMPLATE]),
    createTemplate: vi.fn().mockResolvedValue(TEMPLATE),
    submitForApproval: vi.fn().mockResolvedValue({ success: true, metaTemplateId: 'meta-123' }),
    sendHsm: vi.fn().mockResolvedValue({ messageId: 'msg-456' }),
  };
}

describe('hsm-template.service', () => {
  describe('extractVariables', () => {
    it('extrai variáveis numeradas do body', () => {
      expect(extractVariables('Olá {{1}}, seu plano {{2}} vence em {{3}} dias')).toEqual(['{{1}}', '{{2}}', '{{3}}']);
    });

    it('retorna vazio sem variáveis', () => {
      expect(extractVariables('Texto simples sem variáveis')).toEqual([]);
    });

    it('deduplica variáveis repetidas', () => {
      expect(extractVariables('{{1}} e {{1}} novamente')).toEqual(['{{1}}']);
    });
  });

  describe('renderTemplate', () => {
    it('substitui variáveis pelo valor', () => {
      const result = renderTemplate('Olá {{1}}, bem-vindo ao {{2}}!', { '1': 'João', '2': 'ISP Teste' });
      expect(result).toBe('Olá João, bem-vindo ao ISP Teste!');
    });
  });

  describe('validateTemplate', () => {
    it('aceita template válido', () => {
      const result = validateTemplate({ bodyText: 'Olá {{1}}, tudo bem?', category: 'utility', buttons: [] });
      expect(result.valid).toBe(true);
    });

    it('rejeita body muito curto', () => {
      const result = validateTemplate({ bodyText: 'Oi', category: 'utility' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('10 caracteres');
    });

    it('rejeita mais de 3 botões', () => {
      const buttons = Array.from({ length: 4 }, (_, i) => ({ type: 'quick_reply' as const, text: `B${i}` }));
      const result = validateTemplate({ bodyText: 'Texto válido com conteúdo suficiente', category: 'utility', buttons });
      expect(result.valid).toBe(false);
    });

    it('exige variável em template marketing', () => {
      const result = validateTemplate({ bodyText: 'Promoção sem personalização aqui', category: 'marketing' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('variável');
    });
  });

  describe('sendProactiveMessage', () => {
    it('envia mensagem com template aprovado', async () => {
      const ports = makePorts();
      const result = await sendProactiveMessage('t1', 'tpl1', '5511999990001', { '1': 'João', '2': 'ISP' }, ports);
      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('msg-456');
    });

    it('rejeita template não encontrado', async () => {
      const ports = makePorts();
      const result = await sendProactiveMessage('t1', 'inexistente', '123', {}, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrado');
    });

    it('rejeita template não aprovado', async () => {
      const ports = makePorts();
      (ports.listTemplates as any).mockResolvedValue([{ ...TEMPLATE, status: 'pending_approval' }]);
      const result = await sendProactiveMessage('t1', 'tpl1', '123', {}, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('aprovado');
    });

    it('captura erro de envio', async () => {
      const ports = makePorts();
      (ports.sendHsm as any).mockRejectedValue(new Error('Rate limit'));
      const result = await sendProactiveMessage('t1', 'tpl1', '123', {}, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Rate limit');
    });
  });
});
