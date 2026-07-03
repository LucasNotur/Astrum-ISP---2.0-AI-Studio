/**
 * FZ-1 — Roteador de paths: decide onde cada path Firestore vive no Supabase.
 * Regras documentadas em .astrum-progress/PLANO_FIRESTORE_ZERO.md §0.3.
 */

/** Coleções top-level com tabela nativa no Supabase. */
export const NATIVE_TABLES: Record<string, string> = {
  customers: 'customers',
  tickets: 'tickets',
  messages: 'messages',
  tenants: 'tenants',
  invoices: 'invoices',
  billing_invoices: 'invoices',
  service_orders: 'service_orders',
  technicians: 'technicians',
  inventory: 'inventory',
  team_members: 'team_members',
  notifications: 'notifications',
  network_ctos: 'network_ctos',
  knowledge_base: 'knowledge_articles',
  knowledge_articles: 'knowledge_articles',
  role_permissions: 'role_permissions',
  // ⚠️ audit_logs legado = métricas de IA (ver migration 018), NÃO é a tabela audit_log
  audit_logs: 'ai_performance_logs',
  ai_token_logs: 'ai_performance_logs',
  dead_letter_queue: 'dead_letter_queue',
  users: 'users',
  whatsapp_instances: 'tenant_evolution_instances',
};

/**
 * Subcoleções de tenants que o frontend (S99) lê/grava como colunas JSONB na
 * linha do tenant. O compat DEVE usar o mesmo storage para não divergir.
 * `tenants/{tid}/settings/{docId}` usa a coluna `docId` quando listada aqui.
 */
export const TENANT_JSONB_COLUMNS = new Set([
  'theme',
  'forms',
  'departments',
  'closing_reasons',
  'holidays',
  'integration_keys',
  'cobrai_window',
  'cobrai_stages',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

// ─── conversão de nomes de campo ─────────────────────────────────────────────

export function toSnake(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function keysToSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[toSnake(k)] = v;
  return out;
}

export function keysToCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[toCamel(k)] = v;
  return out;
}

// ─── resolução de rota ───────────────────────────────────────────────────────

export type Route =
  /** Tabela nativa; `fixedFilters` cobre subcoleções (ex.: messages ⇒ ticket_id). */
  | { kind: 'native'; table: string; fixedFilters: Record<string, string> }
  /** Coluna JSONB na linha do tenant (settings/theme, integration_keys, departments…). */
  | { kind: 'tenantColumn'; tenantId: string; column: string; isArray: boolean }
  /** Document store legacy_docs. */
  | { kind: 'legacy' };

export interface RouteLog {
  path: string;
  route: Route['kind'];
  reason?: string;
}

let onRouteLog: ((log: RouteLog) => void) | null = null;
export function setRouteLogger(fn: (log: RouteLog) => void) {
  onRouteLog = fn;
}

function emit(path: string, route: Route['kind'], reason?: string) {
  if (route === 'legacy' && onRouteLog) onRouteLog({ path, route, reason });
}

/**
 * Resolve a rota para um path de COLEÇÃO (número ímpar de segmentos)
 * ou de DOCUMENTO (número par).
 */
export function resolveRoute(segments: string[]): Route {
  const path = segments.join('/');
  const isDocPath = segments.length % 2 === 0;
  const collectionName = isDocPath ? segments[segments.length - 2] : segments[segments.length - 1];
  const docId = isDocPath ? segments[segments.length - 1] : undefined;

  // tickets/{tid}/messages → tabela messages com ticket_id fixo
  if (segments[0] === 'tickets' && segments[2] === 'messages' && segments.length <= 4) {
    return { kind: 'native', table: 'messages', fixedFilters: { ticket_id: segments[1] } };
  }

  // tenants/{tid}/settings/{docId} → coluna docId (se conhecida)
  if (
    segments[0] === 'tenants' &&
    segments[2] === 'settings' &&
    segments.length === 4 &&
    TENANT_JSONB_COLUMNS.has(segments[3])
  ) {
    return { kind: 'tenantColumn', tenantId: segments[1], column: segments[3], isArray: false };
  }

  // tenants/{tid}/{sub} onde sub é coluna JSONB conhecida
  if (
    segments[0] === 'tenants' &&
    segments.length >= 3 &&
    segments.length <= 4 &&
    TENANT_JSONB_COLUMNS.has(segments[2])
  ) {
    const isArray = segments[2] === 'departments' || segments[2] === 'holidays' || segments[2] === 'forms';
    return { kind: 'tenantColumn', tenantId: segments[1], column: segments[2], isArray };
  }

  // Coleção/documento top-level com tabela nativa
  if (segments.length <= 2 && NATIVE_TABLES[collectionName]) {
    if (docId && !isUuid(docId)) {
      emit(path, 'legacy', `doc-id não-UUID em tabela nativa (${collectionName})`);
      return { kind: 'legacy' };
    }
    return { kind: 'native', table: NATIVE_TABLES[collectionName], fixedFilters: {} };
  }

  emit(path, 'legacy', `sem tabela nativa para '${collectionName}'`);
  return { kind: 'legacy' };
}
