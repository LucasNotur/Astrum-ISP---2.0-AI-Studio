import { describe, it, expect } from 'vitest';
import { buildHsmTemplateRow, canDeleteTemplate, HsmTemplateValidationError } from './hsm-templates.service';

describe('hsm-templates.service', () => {
  describe('buildHsmTemplateRow', () => {
    const validInput = {
      name: 'boas_vindas',
      category: 'UTILITY',
      language: 'pt_BR',
      header_type: 'text',
      header_content: 'Bem-vindo',
      body: 'Olá {{1}}, tudo certo com sua instalação?',
      footer: 'Astrum ISP',
    };

    it('monta a linha com todos os campos válidos', () => {
      const row = buildHsmTemplateRow('t-1', validInput);
      expect(row).toEqual({
        tenant_id: 't-1',
        name: 'boas_vindas',
        category: 'UTILITY',
        language: 'pt_BR',
        header_type: 'text',
        header_content: 'Bem-vindo',
        body: 'Olá {{1}}, tudo certo com sua instalação?',
        footer: 'Astrum ISP',
        status: 'PENDING',
      });
    });

    it('sem tenant -> lança HsmTemplateValidationError', () => {
      expect(() => buildHsmTemplateRow('', validInput)).toThrow(HsmTemplateValidationError);
    });

    it('sem name -> lança', () => {
      expect(() => buildHsmTemplateRow('t-1', { ...validInput, name: '  ' })).toThrow(HsmTemplateValidationError);
    });

    it('sem body -> lança', () => {
      expect(() => buildHsmTemplateRow('t-1', { ...validInput, body: '' })).toThrow(HsmTemplateValidationError);
    });

    it('category inválida cai pro default MARKETING', () => {
      const row = buildHsmTemplateRow('t-1', { ...validInput, category: 'BANANA' });
      expect(row.category).toBe('MARKETING');
    });

    it('header_type inválido cai pro default none', () => {
      const row = buildHsmTemplateRow('t-1', { ...validInput, header_type: 'video' });
      expect(row.header_type).toBe('none');
    });

    it('header_type=none nunca guarda header_content, mesmo se enviado', () => {
      const row = buildHsmTemplateRow('t-1', { ...validInput, header_type: 'none', header_content: 'lixo' });
      expect(row.header_content).toBeNull();
    });

    it('language ausente cai pro default pt_BR', () => {
      const row = buildHsmTemplateRow('t-1', { name: 'x', body: 'y' });
      expect(row.language).toBe('pt_BR');
    });

    it('footer ausente vira null', () => {
      const row = buildHsmTemplateRow('t-1', { name: 'x', body: 'y' });
      expect(row.footer).toBeNull();
    });

    it('novo template sempre nasce PENDING (ignora status enviado)', () => {
      const row = buildHsmTemplateRow('t-1', { ...validInput, status: 'APPROVED' });
      expect(row.status).toBe('PENDING');
    });
  });

  describe('canDeleteTemplate', () => {
    it('APPROVED não pode ser excluído', () => {
      expect(canDeleteTemplate('APPROVED')).toBe(false);
    });

    it('PENDING pode ser excluído', () => {
      expect(canDeleteTemplate('PENDING')).toBe(true);
    });

    it('REJECTED pode ser excluído', () => {
      expect(canDeleteTemplate('REJECTED')).toBe(true);
    });

    it('status ausente/null pode ser excluído (fail-open pro caso normal)', () => {
      expect(canDeleteTemplate(null)).toBe(true);
      expect(canDeleteTemplate(undefined)).toBe(true);
    });
  });
});
