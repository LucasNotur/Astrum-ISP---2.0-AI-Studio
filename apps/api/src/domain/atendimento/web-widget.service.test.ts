import { describe, it, expect, vi } from 'vitest';
import {
  validateColor, isWithinBusinessHours, generateEmbedScript,
  sanitizeMessage, validateWidgetConfig, handleWidgetMessage,
  WidgetConfig, WidgetPorts,
} from './web-widget.service';

const CONFIG: WidgetConfig = {
  tenantId: 't1', primaryColor: '#1a73e8',
  greeting: 'Olá! Como podemos ajudar?',
  position: 'bottom-right',
  offlineMessage: 'Estamos offline. Deixe sua mensagem.',
  collectEmail: true, allowAttachments: false,
};

function makePorts(): WidgetPorts {
  return {
    getConfig: vi.fn().mockResolvedValue(CONFIG),
    saveConfig: vi.fn().mockResolvedValue(CONFIG),
    createSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'wm-1' }),
    countMessagesLastMinute: vi.fn().mockResolvedValue(0),
  };
}

describe('web-widget.service', () => {
  describe('validateColor', () => {
    it('aceita hex válido', () => expect(validateColor('#1a73e8')).toBe(true));
    it('rejeita formato inválido', () => expect(validateColor('red')).toBe(false));
    it('rejeita hex curto', () => expect(validateColor('#fff')).toBe(false));
  });

  describe('isWithinBusinessHours', () => {
    it('retorna true sem horário comercial', () => {
      expect(isWithinBusinessHours(CONFIG, 14)).toBe(true);
    });

    it('retorna true dentro do horário', () => {
      const cfg = { ...CONFIG, businessHours: { start: '08:00', end: '18:00', timezone: 'America/Sao_Paulo' } };
      expect(isWithinBusinessHours(cfg, 10)).toBe(true);
    });

    it('retorna false fora do horário', () => {
      const cfg = { ...CONFIG, businessHours: { start: '08:00', end: '18:00', timezone: 'America/Sao_Paulo' } };
      expect(isWithinBusinessHours(cfg, 20)).toBe(false);
    });
  });

  describe('generateEmbedScript', () => {
    it('gera script com tenant e baseUrl', () => {
      const script = generateEmbedScript('t1', 'https://api.isp.com');
      expect(script).toContain('https://api.isp.com/widget/t1/loader.js');
      expect(script).toContain('<script>');
    });
  });

  describe('sanitizeMessage', () => {
    it('escapa tags HTML', () => {
      expect(sanitizeMessage('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });

    it('remove javascript:', () => {
      expect(sanitizeMessage('javascript:alert(1)')).not.toContain('javascript:');
    });

    it('trunca mensagem longa', () => {
      const long = 'a'.repeat(3000);
      expect(sanitizeMessage(long).length).toBe(2000);
    });
  });

  describe('validateWidgetConfig', () => {
    it('aceita config válida', async () => {
      const result = await validateWidgetConfig(CONFIG);
      expect(result.valid).toBe(true);
    });

    it('rejeita cor inválida', async () => {
      const result = await validateWidgetConfig({ ...CONFIG, primaryColor: 'red' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Cor primária');
    });

    it('rejeita saudação curta', async () => {
      const result = await validateWidgetConfig({ ...CONFIG, greeting: 'Hi' });
      expect(result.valid).toBe(false);
    });

    it('rejeita horário inválido', async () => {
      const result = await validateWidgetConfig({
        ...CONFIG,
        businessHours: { start: '18:00', end: '08:00', timezone: 'UTC' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Horário comercial');
    });
  });

  describe('handleWidgetMessage', () => {
    it('envia mensagem com sucesso', async () => {
      const ports = makePorts();
      const result = await handleWidgetMessage('t1', '1.2.3.4', 'sess-1', 'Olá, preciso de ajuda', ports);
      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('wm-1');
    });

    it('rejeita sem config', async () => {
      const ports = makePorts();
      (ports.getConfig as any).mockResolvedValue(null);
      const result = await handleWidgetMessage('t1', '1.2.3.4', 'sess-1', 'oi', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não configurado');
    });

    it('bloqueia por rate limit', async () => {
      const ports = makePorts();
      (ports.countMessagesLastMinute as any).mockResolvedValue(10);
      const result = await handleWidgetMessage('t1', '1.2.3.4', 'sess-1', 'spam', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Limite');
    });

    it('rejeita mensagem vazia', async () => {
      const ports = makePorts();
      const result = await handleWidgetMessage('t1', '1.2.3.4', 'sess-1', '   ', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('vazia');
    });

    it('captura erro de envio', async () => {
      const ports = makePorts();
      (ports.sendMessage as any).mockRejectedValue(new Error('Connection refused'));
      const result = await handleWidgetMessage('t1', '1.2.3.4', 'sess-1', 'teste', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });
});
