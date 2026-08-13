import { describe, it, expect, beforeEach } from 'vitest';
import {
  listPersonas,
  createPersona,
  updatePersona,
  deletePersona,
  sanitizePersonaInput,
  PersonaValidationError,
  type PersonaStore,
  type PersonaRow,
  type PersonaFields,
} from './personas.service';

/** Store em memória espelhando o legacy_docs (id + data). */
function memStore(seed: PersonaRow[] = []) {
  const map = new Map<string, PersonaFields>();
  for (const r of seed) map.set(r.id, r.data);
  const store: PersonaStore & { _map: Map<string, PersonaFields> } = {
    _map: map,
    async listByTenant(tenantId) {
      return [...map.entries()]
        .filter(([, d]) => d.tenant_id === tenantId)
        .map(([id, data]) => ({ id, data }));
    },
    async getById(id) {
      return map.has(id) ? { id, data: map.get(id)! } : null;
    },
    async upsert(id, data) { map.set(id, data); },
    async remove(id) { map.delete(id); },
  };
  return store;
}

let seq = 0;
const opts = { genId: () => `p${++seq}`, now: () => '2026-08-13T00:00:00.000Z' };

beforeEach(() => { seq = 0; });

describe('sanitizePersonaInput', () => {
  it('exige nome e força o tenant do JWT (ignora tenant_id do body)', () => {
    const out = sanitizePersonaInput({ name: 'Maria', tenant_id: 'ATTACKER' }, 't1');
    expect(out.name).toBe('Maria');
    expect(out.tenant_id).toBe('t1');
  });

  it('rejeita nome vazio', () => {
    expect(() => sanitizePersonaInput({ name: '   ' }, 't1')).toThrow(PersonaValidationError);
  });

  it('rejeita instruções acima de 2000 chars', () => {
    expect(() => sanitizePersonaInput({ name: 'X', custom_instructions: 'a'.repeat(2001) }, 't1'))
      .toThrow(/2000/);
  });

  it('faz fallback de tone/level inválidos e clampa a temperatura', () => {
    const out = sanitizePersonaInput({ name: 'X', tone: 'evil', language_level: 'zzz', temperature: 9 }, 't1');
    expect(out.tone).toBe('formal');
    expect(out.language_level).toBe('simple');
    expect(out.temperature).toBe(2);
  });
});

describe('createPersona', () => {
  it('cria e devolve id, com timestamps', async () => {
    const store = memStore();
    const { id } = await createPersona(store, 't1', { name: 'Bot' }, opts);
    expect(id).toBe('p1');
    const row = await store.getById('p1');
    expect(row?.data.name).toBe('Bot');
    expect(row?.data.created_at).toBe('2026-08-13T00:00:00.000Z');
  });

  it('ao criar default, tira o default das outras do tenant', async () => {
    const store = memStore([
      { id: 'old', data: { tenant_id: 't1', name: 'Old', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: true } },
    ]);
    await createPersona(store, 't1', { name: 'New', is_default: true }, opts);
    expect((await store.getById('old'))?.data.is_default).toBe(false);
    expect((await store.getById('p1'))?.data.is_default).toBe(true);
  });

  it('não mexe no default de OUTRO tenant', async () => {
    const store = memStore([
      { id: 'o', data: { tenant_id: 't2', name: 'Other', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: true } },
    ]);
    await createPersona(store, 't1', { name: 'Mine', is_default: true }, opts);
    expect((await store.getById('o'))?.data.is_default).toBe(true);
  });
});

describe('listPersonas', () => {
  it('só devolve personas do tenant', async () => {
    const store = memStore([
      { id: 'a', data: { tenant_id: 't1', name: 'A', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false } },
      { id: 'b', data: { tenant_id: 't2', name: 'B', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false } },
    ]);
    const list = await listPersonas(store, 't1');
    expect(list.map((p) => p.id)).toEqual(['a']);
  });
});

describe('updatePersona', () => {
  it('atualiza e preserva created_at', async () => {
    const store = memStore([
      { id: 'a', data: { tenant_id: 't1', name: 'A', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false, created_at: 'ORIG' } },
    ]);
    await updatePersona(store, 't1', 'a', { name: 'A2' }, opts);
    const row = await store.getById('a');
    expect(row?.data.name).toBe('A2');
    expect(row?.data.created_at).toBe('ORIG');
    expect(row?.data.updated_at).toBe('2026-08-13T00:00:00.000Z');
  });

  it('bloqueia editar persona de outro tenant', async () => {
    const store = memStore([
      { id: 'a', data: { tenant_id: 't2', name: 'A', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false } },
    ]);
    await expect(updatePersona(store, 't1', 'a', { name: 'hack' }, opts)).rejects.toThrow(/não encontrada/i);
    expect((await store.getById('a'))?.data.name).toBe('A');
  });
});

describe('deletePersona', () => {
  it('remove a persona do próprio tenant', async () => {
    const store = memStore([
      { id: 'a', data: { tenant_id: 't1', name: 'A', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false } },
    ]);
    await deletePersona(store, 't1', 'a');
    expect(await store.getById('a')).toBeNull();
  });

  it('bloqueia remover persona de outro tenant', async () => {
    const store = memStore([
      { id: 'a', data: { tenant_id: 't2', name: 'A', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false } },
    ]);
    await expect(deletePersona(store, 't1', 'a')).rejects.toThrow(/não encontrada/i);
    expect(await store.getById('a')).not.toBeNull();
  });
});
