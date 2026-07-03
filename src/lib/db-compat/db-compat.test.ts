import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock do supabaseAdmin (hoisted — sem variáveis externas) ────────────────
vi.mock('../supabaseAdmin', () => {
  const state: any = {
    rows: [] as any[],          // resultado de queries de lista
    single: null as any,        // resultado de maybeSingle
    error: null as any,         // erro a retornar
    errorOnce: null as any,     // erro só na primeira tentativa (self-healing)
    calls: [] as any[],         // registro de chamadas
  };

  function makeChain(table: string) {
    const chain: any = {
      _table: table,
      _ops: [] as any[],
      _payload: undefined as any,
    };
    const record = (op: string, args: any[]) => {
      chain._ops.push({ op, args });
      return chain;
    };
    for (const m of ['select', 'eq', 'neq', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'order', 'limit', 'range']) {
      chain[m] = (...args: any[]) => record(m, args);
    }
    for (const m of ['upsert', 'update', 'insert', 'delete']) {
      chain[m] = (...args: any[]) => {
        chain._payload = args[0];
        return record(m, args);
      };
    }
    chain.maybeSingle = async () => {
      state.calls.push({ table, ops: chain._ops, payload: chain._payload });
      if (state.error) return { data: null, error: state.error };
      return { data: state.single, error: null };
    };
    chain.then = (resolve: any) => {
      state.calls.push({ table, ops: chain._ops, payload: chain._payload });
      let error = state.error;
      if (state.errorOnce) {
        error = state.errorOnce;
        state.errorOnce = null;
      }
      return Promise.resolve({ data: error ? null : state.rows, error }).then(resolve);
    };
    return chain;
  }

  const supabaseAdmin = {
    from: (table: string) => makeChain(table),
    __state: state,
  };
  return { supabaseAdmin };
});

import { supabaseAdmin } from '../supabaseAdmin';
import { CompatFirestore, FieldValue, CompatTimestamp } from './index';
import { resolveRoute, toSnake, toCamel, isUuid } from './mapping';
import { resolveSentinels } from './fieldValues';
import { reviveTimestamps, serializeTimestamps } from './timestamp';

const state = (supabaseAdmin as any).__state;
const db = new CompatFirestore();
const UUID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  state.rows = [];
  state.single = null;
  state.error = null;
  state.errorOnce = null;
  state.calls = [];
});

const lastCall = () => state.calls[state.calls.length - 1];
const callsFor = (table: string) => state.calls.filter((c: any) => c.table === table);

// ─── mapping ─────────────────────────────────────────────────────────────────

describe('resolveRoute', () => {
  it('coleção nativa top-level → native', () => {
    expect(resolveRoute(['tickets'])).toMatchObject({ kind: 'native', table: 'tickets' });
    expect(resolveRoute(['knowledge_base'])).toMatchObject({ kind: 'native', table: 'knowledge_articles' });
    expect(resolveRoute(['audit_logs'])).toMatchObject({ kind: 'native', table: 'ai_performance_logs' });
  });

  it('doc UUID em tabela nativa → native; não-UUID → legacy', () => {
    expect(resolveRoute(['tickets', UUID])).toMatchObject({ kind: 'native' });
    expect(resolveRoute(['tenants', 'DEFAULT_TENANT'])).toMatchObject({ kind: 'legacy' });
  });

  it('tickets/{id}/messages → messages com ticket_id fixo', () => {
    expect(resolveRoute(['tickets', UUID, 'messages'])).toMatchObject({
      kind: 'native', table: 'messages', fixedFilters: { ticket_id: UUID },
    });
  });

  it('tenants/{id}/settings/theme → tenantColumn', () => {
    expect(resolveRoute(['tenants', UUID, 'settings', 'theme'])).toMatchObject({
      kind: 'tenantColumn', tenantId: UUID, column: 'theme',
    });
  });

  it('tenants/{id}/integration_keys/default → tenantColumn objeto', () => {
    expect(resolveRoute(['tenants', UUID, 'integration_keys', 'default'])).toMatchObject({
      kind: 'tenantColumn', column: 'integration_keys', isArray: false,
    });
  });

  it('tenants/{id}/departments → tenantColumn array', () => {
    expect(resolveRoute(['tenants', UUID, 'departments'])).toMatchObject({
      kind: 'tenantColumn', column: 'departments', isArray: true,
    });
  });

  it('coleção sem tabela → legacy', () => {
    expect(resolveRoute(['ai_personas'])).toMatchObject({ kind: 'legacy' });
    expect(resolveRoute(['tenants', UUID, 'operators'])).toMatchObject({ kind: 'legacy' });
  });
});

describe('conversão de nomes', () => {
  it('toSnake / toCamel', () => {
    expect(toSnake('customerId')).toBe('customer_id');
    expect(toSnake('aiEnabled')).toBe('ai_enabled');
    expect(toCamel('created_at')).toBe('createdAt');
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid('abc')).toBe(false);
  });
});

