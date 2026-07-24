/**
 * PLANO I (Uber do Técnico) — Fase I-3 — Dispatch: sugestão de técnico para uma OS.
 *
 * Dado uma OS (com localização e skills requeridas) e os técnicos disponíveis,
 * ranqueia o melhor técnico por: proximidade (menor distância), skill compatível
 * e carga do dia (menos OSs ativas). Lógica pura e testável — o I/O fica na rota.
 */
import { haversineKm } from './field-km.service';

export interface DispatchTech {
  id: string;
  name: string;
  skills: string[];
  lat?: number | null;   // última posição conhecida ou base
  lng?: number | null;
  activeOrders: number;
  status: string;        // 'available' | 'break' | 'offline'
}

export interface DispatchOs {
  lat?: number | null;
  lng?: number | null;
  requiredSkills?: string[];
}

export interface DispatchCandidate {
  technicianId: string;
  name: string;
  distanceKm: number | null;
  skillMatch: boolean;
  activeOrders: number;
  score: number;         // 0..100, maior = melhor
  reasons: string[];
}

export interface SuggestOptions {
  /** Inclui técnicos offline no ranking. Default false. */
  includeOffline?: boolean;
  /** Penalidade por km de distância (por km). Default 2. */
  distanceWeight?: number;
  /** Penalidade por OS ativa. Default 5. */
  loadWeight?: number;
  /** Penalidade por skill faltante. Default 40. */
  skillPenalty?: number;
}

function skillsMatch(techSkills: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every((s) => techSkills.includes(s));
}

/**
 * Ranqueia técnicos para uma OS. Retorna do melhor para o pior. Técnicos offline
 * são excluídos por padrão. Score começa em 100 e sofre penalidades.
 */
export function suggestTechnicians(
  os: DispatchOs,
  techs: DispatchTech[],
  opts: SuggestOptions = {},
): DispatchCandidate[] {
  const distanceWeight = opts.distanceWeight ?? 2;
  const loadWeight = opts.loadWeight ?? 5;
  const skillPenalty = opts.skillPenalty ?? 40;
  const required = os.requiredSkills ?? [];

  const pool = opts.includeOffline ? techs : techs.filter((t) => t.status !== 'offline');

  const candidates = pool.map((t): DispatchCandidate => {
    const reasons: string[] = [];

    let distanceKm: number | null = null;
    if (os.lat != null && os.lng != null && t.lat != null && t.lng != null) {
      distanceKm = Math.round(haversineKm({ latitude: t.lat, longitude: t.lng }, { latitude: os.lat, longitude: os.lng }) * 100) / 100;
      reasons.push(`${distanceKm} km`);
    } else {
      reasons.push('sem GPS');
    }

    const skillMatch = skillsMatch(t.skills, required);
    reasons.push(skillMatch ? 'skills ok' : 'skills incompletas');
    reasons.push(`${t.activeOrders} OS ativas`);
    if (t.status === 'break') reasons.push('em pausa');

    let score = 100;
    if (distanceKm != null) score -= Math.min(50, distanceKm * distanceWeight);
    score -= t.activeOrders * loadWeight;
    if (!skillMatch) score -= skillPenalty;
    if (t.status === 'break') score -= 15;
    score = Math.max(0, Math.round(score));

    return { technicianId: t.id, name: t.name, distanceKm, skillMatch, activeOrders: t.activeOrders, score, reasons };
  });

  // Ordena por score desc; desempate por distância asc (null por último) e carga asc.
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.activeOrders - b.activeOrders;
  });
}

/** Atalho: melhor técnico (ou null se não há candidato elegível). */
export function bestTechnician(os: DispatchOs, techs: DispatchTech[], opts: SuggestOptions = {}): DispatchCandidate | null {
  const ranked = suggestTechnicians(os, techs, opts);
  return ranked[0] ?? null;
}
