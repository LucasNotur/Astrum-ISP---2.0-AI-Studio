/**
 * FZ-1 — Fachada com a API do Firestore Admin SDK persistindo no Supabase.
 * Consumida via src/lib/firebaseAdmin.ts (seam) por ~50 arquivos do backend legado
 * que NÃO são editados. Ver .astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md.
 *
 * Logs: namespace [db-compat]. Fallbacks são WARN (meta: zerá-los), erros são ERROR.
 */
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin';
import {
  resolveRoute,
  Route,
  keysToSnake,
  keysToCamel,
  toSnake,
  setRouteLogger,
} from './mapping';
import {
  isSentinel,
  needsExistingDoc,
  resolveSentinels,
  FieldValue,
} from './fieldValues';
import {
  CompatTimestamp,
  reviveTimestamps,
  serializeTimestamps,
} from './timestamp';

const log = {
  warn: (msg: string, meta?: any) => console.warn(`[db-compat] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: any) => console.error(`[db-compat] ${msg}`, meta ?? ''),
};

// Fallbacks para legacy_docs são logados uma vez por (path-shape, reason)
const loggedFallbacks = new Set<string>();
setRouteLogger(({ path, reason }) => {
  const shape = path.replace(/\/[0-9a-f-]{8,}(\/|$)/gi, '/*$1');
  const key = `${shape}|${reason}`;
  if (!loggedFallbacks.has(key)) {
    loggedFallbacks.add(key);
    log.warn(`fallback legacy_docs: ${shape} (${reason})`);
  }
});

// Colunas ausentes aprendidas em runtime (self-healing PGRST204 → extra JSONB)
const learnedMissing = new Map<string, Set<string>>();

function missingSetFor(table: string): Set<string> {
  let s = learnedMissing.get(table);
  if (!s) { s = new Set(); learnedMissing.set(table, s); }
  return s;
}

/** Extrai o nome da coluna de um erro PGRST204 do PostgREST. */
function missingColumnFrom(error: any): string | null {
  const msg: string = error?.message ?? '';
  const m = msg.match(/Could not find the '([^']+)' column/i)
    ?? msg.match(/column "([^"]+)" .* does not exist/i);
  return m ? m[1] : null;
}

/** Move chaves conhecidas-ausentes para extra e retorna o payload pronto. */
function splitExtra(table: string, row: Record<string, any>): Record<string, any> {
  const missing = missingSetFor(table);
  if (missing.size === 0) return row;
  const out: Record<string, any> = {};
  const extra: Record<string, any> = { ...(row.extra ?? {}) };
  let hasExtra = Object.keys(extra).length > 0;
  for (const [k, v] of Object.entries(row)) {
    if (k === 'extra') continue;
    if (missing.has(k)) { extra[k] = v; hasExtra = true; }
    else out[k] = v;
  }
  if (hasExtra) out.extra = extra;
  return out;
}

/** Executa uma escrita com retry self-healing: PGRST204 → aprende coluna → extra. */
async function writeWithHealing(
  table: string,
  attempt: (payload: Record<string, any>) => PromiseLike<{ error: any }>,
  payload: Record<string, any>,
): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const body = splitExtra(table, payload);
    const { error } = await attempt(body);
    if (!error) return;
    const col = missingColumnFrom(error);
    if (col && col !== 'extra') {
      missingSetFor(table).add(col);
      log.warn(`coluna '${col}' inexistente em '${table}' → movida para extra (aprendido)`);
      continue;
    }
    log.error(`escrita falhou em '${table}': ${error.message}`, { payloadKeys: Object.keys(payload) });
    throw new Error(`[db-compat] ${table}: ${error.message}`);
  }
  throw new Error(`[db-compat] ${table}: excesso de colunas desconhecidas`);
}

/** Linha nativa → objeto de documento (camelCase + timestamps + extra fundido). */
function rowToDocData(row: Record<string, any>): Record<string, any> {
  const { id: _id, extra, ...rest } = row;
  const merged = { ...keysToCamel(rest), ...(extra && typeof extra === 'object' ? extra : {}) };
  return reviveTimestamps(merged);
}

/** Dados de documento → linha nativa (snake_case + ISO strings). */
function docDataToRow(data: Record<string, any>): Record<string, any> {
  return keysToSnake(serializeTimestamps(data));
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export class DocSnap {
  constructor(
    public readonly id: string,
    private readonly _data: Record<string, any> | undefined,
    public readonly ref: DocRef,
  ) {}

  get exists(): boolean {
    return this._data !== undefined;
  }

  // `any` deliberado: espelha a tipagem frouxa de DocumentData do SDK Firestore,
  // para que os ~50 consumidores legados compilem sem edição.
  data(): any {
    return this._data;
  }

  get(field: string): any {
    return this._data?.[field];
  }
}

export class QuerySnap {
  constructor(public readonly docs: DocSnap[]) {}
  get empty(): boolean { return this.docs.length === 0; }
  get size(): number { return this.docs.length; }
  forEach(cb: (doc: DocSnap) => void): void { this.docs.forEach(cb); }
}

// ─── Filtros em JS (fallback e legacy_docs) ─────────────────────────────────

type Filter = { field: string; op: string; value: any };
type Order = { field: string; dir: 'asc' | 'desc' };

function normalize(v: any): any {
  if (v instanceof CompatTimestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return v;
}

function matchesOp(docVal: any, op: string, val: any): boolean {
  const a = normalize(docVal);
  const b = normalize(val);
  switch (op) {
    case '==': return a === b || (a == null && b == null);
    case '!=': return !(a === b || (a == null && b == null));
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case 'in': return Array.isArray(val) && val.map(normalize).includes(a);
    case 'array-contains':
      return Array.isArray(docVal) && docVal.some(x => JSON.stringify(x) === JSON.stringify(val));
    default:
      log.error(`operador where não suportado: '${op}'`);
      return false;
  }
}

function applyJsQuery(
  docs: DocSnap[],
  filters: Filter[],
  orders: Order[],
  offset: number,
  limit: number | null,
): DocSnap[] {
  let out = docs.filter(d => filters.every(f => matchesOp(d.data()?.[f.field], f.op, f.value)));
  for (const o of [...orders].reverse()) {
    out = out.sort((x, y) => {
      const a = normalize(x.data()?.[o.field]);
      const b = normalize(y.data()?.[o.field]);
      const cmp = a < b ? -1 : a > b ? 1 : 0;
      return o.dir === 'desc' ? -cmp : cmp;
    });
  }
  if (offset > 0) out = out.slice(offset);
  if (limit !== null) out = out.slice(0, limit);
  return out;
}

// ─── legacy_docs helpers ─────────────────────────────────────────────────────

async function legacyGetDoc(path: string): Promise<Record<string, any> | undefined> {
  const { data, error } = await supabaseAdmin
    .from('legacy_docs').select('data').eq('path', path).maybeSingle();
  if (error) {
    log.error(`legacy get ${path}: ${error.message}`);
    return undefined;
  }
  return data ? reviveTimestamps(data.data) : undefined;
}

async function legacySetDoc(path: string, segments: string[], data: Record<string, any>, merge: boolean): Promise<void> {
  const collection = segments[segments.length - 2];
  const parentPath = segments.length > 2 ? segments.slice(0, -2).join('/') : null;
  let body = serializeTimestamps(data);
  if (merge || needsExistingDoc(data)) {
    const existing = (await legacyGetDoc(path)) ?? {};
    body = resolveSentinels(body, serializeTimestamps(existing));
    if (merge) body = { ...serializeTimestamps(existing), ...body };
  } else {
    body = resolveSentinels(body);
  }
  const { error } = await supabaseAdmin.from('legacy_docs').upsert({
    path, collection, parent_path: parentPath, data: body, updated_at: new Date().toISOString(),
  });
  if (error) {
    log.error(`legacy set ${path}: ${error.message}`);
    throw new Error(`[db-compat] legacy_docs: ${error.message}`);
  }
}

async function legacyListCollection(segments: string[]): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const collection = segments[segments.length - 1];
  const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null;
  let q = supabaseAdmin.from('legacy_docs').select('path,data').eq('collection', collection);
  q = parentPath === null ? q.is('parent_path', null) : q.eq('parent_path', parentPath);
  const { data, error } = await q.limit(2000);
  if (error) {
    log.error(`legacy list ${segments.join('/')}: ${error.message}`);
    return [];
  }
  return (data ?? []).map(r => ({
    id: r.path.split('/').pop()!,
    data: reviveTimestamps(r.data),
  }));
}

// ─── tenantColumn helpers (colunas JSONB na linha do tenant) ────────────────

async function tenantColumnGet(tenantId: string, column: string): Promise<any> {
  const { data, error } = await supabaseAdmin
    .from('tenants').select(column).eq('id', tenantId).maybeSingle();
  if (error) {
    log.error(`tenantColumn get tenants.${column}: ${error.message}`);
    return undefined;
  }
  return (data as any)?.[column] ?? undefined;
}

async function tenantColumnSet(tenantId: string, column: string, value: any): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tenants').update({ [column]: serializeTimestamps(value) }).eq('id', tenantId);
  if (error) {
    log.error(`tenantColumn set tenants.${column}: ${error.message}`);
    throw new Error(`[db-compat] tenants.${column}: ${error.message}`);
  }
}

// ─── DocRef ──────────────────────────────────────────────────────────────────

export class DocRef {
  readonly id: string;
  constructor(private readonly segments: string[]) {
    this.id = segments[segments.length - 1];
  }

  get path(): string {
    return this.segments.join('/');
  }

  collection(name: string): CollectionRef {
    return new CollectionRef([...this.segments, ...name.split('/').filter(Boolean)]);
  }

  private route(): Route {
    return resolveRoute(this.segments);
  }

  async get(): Promise<DocSnap> {
    const route = this.route();

    if (route.kind === 'native') {
      let q = supabaseAdmin.from(route.table).select('*').eq('id', this.id);
      for (const [col, val] of Object.entries(route.fixedFilters)) q = q.eq(col, val);
      const { data, error } = await q.maybeSingle();
      if (error) {
        log.error(`get ${this.path}: ${error.message}`);
        return new DocSnap(this.id, undefined, this);
      }
      return new DocSnap(this.id, data ? rowToDocData(data) : undefined, this);
    }

    if (route.kind === 'tenantColumn') {
      const value = await tenantColumnGet(route.tenantId, route.column);
      if (value === undefined || value === null) return new DocSnap(this.id, undefined, this);
      if (route.isArray && Array.isArray(value)) {
        const item = value.find((x: any) => x?.id === this.id);
        return new DocSnap(this.id, item ? reviveTimestamps(item) : undefined, this);
      }
      // objeto único (theme, integration_keys, …): o doc É a coluna
      return new DocSnap(this.id, reviveTimestamps(value), this);
    }

    const data = await legacyGetDoc(this.path);
    return new DocSnap(this.id, data, this);
  }

  async set(data: Record<string, any>, opts: { merge?: boolean } = {}): Promise<void> {
    const route = this.route();

    if (route.kind === 'native') {
      let resolved = data;
      if (needsExistingDoc(data)) {
        const snap = await this.get();
        resolved = resolveSentinels(data, snap.data() ?? {});
      } else {
        resolved = resolveSentinels(data);
      }
      const row = { ...docDataToRow(resolved), id: this.id, ...route.fixedFilters };
      // upsert do PostgREST só grava as colunas fornecidas — compatível com merge.
      // set() sem merge no Firestore apagaria campos omitidos; divergência aceita e documentada.
      await writeWithHealing(route.table, p => supabaseAdmin.from(route.table).upsert(p), row);
      return;
    }

    if (route.kind === 'tenantColumn') {
      const current = await tenantColumnGet(route.tenantId, route.column);
      const resolved = resolveSentinels(serializeTimestamps(data), serializeTimestamps(current ?? {}));
      if (route.isArray) {
        const arr: any[] = Array.isArray(current) ? [...current] : [];
        const idx = arr.findIndex((x: any) => x?.id === this.id);
        const item = { ...(idx >= 0 && opts.merge ? arr[idx] : {}), ...resolved, id: this.id };
        if (idx >= 0) arr[idx] = item; else arr.push(item);
        await tenantColumnSet(route.tenantId, route.column, arr);
      } else {
        const value = opts.merge && current && typeof current === 'object'
          ? { ...current, ...resolved }
          : resolved;
        await tenantColumnSet(route.tenantId, route.column, value);
      }
      return;
    }

    await legacySetDoc(this.path, this.segments, data, opts.merge ?? false);
  }

  async update(data: Record<string, any>): Promise<void> {
    const route = this.route();

    if (route.kind === 'native') {
      let resolved = data;
      if (needsExistingDoc(data)) {
        const snap = await this.get();
        resolved = resolveSentinels(data, snap.data() ?? {});
      } else {
        resolved = resolveSentinels(data);
      }
      const row = docDataToRow(resolved);
      await writeWithHealing(
        route.table,
        p => supabaseAdmin.from(route.table).update(p).eq('id', this.id),
        row,
      );
      return;
    }

    // tenantColumn e legacy: update = set com merge
    await this.set(data, { merge: true });
  }

  async delete(): Promise<void> {
    const route = this.route();

    if (route.kind === 'native') {
      const { error } = await supabaseAdmin.from(route.table).delete().eq('id', this.id);
      if (error) log.error(`delete ${this.path}: ${error.message}`);
      return;
    }

    if (route.kind === 'tenantColumn') {
      const current = await tenantColumnGet(route.tenantId, route.column);
      if (route.isArray && Array.isArray(current)) {
        await tenantColumnSet(route.tenantId, route.column, current.filter((x: any) => x?.id !== this.id));
      } else {
        await tenantColumnSet(route.tenantId, route.column, null);
      }
      return;
    }

    const { error } = await supabaseAdmin.from('legacy_docs').delete().eq('path', this.path);
    if (error) log.error(`legacy delete ${this.path}: ${error.message}`);
  }
}

// ─── Query / CollectionRef ───────────────────────────────────────────────────

export class Query {
  protected filters: Filter[] = [];
  protected orders: Order[] = [];
  protected _limit: number | null = null;
  protected _offset = 0;

  constructor(protected readonly segments: string[]) {}

  get path(): string {
    return this.segments.join('/');
  }

  private clone(): Query {
    const q = new Query(this.segments);
    q.filters = [...this.filters];
    q.orders = [...this.orders];
    q._limit = this._limit;
    q._offset = this._offset;
    return q;
  }

  where(field: string, op: string, value: any): Query {
    const q = this.clone();
    q.filters.push({ field, op, value });
    return q;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Query {
    const q = this.clone();
    q.orders.push({ field, dir });
    return q;
  }

  limit(n: number): Query {
    const q = this.clone();
    q._limit = n;
    return q;
  }

  offset(n: number): Query {
    const q = this.clone();
    q._offset = n;
    return q;
  }

  count(): { get: () => Promise<{ data: () => { count: number } }> } {
    return {
      get: async () => {
        const snap = await this.get();
        return { data: () => ({ count: snap.size }) };
      },
    };
  }

  async get(): Promise<QuerySnap> {
    const route = resolveRoute(this.segments);

    if (route.kind === 'native') {
      const pushed = await this.execNative(route);
      if (pushed) return pushed;
      // Fallback: busca ampla + engine JS (pushdown falhou — coluna desconhecida etc.)
      const broad = await this.execNativeBroad(route);
      return broad;
    }

    if (route.kind === 'tenantColumn') {
      const value = await tenantColumnGet(route.tenantId, route.column);
      const items: any[] = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
          ? Object.entries(value).map(([id, v]) => (typeof v === 'object' ? { id, ...v } : { id, value: v }))
          : [];
      const docs = items.map((item, i) => {
        const id = item?.id ?? String(i);
        return new DocSnap(id, reviveTimestamps(item), new DocRef([...this.segments, id]));
      });
      return new QuerySnap(applyJsQuery(docs, this.filters, this.orders, this._offset, this._limit));
    }

    const rows = await legacyListCollection(this.segments);
    const docs = rows.map(r => new DocSnap(r.id, r.data, new DocRef([...this.segments, r.id])));
    return new QuerySnap(applyJsQuery(docs, this.filters, this.orders, this._offset, this._limit));
  }

  private async execNative(route: Extract<Route, { kind: 'native' }>): Promise<QuerySnap | null> {
    let q = supabaseAdmin.from(route.table).select('*');
    for (const [col, val] of Object.entries(route.fixedFilters)) q = q.eq(col, val);

    for (const f of this.filters) {
      const col = toSnake(f.field);
      const val = serializeTimestamps(normalize(f.value) === f.value ? f.value : f.value);
      switch (f.op) {
        case '==': q = val === null ? q.is(col, null) : q.eq(col, serializeTimestamps(f.value)); break;
        case '!=': q = val === null ? q.not(col, 'is', null) : q.neq(col, serializeTimestamps(f.value)); break;
        case '>': q = q.gt(col, serializeTimestamps(f.value)); break;
        case '>=': q = q.gte(col, serializeTimestamps(f.value)); break;
        case '<': q = q.lt(col, serializeTimestamps(f.value)); break;
        case '<=': q = q.lte(col, serializeTimestamps(f.value)); break;
        case 'in': q = q.in(col, (f.value ?? []).map((v: any) => serializeTimestamps(v))); break;
        case 'array-contains': q = q.contains(col, [serializeTimestamps(f.value)]); break;
        default:
          log.error(`where op '${f.op}' sem tradução — usando fallback JS (${this.path})`);
          return null;
      }
    }

    for (const o of this.orders) q = q.order(toSnake(o.field), { ascending: o.dir !== 'desc' });

    if (this._offset > 0) {
      const end = this._limit !== null ? this._offset + this._limit - 1 : this._offset + 999;
      q = q.range(this._offset, end);
    } else if (this._limit !== null) {
      q = q.limit(this._limit);
    }

    const { data, error } = await q;
    if (error) {
      log.warn(`pushdown falhou em ${this.path} (${error.message}) — fallback JS`);
      return null;
    }
    const docs = (data ?? []).map(row =>
      new DocSnap(row.id, rowToDocData(row), new DocRef([...this.segments, row.id])),
    );
    return new QuerySnap(docs);
  }

  private async execNativeBroad(route: Extract<Route, { kind: 'native' }>): Promise<QuerySnap> {
    let q = supabaseAdmin.from(route.table).select('*');
    for (const [col, val] of Object.entries(route.fixedFilters)) q = q.eq(col, val);
    const { data, error } = await q.limit(2000);
    if (error) {
      log.error(`busca ampla falhou em ${this.path}: ${error.message}`);
      return new QuerySnap([]);
    }
    const docs = (data ?? []).map(row =>
      new DocSnap(row.id, rowToDocData(row), new DocRef([...this.segments, row.id])),
    );
    return new QuerySnap(applyJsQuery(docs, this.filters, this.orders, this._offset, this._limit));
  }
}

export class CollectionRef extends Query {
  readonly id: string;

  constructor(segments: string[]) {
    super(segments);
    this.id = segments[segments.length - 1];
  }

  doc(id?: string): DocRef {
    return new DocRef([...this.segments, id ?? randomUUID()]);
  }

  async add(data: Record<string, any>): Promise<DocRef> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

// ─── WriteBatch / Transaction ────────────────────────────────────────────────

type BatchOp =
  | { kind: 'set'; ref: DocRef; data: Record<string, any>; opts?: { merge?: boolean } }
  | { kind: 'update'; ref: DocRef; data: Record<string, any> }
  | { kind: 'delete'; ref: DocRef };

export class WriteBatch {
  private ops: BatchOp[] = [];

  set(ref: DocRef, data: Record<string, any>, opts?: { merge?: boolean }): WriteBatch {
    this.ops.push({ kind: 'set', ref, data, opts });
    return this;
  }

  update(ref: DocRef, data: Record<string, any>): WriteBatch {
    this.ops.push({ kind: 'update', ref, data });
    return this;
  }

  delete(ref: DocRef): WriteBatch {
    this.ops.push({ kind: 'delete', ref });
    return this;
  }

  async commit(): Promise<void> {
    // Execução sequencial: sem atomicidade multi-doc do Firestore (risco aceito — §3 do plano)
    for (const op of this.ops) {
      if (op.kind === 'set') await op.ref.set(op.data, op.opts);
      else if (op.kind === 'update') await op.ref.update(op.data);
      else await op.ref.delete();
    }
    this.ops = [];
  }
}

let txWarned = false;

export class CompatFirestore {
  collection(name: string): CollectionRef {
    return new CollectionRef(name.split('/').filter(Boolean));
  }

  doc(path: string): DocRef {
    return new DocRef(path.split('/').filter(Boolean));
  }

  batch(): WriteBatch {
    return new WriteBatch();
  }

  /**
   * Best-effort: executa o callback com leituras normais e escritas imediatas.
   * NÃO tem a atomicidade/lock otimista do Firestore (risco documentado no plano §3).
   */
  async runTransaction<T>(cb: (tx: CompatTransaction) => Promise<T>): Promise<T> {
    if (!txWarned) {
      txWarned = true;
      log.warn('runTransaction é best-effort (sem atomicidade multi-doc) — ver plano FZ §3');
    }
    return cb(new CompatTransaction());
  }
}

export class CompatTransaction {
  async get(refOrQuery: DocRef | Query): Promise<any> {
    return refOrQuery.get();
  }
  set(ref: DocRef, data: Record<string, any>, opts?: { merge?: boolean }): CompatTransaction {
    void ref.set(data, opts);
    return this;
  }
  update(ref: DocRef, data: Record<string, any>): CompatTransaction {
    void ref.update(data);
    return this;
  }
  delete(ref: DocRef): CompatTransaction {
    void ref.delete();
    return this;
  }
}

export { FieldValue, CompatTimestamp };
