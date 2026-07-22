import { describe, it, expect, vi } from 'vitest';
import { validateCpfCnpj, calculateIss, issueNotaFiscal, cancelNotaFiscal, NfPorts, NfIssueRequest, NotaFiscal } from './invoice-nf.service';

const NF_AUTHORIZED: NotaFiscal = {
  id: 'nf-1', tenantId: 't1', invoiceId: 'inv-1', type: 'nfse',
  number: '000123', accessKey: 'key-abc', status: 'authorized',
  xmlUrl: 'https://xml', pdfUrl: 'https://pdf',
  issuedAt: '2026-07-22', createdAt: '2026-07-22',
};

const REQ: NfIssueRequest = {
  tenantId: 't1', invoiceId: 'inv-2', type: 'nfse',
  customerCpfCnpj: '12345678901', customerName: 'João',
  description: 'Assinatura SaaS', amount: 299.9,
};

function makePorts(): NfPorts {
  return {
    getByInvoice: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'nf-new', tenantId: 't1', invoiceId: 'inv-2', type: 'nfse', status: 'processing', createdAt: '2026-07-22' }),
    updateStatus: vi.fn().mockImplementation(async (id, status, data) => ({ id, status, ...data })),
    submitToSefaz: vi.fn().mockResolvedValue({ authorized: true, number: '000124', accessKey: 'key-new', xmlUrl: 'https://xml2', pdfUrl: 'https://pdf2' }),
    cancelAtSefaz: vi.fn().mockResolvedValue({ cancelled: true }),
  };
}

describe('invoice-nf.service', () => {
  describe('validateCpfCnpj', () => {
    it('aceita CPF com 11 dígitos', () => expect(validateCpfCnpj('123.456.789-01')).toBe(true));
    it('aceita CNPJ com 14 dígitos', () => expect(validateCpfCnpj('12.345.678/0001-90')).toBe(true));
    it('rejeita documento curto', () => expect(validateCpfCnpj('12345')).toBe(false));
  });

  describe('calculateIss', () => {
    it('calcula ISS com arredondamento', () => {
      expect(calculateIss(1000, 0.05)).toBe(50);
      expect(calculateIss(299.9, 0.02)).toBe(6);
    });
  });

  describe('issueNotaFiscal', () => {
    it('emite NF com sucesso', async () => {
      const ports = makePorts();
      const result = await issueNotaFiscal(REQ, ports);
      expect(result.ok).toBe(true);
      expect(result.nf?.status).toBe('authorized');
      expect(ports.submitToSefaz).toHaveBeenCalled();
    });

    it('rejeita CPF/CNPJ inválido', async () => {
      const ports = makePorts();
      const result = await issueNotaFiscal({ ...REQ, customerCpfCnpj: '123' }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('CPF/CNPJ');
    });

    it('rejeita valor zero', async () => {
      const ports = makePorts();
      const result = await issueNotaFiscal({ ...REQ, amount: 0 }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('positivo');
    });

    it('rejeita quando NF já autorizada', async () => {
      const ports = makePorts();
      (ports.getByInvoice as any).mockResolvedValue(NF_AUTHORIZED);
      const result = await issueNotaFiscal(REQ, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('já existe');
    });

    it('trata rejeição do SEFAZ', async () => {
      const ports = makePorts();
      (ports.submitToSefaz as any).mockResolvedValue({ authorized: false, rejectionReason: 'CNPJ irregular' });
      const result = await issueNotaFiscal(REQ, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('CNPJ irregular');
      expect(ports.updateStatus).toHaveBeenCalledWith('nf-new', 'rejected', expect.objectContaining({ rejectionReason: 'CNPJ irregular' }));
    });

    it('trata erro de comunicação', async () => {
      const ports = makePorts();
      (ports.submitToSefaz as any).mockRejectedValue(new Error('Timeout SEFAZ'));
      const result = await issueNotaFiscal(REQ, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Timeout SEFAZ');
    });
  });

  describe('cancelNotaFiscal', () => {
    it('cancela NF autorizada', async () => {
      const ports = makePorts();
      (ports.getByInvoice as any).mockResolvedValue(NF_AUTHORIZED);
      const result = await cancelNotaFiscal('t1', 'inv-1', 'Fatura emitida em duplicidade para o cliente', ports);
      expect(result.ok).toBe(true);
      expect(ports.updateStatus).toHaveBeenCalledWith('nf-1', 'cancelled');
    });

    it('rejeita cancelamento de NF não autorizada', async () => {
      const ports = makePorts();
      (ports.getByInvoice as any).mockResolvedValue({ ...NF_AUTHORIZED, status: 'processing' });
      const result = await cancelNotaFiscal('t1', 'inv-1', 'Motivo suficientemente longo para validar', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('autorizada');
    });

    it('rejeita motivo curto', async () => {
      const ports = makePorts();
      (ports.getByInvoice as any).mockResolvedValue(NF_AUTHORIZED);
      const result = await cancelNotaFiscal('t1', 'inv-1', 'curto', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('15 caracteres');
    });

    it('rejeita NF inexistente', async () => {
      const ports = makePorts();
      const result = await cancelNotaFiscal('t1', 'inv-99', 'motivo longo suficiente para cancelar', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrada');
    });
  });
});
