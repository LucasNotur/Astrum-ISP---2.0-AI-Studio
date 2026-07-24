import { describe, it, expect } from 'vitest';
import { detectConflicts, resolveConflict, mapFields, SyncField, SyncConflict } from './erp-bidirectional-sync.service';

const FIELDS: SyncField[] = [
  { astrumField: 'name', erpField: 'nome', direction: 'bidirectional' },
  { astrumField: 'email', erpField: 'email_contato', direction: 'bidirectional' },
  { astrumField: 'plan', erpField: 'plano', direction: 'astrum_to_erp' },
  { astrumField: 'erp_id', erpField: 'id', direction: 'erp_to_astrum' },
];

describe('erp-bidirectional-sync.service', () => {
  describe('detectConflicts', () => {
    it('detecta conflito em campo bidirecional', () => {
      const conflicts = detectConflicts(
        { name: 'João Silva', email: 'joao@astrum.com' },
        { nome: 'João S.', email_contato: 'joao@astrum.com' },
        FIELDS, '2026-07-22T10:00:00Z', '2026-07-22T11:00:00Z',
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].field).toBe('name');
      expect(conflicts[0].astrumValue).toBe('João Silva');
      expect(conflicts[0].erpValue).toBe('João S.');
    });

    it('sem conflito quando valores iguais', () => {
      const conflicts = detectConflicts(
        { name: 'João', email: 'j@x.com' },
        { nome: 'João', email_contato: 'j@x.com' },
        FIELDS, '2026-07-22T10:00:00Z', '2026-07-22T11:00:00Z',
      );
      expect(conflicts).toHaveLength(0);
    });

    it('ignora campos unidirecionais', () => {
      const conflicts = detectConflicts(
        { name: 'X', plan: 'pro' },
        { nome: 'X', plano: 'starter' },
        FIELDS, '2026-07-22T10:00:00Z', '2026-07-22T11:00:00Z',
      );
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('resolveConflict', () => {
    const CONFLICT: SyncConflict = {
      field: 'name', astrumValue: 'Astrum', erpValue: 'ERP',
      astrumUpdatedAt: '2026-07-22T10:00:00Z', erpUpdatedAt: '2026-07-22T11:00:00Z',
    };

    it('astrum_wins retorna valor Astrum', () => {
      expect(resolveConflict(CONFLICT, 'astrum_wins')).toEqual({ winner: 'astrum', value: 'Astrum' });
    });

    it('erp_wins retorna valor ERP', () => {
      expect(resolveConflict(CONFLICT, 'erp_wins')).toEqual({ winner: 'erp', value: 'ERP' });
    });

    it('newest_wins escolhe ERP quando mais recente', () => {
      expect(resolveConflict(CONFLICT, 'newest_wins')).toEqual({ winner: 'erp', value: 'ERP' });
    });

    it('newest_wins escolhe Astrum quando mais recente', () => {
      const c = { ...CONFLICT, astrumUpdatedAt: '2026-07-22T12:00:00Z' };
      expect(resolveConflict(c, 'newest_wins')).toEqual({ winner: 'astrum', value: 'Astrum' });
    });

    it('manual retorna winner manual', () => {
      expect(resolveConflict(CONFLICT, 'manual').winner).toBe('manual');
    });
  });

  describe('mapFields', () => {
    it('mapeia astrum → erp', () => {
      const result = mapFields({ name: 'João', email: 'j@x.com', plan: 'pro' }, FIELDS, 'astrum_to_erp');
      expect(result.nome).toBe('João');
      expect(result.email_contato).toBe('j@x.com');
      expect(result.plano).toBe('pro');
      expect(result.id).toBeUndefined();
    });

    it('mapeia erp → astrum', () => {
      const result = mapFields({ nome: 'João', id: '123' }, FIELDS, 'erp_to_astrum');
      expect(result.name).toBe('João');
      expect(result.erp_id).toBe('123');
      expect(result.plan).toBeUndefined();
    });

    it('aplica transform', () => {
      const fields: SyncField[] = [
        { astrumField: 'status', erpField: 'situacao', direction: 'bidirectional', transform: (v) => String(v).toUpperCase() },
      ];
      const result = mapFields({ status: 'active' }, fields, 'astrum_to_erp');
      expect(result.situacao).toBe('ACTIVE');
    });
  });
});