// ─── timestamps ──────────────────────────────────────────────────────────────

describe('CompatTimestamp', () => {
  it('roundtrip fromDate/toDate/toMillis', () => {
    const d = new Date('2026-07-03T12:00:00.000Z');
    const ts = CompatTimestamp.fromDate(d);
    expect(ts.toDate().getTime()).toBe(d.getTime());
    expect(ts.toMillis()).toBe(d.getTime());
    expect(+ts).toBe(d.getTime());               // valueOf p/ new Date(ts)
    expect(JSON.stringify(ts)).toBe(`"${d.toISOString()}"`);
  });

  it('reviveTimestamps converte ISO strings em profundidade', () => {
    const out = reviveTimestamps({ createdAt: '2026-07-03T12:00:00.000Z', nested: { at: '2026-01-01T00:00:00Z' }, name: 'x' });
    expect(out.createdAt).toBeInstanceOf(CompatTimestamp);
    expect(out.nested.at).toBeInstanceOf(CompatTimestamp);
    expect(out.name).toBe('x');
  });

  it('serializeTimestamps converte Date/CompatTimestamp em ISO', () => {
    const out = serializeTimestamps({ a: new Date('2026-07-03T12:00:00Z'), b: CompatTimestamp.fromISO('2026-01-01T00:00:00Z') });
    expect(typeof out.a).toBe('string');
    expect(typeof out.b).toBe('string');
  });
});

// ─── sentinels ───────────────────────────────────────────────────────────────

describe('FieldValue sentinels', () => {
  it('serverTimestamp vira ISO', () => {
    const out = resolveSentinels({ at: FieldValue.serverTimestamp() });
    expect(typeof out.at).toBe('string');
    expect(out.at).toMatch(/^\d{4}-/);
  });

  it('increment soma sobre o existente', () => {
    const out = resolveSentinels({ n: FieldValue.increment(5) }, { n: 10 });
    expect(out.n).toBe(15);
  });

  it('arrayUnion/arrayRemove', () => {
    expect(resolveSentinels({ a: FieldValue.arrayUnion('x', 'y') }, { a: ['x'] }).a).toEqual(['x', 'y']);
    expect(resolveSentinels({ a: FieldValue.arrayRemove('x') }, { a: ['x', 'y'] }).a).toEqual(['y']);
  });

  it('delete vira null', () => {
    expect(resolveSentinels({ a: FieldValue.delete() }).a).toBeNull();
  });
});

// ─── DocRef nativo ───────────────────────────────────────────────────────────

describe('DocRef (tabela nativa)', () => {
  it('get retorna snapshot camelCase com timestamps revividos', async () => {
    state.single = { id: UUID, customer_id: 'c1', created_at: '2026-07-03T12:00:00.000Z', extra: { legacyFlag: true } };
    const snap = await db.collection('tickets').doc(UUID).get();
    expect(snap.exists).toBe(true);
    expect(snap.id).toBe(UUID);
    expect(snap.data()!.customerId).toBe('c1');
    expect(snap.data()!.createdAt).toBeInstanceOf(CompatTimestamp);
    expect(snap.data()!.legacyFlag).toBe(true);   // extra fundido
    expect(snap.data()!.id).toBeUndefined();
  });

  it('get de doc inexistente → exists=false', async () => {
    state.single = null;
    const snap = await db.collection('tickets').doc(UUID).get();
    expect(snap.exists).toBe(false);
    expect(snap.data()).toBeUndefined();
  });

  it('set grava snake_case com id via upsert', async () => {
    await db.collection('tickets').doc(UUID).set({ customerId: 'c1', aiEnabled: true });
    const call = lastCall();
    expect(call.table).toBe('tickets');
    expect(call.ops.some((o: any) => o.op === 'upsert')).toBe(true);
    expect(call.payload).toMatchObject({ id: UUID, customer_id: 'c1', ai_enabled: true });
  });

  it('update grava snake_case via update+eq', async () => {
    await db.collection('customers').doc(UUID).update({ financialStatus: 'ok' });
    const call = lastCall();
    expect(call.payload).toMatchObject({ financial_status: 'ok' });
    expect(call.ops.some((o: any) => o.op === 'eq' && o.args[0] === 'id')).toBe(true);
  });

  it('serverTimestamp resolvido na escrita', async () => {
    await db.collection('tickets').doc(UUID).update({ updatedAt: FieldValue.serverTimestamp() });
    expect(typeof lastCall().payload.updated_at).toBe('string');
  });

  it('self-healing: coluna desconhecida vai para extra e a escrita é repetida', async () => {
    state.errorOnce = { message: "Could not find the 'campo_estranho' column of 'tickets' in the schema cache" };
    await db.collection('tickets').doc(UUID).set({ campoEstranho: 1, subject: 'oi' });
    const calls = callsFor('tickets');
    expect(calls.length).toBe(2);                              // falhou + retry
    const retry = calls[1];
    expect(retry.payload.campo_estranho).toBeUndefined();      // saiu do topo
    expect(retry.payload.extra).toMatchObject({ campo_estranho: 1 });
    expect(retry.payload.subject).toBe('oi');
  });

  it('add gera UUID e grava', async () => {
    const ref = await db.collection('customers').add({ name: 'Maria' });
    expect(isUuid(ref.id)).toBe(true);
    expect(lastCall().payload).toMatchObject({ name: 'Maria', id: ref.id });
  });

  it('delete emite delete+eq', async () => {
    await db.collection('tickets').doc(UUID).delete();
    const call = lastCall();
    expect(call.ops.some((o: any) => o.op === 'delete')).toBe(true);
  });
});

