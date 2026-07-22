import { describe, it, expect, vi } from 'vitest';
import { applyTransform, mapRow, validateRow, importBatch, ImportConfig, CrmImportPorts, ImportField } from './crm-import.service';

const MAPPING: ImportField[] = [
  { source: 'Nome', target: 'name', transform: 'trim' },
  { source: 'Telefone', target: 'phone', transform: 'phone_normalize' },
  { source: 'Email', target: 'email', transform: 'lowercase' },
  { source: 'Data', target: 'createdAt', transform: 'date_iso' },
];

const CONFIG: ImportConfig = {
  tenantId: 't1', source: 'csv', entityType: 'contact',
  fieldMapping: MAPPING, deduplicateBy: 'email', dryRun: false,
};

function makePorts(): CrmImportPorts {
  return {
    upsertContact: vi.fn().mockResolvedValue({ id: 'c-1', created: true }),
    upsertConversation: vi.fn().mockResolvedValue({ id: 'conv-1', created: true }),
    upsertTicket: vi.fn().mockResolvedValue({ id: 't-1', created: true }),
    checkDuplicate: vi.fn().mockResolvedValue(false),
  };
}

describe('crm-import.service', () => {
  describe('applyTransform', () => {
    it('lowercase', () => expect(applyTransform('HELLO', 'lowercase')).toBe('hello'));
    it('uppercase', () => expect(applyTransform('hello', 'uppercase')).toBe('HELLO'));
    it('trim', () => expect(applyTransform('  hi  ', 'trim')).toBe('hi'));
    it('phone_normalize', () => expect(applyTransform('(11) 99999-0001', 'phone_normalize')).toBe('11999990001'));
    it('date_iso', () => expect(applyTransform('25/07/2026', 'date_iso')).toBe('2026-07-25'));
    it('sem transform', () => expect(applyTransform('raw', undefined)).toBe('raw'));
  });

  describe('mapRow', () => {
    it('mapeia campos com transforms', () => {
      const row = { Nome: ' João Silva ', Telefone: '(11) 9999-0001', Email: 'Joao@Test.COM', Data: '22/07/2026' };
      const mapped = mapRow(row, MAPPING);
      expect(mapped.name).toBe('João Silva');
      expect(mapped.phone).toBe('1199990001');
      expect(mapped.email).toBe('joao@test.com');
      expect(mapped.createdAt).toBe('2026-07-22');
    });

    it('ignora campos vazios', () => {
      const mapped = mapRow({ Nome: 'X', Telefone: '', Email: 'x@x.com', Data: '' }, MAPPING);
      expect(mapped.phone).toBeUndefined();
    });
  });

  describe('validateRow', () => {
    it('retorna vazio quando todos presentes', () => {
      expect(validateRow({ name: 'X', email: 'x@x.com' }, ['name', 'email'])).toEqual([]);
    });

    it('retorna campos ausentes', () => {
      expect(validateRow({ name: 'X' }, ['name', 'email'])).toEqual(['email']);
    });
  });

  describe('importBatch', () => {
    const ROWS = [
      { Nome: 'João', Telefone: '11999990001', Email: 'joao@test.com', Data: '22/07/2026' },
      { Nome: 'Maria', Telefone: '11888880001', Email: 'maria@test.com', Data: '22/07/2026' },
    ];

    it('importa linhas válidas', async () => {
      const ports = makePorts();
      const result = await importBatch(ROWS, CONFIG, ['name', 'email'], ports);
      expect(result.total).toBe(2);
      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('pula duplicados', async () => {
      const ports = makePorts();
      (ports.checkDuplicate as any).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const result = await importBatch(ROWS, CONFIG, ['name'], ports);
      expect(result.imported).toBe(1);
      expect(result.duplicates).toBe(1);
    });

    it('reporta erro de campo obrigatório', async () => {
      const ports = makePorts();
      const badRows = [{ Nome: '', Telefone: '123', Email: '', Data: '' }];
      const result = await importBatch(badRows, CONFIG, ['name', 'email'], ports);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].field).toBe('name');
    });

    it('dry run não persiste', async () => {
      const ports = makePorts();
      const result = await importBatch(ROWS, { ...CONFIG, dryRun: true }, ['name'], ports);
      expect(result.imported).toBe(2);
      expect(ports.upsertContact).not.toHaveBeenCalled();
    });
  });
});
