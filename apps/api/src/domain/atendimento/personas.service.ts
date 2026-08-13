/**
 * Personas de IA por tenant (AIConfigPage → aba "Personas AI"). PORTADO do
 * legado `src/lib/personaManager.ts` (R5): mantém a MESMA fonte de dados que o
 * `messageWorker` lê em runtime — a coleção `ai_personas` no document-store
 * `legacy_docs` (migration 031). Criar uma tabela nova aqui abriria split-brain
 * (o worker não enxergaria as personas). Por isso o storage é abstraído num port
 * `PersonaStore` que a rota implementa sobre `legacy_docs`.
 *
 * O `legacy_docs` NÃO tem RLS por tenant (só service_role) — logo o isolamento
 * é imposto AQUI: toda leitura/escrita filtra/valida `tenant_id` do JWT.
 */

export interface PersonaFields {
  tenant_id: string;
  name: string;
  avatar_url?: string;
  tone: 'formal' | 'friendly' | 'playful';
  language_level: 'simple' | 'technical' | 'advanced';
  custom_instructions: string;
  active_tools: string[];
  temperature: number;
  is_default: boolean;
  tts_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PersonaRow {
  id: string;
  data: PersonaFields;
}

/** Storage dos docs `ai_personas`. A rota implementa sobre `legacy_docs`. */
export interface PersonaStore {
  listByTenant(tenantId: string): Promise<PersonaRow[]>;
  getById(id: string): Promise<PersonaRow | null>;
  upsert(id: string, data: PersonaFields): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PersonaOpts {
  genId?: () => string;
  now?: () => string;
}

const TONES = new Set(['formal', 'friendly', 'playful']);
const LEVELS = new Set(['simple', 'technical', 'advanced']);
const MAX_INSTRUCTIONS = 2000;

export class PersonaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonaValidationError';
  }
}

/** Sanitiza o input do front num shape confiável; lança em invariantes duros. */
export function sanitizePersonaInput(
  input: Record<string, any>,
  tenantId: string,
): Omit<PersonaFields, 'created_at' | 'updated_at'> {
  const name = String(input?.name ?? '').trim();
  if (!name) throw new PersonaValidationError('O nome da persona é obrigatório.');
  if (name.length > 120) throw new PersonaValidationError('O nome não pode exceder 120 caracteres.');

  const custom_instructions = String(input?.custom_instructions ?? '');
  if (custom_instructions.length > MAX_INSTRUCTIONS) {
    throw new PersonaValidationError(`As instruções não podem exceder ${MAX_INSTRUCTIONS} caracteres.`);
  }

  const tone = TONES.has(input?.tone) ? input.tone : 'formal';
  const language_level = LEVELS.has(input?.language_level) ? input.language_level : 'simple';

  const rawTemp = Number(input?.temperature);
  const temperature = Number.isFinite(rawTemp) ? Math.min(2, Math.max(0, rawTemp)) : 0.7;

  const active_tools = Array.isArray(input?.active_tools)
    ? input.active_tools.filter((t: any) => typeof t === 'string').slice(0, 50)
    : [];

  const avatar_url = input?.avatar_url ? String(input.avatar_url).slice(0, 500) : undefined;

  const out: Omit<PersonaFields, 'created_at' | 'updated_at'> = {
    tenant_id: tenantId,
    name,
    tone,
    language_level,
    custom_instructions,
    active_tools,
    temperature,
    is_default: Boolean(input?.is_default),
  };
  if (avatar_url) out.avatar_url = avatar_url;
  if (typeof input?.tts_enabled === 'boolean') out.tts_enabled = input.tts_enabled;
  return out;
}

/** Lista as personas do tenant (id + campos). */
export async function listPersonas(store: PersonaStore, tenantId: string): Promise<Array<PersonaFields & { id: string }>> {
  const rows = await store.listByTenant(tenantId);
  return rows.map((r) => ({ id: r.id, ...r.data }));
}

/** Se `is_default`, tira o default das outras personas do tenant. */
async function unsetOtherDefaults(store: PersonaStore, tenantId: string, exceptId?: string): Promise<void> {
  const rows = await store.listByTenant(tenantId);
  for (const r of rows) {
    if (r.id !== exceptId && r.data.is_default) {
      await store.upsert(r.id, { ...r.data, is_default: false });
    }
  }
}

export async function createPersona(
  store: PersonaStore,
  tenantId: string,
  input: Record<string, any>,
  opts: PersonaOpts = {},
): Promise<{ id: string }> {
  const fields = sanitizePersonaInput(input, tenantId);
  const genId = opts.genId ?? (() => (globalThis.crypto as any).randomUUID());
  const now = (opts.now ?? (() => new Date().toISOString()))();
  const id = genId();

  if (fields.is_default) await unsetOtherDefaults(store, tenantId);

  await store.upsert(id, { ...fields, created_at: now, updated_at: now });
  return { id };
}

export async function updatePersona(
  store: PersonaStore,
  tenantId: string,
  id: string,
  input: Record<string, any>,
  opts: PersonaOpts = {},
): Promise<void> {
  const existing = await store.getById(id);
  // Isolamento: só edita persona do próprio tenant (legacy_docs não tem RLS).
  if (!existing || existing.data.tenant_id !== tenantId) {
    throw new PersonaValidationError('Persona não encontrada para este tenant.');
  }

  const fields = sanitizePersonaInput({ ...existing.data, ...input }, tenantId);
  const now = (opts.now ?? (() => new Date().toISOString()))();

  if (fields.is_default) await unsetOtherDefaults(store, tenantId, id);

  await store.upsert(id, {
    ...fields,
    created_at: existing.data.created_at,
    updated_at: now,
  });
}

export async function deletePersona(store: PersonaStore, tenantId: string, id: string): Promise<void> {
  const existing = await store.getById(id);
  if (!existing || existing.data.tenant_id !== tenantId) {
    throw new PersonaValidationError('Persona não encontrada para este tenant.');
  }
  await store.remove(id);
}
