import { describe, it, expect } from 'vitest';
import { evaluateFilter, applyFilter, toSqlWhere, FilterGroup } from './filter-engine.service';

const RECORDS = [
  { id: '1', status: 'open', priority: 3, channel: 'whatsapp', assignee: 'op1', tags: 'internet' },
  { id: '2', status: 'closed', priority: 1, channel: 'email', assignee: 'op2', tags: 'billing' },
  { id: '3', status: 'open', priority: 5, channel: 'whatsapp', assignee: null, tags: 'internet lenta' },
  { id: '4', status: 'pending', priority: 2, channel: 'portal', assignee: 'op1', tags: 'instalação' },
];

describe('filter-engine.service', () => {
  describe('evaluateFilter', () => {
    it('AND simples: status=open AND priority>2', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [
          { field: 'status', operator: 'eq', value: 'open' },
          { field: 'priority', operator: 'gt', value: 2 },
        ],
      };
      expect(evaluateFilter(RECORDS[0], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[1], filter)).toBe(false);
    });

    it('OR: status=open OR status=pending', () => {
      const filter: FilterGroup = {
        logic: 'or',
        conditions: [
          { field: 'status', operator: 'eq', value: 'open' },
          { field: 'status', operator: 'eq', value: 'pending' },
        ],
      };
      expect(evaluateFilter(RECORDS[0], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[3], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[1], filter)).toBe(false);
    });

    it('contains (case-insensitive)', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [{ field: 'tags', operator: 'contains', value: 'Internet' }],
      };
      expect(evaluateFilter(RECORDS[0], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[2], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[1], filter)).toBe(false);
    });

    it('in operator', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [{ field: 'channel', operator: 'in', value: ['whatsapp', 'portal'] }],
      };
      expect(evaluateFilter(RECORDS[0], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[3], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[1], filter)).toBe(false);
    });

    it('is_null / is_not_null', () => {
      const nullFilter: FilterGroup = { logic: 'and', conditions: [{ field: 'assignee', operator: 'is_null' }] };
      expect(evaluateFilter(RECORDS[2], nullFilter)).toBe(true);
      expect(evaluateFilter(RECORDS[0], nullFilter)).toBe(false);

      const notNullFilter: FilterGroup = { logic: 'and', conditions: [{ field: 'assignee', operator: 'is_not_null' }] };
      expect(evaluateFilter(RECORDS[0], notNullFilter)).toBe(true);
    });

    it('nested groups: (status=open AND priority>2) OR channel=email', () => {
      const filter: FilterGroup = {
        logic: 'or',
        conditions: [
          {
            logic: 'and',
            conditions: [
              { field: 'status', operator: 'eq', value: 'open' },
              { field: 'priority', operator: 'gt', value: 2 },
            ],
          },
          { field: 'channel', operator: 'eq', value: 'email' },
        ],
      };
      expect(evaluateFilter(RECORDS[0], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[1], filter)).toBe(true);
      expect(evaluateFilter(RECORDS[3], filter)).toBe(false);
    });
  });

  describe('applyFilter', () => {
    it('filtra registros corretamente', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [{ field: 'status', operator: 'eq', value: 'open' }],
      };
      const result = applyFilter(RECORDS, filter);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['1', '3']);
    });
  });

  describe('toSqlWhere', () => {
    it('gera SQL com parametrização', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [
          { field: 'status', operator: 'eq', value: 'open' },
          { field: 'priority', operator: 'gte', value: 3 },
        ],
      };
      const { sql, params } = toSqlWhere(filter);
      expect(sql).toBe('status = $1 AND priority >= $2');
      expect(params).toEqual(['open', 3]);
    });

    it('gera ILIKE para contains', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [{ field: 'tags', operator: 'contains', value: 'internet' }],
      };
      const { sql, params } = toSqlWhere(filter);
      expect(sql).toBe('tags ILIKE $1');
      expect(params).toEqual(['%internet%']);
    });

    it('gera IS NULL sem parâmetros', () => {
      const filter: FilterGroup = {
        logic: 'and',
        conditions: [{ field: 'assignee', operator: 'is_null' }],
      };
      const { sql, params } = toSqlWhere(filter);
      expect(sql).toBe('assignee IS NULL');
      expect(params).toEqual([]);
    });
  });
});