// ─── Query nativa ────────────────────────────────────────────────────────────

describe('Query (tabela nativa)', () => {
  it('where == vira eq com snake_case; null vira is', async () => {
    state.rows = [];
    await db.collection('tickets')
      .where('tenantId', '==', 't1')
      .where('assignedTo', '==', null)
      .get();
    const ops = lastCall().ops;
    expect(ops.some((o: any) => o.op === 'eq' && o.args[0] === 'tenant_id' && o.args[1] === 't1')).toBe(true);
    expect(ops.some((o: any) => o.op === 'is' && o.args[0] === 'assigned_to')).toBe(true);
  });

  it('orderBy/limit traduzidos', async () => {
    await db.collection('tickets').orderBy('createdAt', 'desc').limit(10).get();
    const ops = lastCall().ops;
    expect(ops.some((o: any) => o.op === 'order' && o.args[0] === 'created_at')).toBe(true);
    expect(ops.some((o: any) => o.op === 'limit' && o.args[0] === 10)).toBe(true);
  });

  it('snapshot expõe empty/size/forEach/docs com ref', async () => {
    state.rows = [{ id: UUID, subject: 'a', extra: {} }];
    const snap = await db.collection('tickets').get();
    expect(snap.empty).toBe(false);
    expect(snap.size).toBe(1);
    const seen: string[] = [];
    snap.forEach(d => seen.push(d.id));
    expect(seen).toEqual([UUID]);
    expect(snap.docs[0].ref.path).toBe(`tickets/${UUID}`);
  });

  it('count() retorna contagem', async () => {
    state.rows = [{ id: UUID, extra: {} }, { id: UUID.replace('1', '2'), extra: {} }];
    const c = await db.collection('tickets').where('tenantId', '==', 't1').count().get();
    expect(c.data().count).toBe(2);
  });

  it('subcoleção messages aplica ticket_id fixo', async () => {
    await db.collection('tickets').doc(UUID).collection('messages').get();
    const ops = lastCall().ops;
    expect(lastCall().table).toBe('messages');
    expect(ops.some((o: any) => o.op === 'eq' && o.args[0] === 'ticket_id' && o.args[1] === UUID)).toBe(true);
  });
});

// ─── legacy_docs ─────────────────────────────────────────────────────────────

describe('legacy_docs fallback', () => {
  it('set em coleção sem tabela grava em legacy_docs com path', async () => {
    await db.collection('ai_personas').doc('persona-1').set({ nome: 'Luna' });
    const call = callsFor('legacy_docs').pop();
    expect(call.payload).toMatchObject({
      path: 'ai_personas/persona-1',
      collection: 'ai_personas',
      parent_path: null,
    });
    expect(call.payload.data).toMatchObject({ nome: 'Luna' });
  });

  it('subcoleção legacy tem parent_path', async () => {
    await db.collection('tenants').doc('t1').collection('operators').doc('op1').set({ status: 'online' });
    const call = callsFor('legacy_docs').pop();
    expect(call.payload.parent_path).toBe('tenants/t1');
    expect(call.payload.collection).toBe('operators');
  });

  it('query legacy filtra em JS', async () => {
    state.rows = [
      { path: 'ai_personas/a', data: { status: 'online', n: 1 } },
      { path: 'ai_personas/b', data: { status: 'offline', n: 2 } },
    ];
    const snap = await db.collection('ai_personas').where('status', '==', 'online').get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0].id).toBe('a');
  });
});

// ─── batch e transaction ─────────────────────────────────────────────────────

describe('WriteBatch / runTransaction', () => {
  it('batch executa operações na ordem', async () => {
    const batch = db.batch();
    batch.set(db.collection('tickets').doc(UUID), { subject: 'a' });
    batch.update(db.collection('customers').doc(UUID), { name: 'b' });
    batch.delete(db.collection('tickets').doc(UUID));
    await batch.commit();
    const tables = state.calls.map((c: any) => c.table);
    expect(tables).toEqual(['tickets', 'customers', 'tickets']);
  });

  it('runTransaction executa callback com get/update', async () => {
    state.single = { id: UUID, extra: {} };
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(db.collection('tickets').doc(UUID));
      expect(snap.exists).toBe(true);
      tx.update(db.collection('tickets').doc(UUID), { status: 'closed' });
      return 'ok';
    });
    expect(result).toBe('ok');
  });
});
