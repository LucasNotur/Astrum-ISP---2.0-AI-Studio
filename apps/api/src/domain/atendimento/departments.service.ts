/**
 * Departamentos de atendimento (SLA + roteamento). Validação/shape pura e testável;
 * o CRUD (supabase) fica na rota. Migration 097 criou a tabela `departments`.
 */

export interface DepartmentInput {
  name: string;
  sla_response_minutes: number;
  sla_resolution_hours: number;
  required_skills: string[];
  color: string;
  routing_mode: string;
}

export const ROUTING_MODES = ['load_balanced', 'manual', 'round_robin', 'skill_based'] as const;

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/**
 * Valida e normaliza o payload de departamento vindo do cliente. Lança se `name`
 * for vazio; sanitiza os demais campos (defaults seguros, cor hex válida, routing
 * conhecido, skills limitadas). Nunca confia nos tipos do cliente.
 */
export function sanitizeDepartmentInput(body: unknown): DepartmentInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? '').trim();
  if (!name) throw new Error('Nome do departamento é obrigatório');
  if (name.length > 120) throw new Error('Nome muito longo (máx. 120)');

  const color = typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#3b82f6';
  const routing = typeof b.routing_mode === 'string' && (ROUTING_MODES as readonly string[]).includes(b.routing_mode)
    ? b.routing_mode
    : 'load_balanced';
  const skills = Array.isArray(b.required_skills)
    ? b.required_skills.map((s) => String(s)).filter((s) => s.trim()).slice(0, 50)
    : [];

  return {
    name,
    sla_response_minutes: clampInt(b.sla_response_minutes, 15, 1, 100_000),
    sla_resolution_hours: clampInt(b.sla_resolution_hours, 24, 1, 100_000),
    required_skills: skills,
    color,
    routing_mode: routing,
  };
}
