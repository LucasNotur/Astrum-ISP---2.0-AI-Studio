/**
 * Dossiê #65 — Motor de filtros complexos para conversas/tickets.
 * Suporta operadores lógicos (AND/OR), comparações (eq/neq/gt/lt/contains/in),
 * e filtros compostos com agrupamento.
 */

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'is_null' | 'is_not_null';
export type LogicalOperator = 'and' | 'or';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface FilterGroup {
  logic: LogicalOperator;
  conditions: Array<FilterCondition | FilterGroup>;
}

function isGroup(c: FilterCondition | FilterGroup): c is FilterGroup {
  return 'logic' in c && 'conditions' in c;
}

function evaluateCondition(record: Record<string, unknown>, condition: FilterCondition): boolean {
  const val = record[condition.field];
  const target = condition.value;

  switch (condition.operator) {
    case 'eq': return val === target;
    case 'neq': return val !== target;
    case 'gt': return typeof val === 'number' && typeof target === 'number' && val > target;
    case 'gte': return typeof val === 'number' && typeof target === 'number' && val >= target;
    case 'lt': return typeof val === 'number' && typeof target === 'number' && val < target;
    case 'lte': return typeof val === 'number' && typeof target === 'number' && val <= target;
    case 'contains': return typeof val === 'string' && typeof target === 'string' && val.toLowerCase().includes(target.toLowerCase());
    case 'not_contains': return typeof val === 'string' && typeof target === 'string' && !val.toLowerCase().includes(target.toLowerCase());
    case 'in': return Array.isArray(target) && target.includes(val);
    case 'not_in': return Array.isArray(target) && !target.includes(val);
    case 'is_null': return val == null;
    case 'is_not_null': return val != null;
  }
}

export function evaluateFilter(record: Record<string, unknown>, filter: FilterGroup): boolean {
  const results = filter.conditions.map((c) =>
    isGroup(c) ? evaluateFilter(record, c) : evaluateCondition(record, c),
  );

  return filter.logic === 'and'
    ? results.every(Boolean)
    : results.some(Boolean);
}

export function applyFilter<T extends Record<string, unknown>>(records: T[], filter: FilterGroup): T[] {
  return records.filter((r) => evaluateFilter(r, filter));
}

export function toSqlWhere(filter: FilterGroup, paramOffset = 0): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  function build(group: FilterGroup): string {
    const parts = group.conditions.map((c) => {
      if (isGroup(c)) return `(${build(c)})`;
      const idx = paramOffset + params.length + 1;
      switch (c.operator) {
        case 'eq': params.push(c.value); return `${c.field} = $${idx}`;
        case 'neq': params.push(c.value); return `${c.field} != $${idx}`;
        case 'gt': params.push(c.value); return `${c.field} > $${idx}`;
        case 'gte': params.push(c.value); return `${c.field} >= $${idx}`;
        case 'lt': params.push(c.value); return `${c.field} < $${idx}`;
        case 'lte': params.push(c.value); return `${c.field} <= $${idx}`;
        case 'contains': params.push(`%${c.value}%`); return `${c.field} ILIKE $${idx}`;
        case 'not_contains': params.push(`%${c.value}%`); return `${c.field} NOT ILIKE $${idx}`;
        case 'in': params.push(c.value); return `${c.field} = ANY($${idx})`;
        case 'not_in': params.push(c.value); return `${c.field} != ALL($${idx})`;
        case 'is_null': return `${c.field} IS NULL`;
        case 'is_not_null': return `${c.field} IS NOT NULL`;
      }
    });
    return parts.join(group.logic === 'and' ? ' AND ' : ' OR ');
  }
  return { sql: build(filter), params };
}
