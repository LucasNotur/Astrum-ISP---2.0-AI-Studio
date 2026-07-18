/**
 * Regressão do erro "cannot add `postgres_changes` callbacks ... after `subscribe()`":
 * o supabase-js reutiliza canais com o mesmo topic, então duas assinaturas simultâneas
 * do mesmo recurso (ex.: team_members do mesmo tenant) quebravam. O helper channel()
 * deve gerar um topic único por assinatura.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => {
  const created: string[] = [];
  const builder: any = {};
  ['select', 'eq', 'order', 'limit', 'in', 'gte', 'lte', 'single', 'maybeSingle'].forEach(
    (m) => (builder[m] = () => builder),
  );
  builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      __created: created,
      channel: (name: string) => {
        created.push(name);
        const ch: any = { topic: name };
        ch.on = () => ch;
        ch.subscribe = () => ch;
        return ch;
      },
      removeChannel: () => {},
      from: () => builder,
    },
  };
});

import { getCustomers } from './supabaseDb';
import { supabase } from './supabase';

describe('supabaseDb channel helper', () => {
  it('duas assinaturas do mesmo recurso criam canais com topics distintos', () => {
    const un1 = getCustomers(() => {}, 'tenant-1');
    const un2 = getCustomers(() => {}, 'tenant-1');

    const created = (supabase as any).__created as string[];
    expect(created).toHaveLength(2);
    expect(created[0]).not.toBe(created[1]);
    for (const name of created) {
      expect(name.startsWith('customers:tenant-1:')).toBe(true);
    }

    if (typeof un1 === 'function') un1();
    if (typeof un2 === 'function') un2();
  });
});
