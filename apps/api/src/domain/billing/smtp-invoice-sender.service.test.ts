import { describe, it, expect, vi } from 'vitest';
import { buildInvoiceHtml, sanitizeHtml, sendInvoiceEmail, InvoiceEmail, SmtpPorts, SmtpConfig } from './smtp-invoice-sender.service';

const SMTP_CONFIG: SmtpConfig = {
  host: 'smtp.test.com', port: 587, secure: true,
  user: 'noreply@isp.com', pass: 'secret',
  fromName: 'ISP Teste', fromEmail: 'noreply@isp.com',
};

const EMAIL: InvoiceEmail = {
  invoiceId: 'inv-1', tenantId: 't1',
  recipientEmail: 'joao@email.com', recipientName: 'João Silva',
  subject: 'Fatura #001', invoiceNumber: '001',
  amount: 149.9, dueDate: '2026-08-10',
};

function makePorts(): SmtpPorts {
  return {
    getSmtpConfig: vi.fn().mockResolvedValue(SMTP_CONFIG),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-001' }),
    logSend: vi.fn().mockResolvedValue(undefined),
    countSentToday: vi.fn().mockResolvedValue(0),
  };
}

describe('smtp-invoice-sender.service', () => {
  describe('sanitizeHtml', () => {
    it('escapa caracteres HTML', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });

  describe('buildInvoiceHtml', () => {
    it('gera HTML com dados da fatura', () => {
      const html = buildInvoiceHtml(EMAIL);
      expect(html).toContain('Fatura 001');
      expect(html).toContain('R$');
      expect(html).toContain('149,90');
      expect(html).toContain('10/08/2026');
      expect(html).toContain('João Silva');
    });

    it('inclui botão PDF quando pdfUrl presente', () => {
      const html = buildInvoiceHtml({ ...EMAIL, pdfUrl: 'https://cdn.test/inv.pdf' });
      expect(html).toContain('Baixar PDF');
      expect(html).toContain('https://cdn.test/inv.pdf');
    });

    it('omite botão PDF quando sem URL', () => {
      const html = buildInvoiceHtml(EMAIL);
      expect(html).not.toContain('Baixar PDF');
    });
  });

  describe('sendInvoiceEmail', () => {
    it('envia com sucesso na primeira tentativa', async () => {
      const ports = makePorts();
      const result = await sendInvoiceEmail(EMAIL, ports);
      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('msg-001');
      expect(result.retriesUsed).toBe(0);
      expect(ports.logSend).toHaveBeenCalledWith('t1', 'inv-1', 'sent', 'msg-001');
    });

    it('rejeita quando SMTP não configurado', async () => {
      const ports = makePorts();
      (ports.getSmtpConfig as any).mockResolvedValue(null);
      const result = await sendInvoiceEmail(EMAIL, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('SMTP não configurado');
    });

    it('rejeita quando limite diário atingido', async () => {
      const ports = makePorts();
      (ports.countSentToday as any).mockResolvedValue(500);
      const result = await sendInvoiceEmail(EMAIL, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Limite diário');
    });

    it('faz retry e sucede na segunda tentativa', async () => {
      const ports = makePorts();
      (ports.sendEmail as any)
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ messageId: 'msg-retry' });
      const result = await sendInvoiceEmail(EMAIL, ports);
      expect(result.ok).toBe(true);
      expect(result.retriesUsed).toBe(1);
      expect(result.messageId).toBe('msg-retry');
    });

    it('falha após 3 tentativas e loga erro', async () => {
      const ports = makePorts();
      (ports.sendEmail as any).mockRejectedValue(new Error('SMTP down'));
      const result = await sendInvoiceEmail(EMAIL, ports);
      expect(result.ok).toBe(false);
      expect(result.retriesUsed).toBe(3);
      expect(result.error).toBe('SMTP down');
      expect(ports.logSend).toHaveBeenCalledWith('t1', 'inv-1', 'failed', undefined, 'SMTP down');
    });
  });
});
