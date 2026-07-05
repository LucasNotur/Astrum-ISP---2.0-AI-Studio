/**
 * FZ-1 — Sentinels do FieldValue (serverTimestamp, increment, arrayUnion,
 * arrayRemove, delete). São objetos-marcador resolvidos no momento da escrita.
 */

const FV = Symbol.for('astrum.db-compat.fieldValue');

export interface Sentinel {
  [FV]: 'serverTimestamp' | 'increment' | 'arrayUnion' | 'arrayRemove' | 'delete';
  operand?: any;
}

export const FieldValue = {
  serverTimestamp(): Sentinel {
    return { [FV]: 'serverTimestamp' };
  },
  increment(n: number): Sentinel {
    return { [FV]: 'increment', operand: n };
  },
  arrayUnion(...items: any[]): Sentinel {
    return { [FV]: 'arrayUnion', operand: items };
  },
  arrayRemove(...items: any[]): Sentinel {
    return { [FV]: 'arrayRemove', operand: items };
  },
  delete(): Sentinel {
    return { [FV]: 'delete' };
  },
};

export function isSentinel(v: unknown): v is Sentinel {
  return !!v && typeof v === 'object' && FV in (v as any);
}

export function sentinelKind(v: Sentinel): Sentinel[typeof FV] {
  return v[FV];
}

/** serverTimestamp não precisa do doc existente; os demais precisam (read-modify-write). */
export function needsExistingDoc(data: Record<string, any>): boolean {
  return Object.values(data).some(
    v => isSentinel(v) && sentinelKind(v) !== 'serverTimestamp',
  );
}

/**
 * Resolve os sentinels de `data` contra o estado `existing` do documento.
 * Retorna um novo objeto pronto para persistir (sem sentinels).
 */
export function resolveSentinels(
  data: Record<string, any>,
  existing: Record<string, any> = {},
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isSentinel(value)) {
      out[key] = value;
      continue;
    }
    switch (sentinelKind(value)) {
      case 'serverTimestamp':
        out[key] = new Date().toISOString();
        break;
      case 'increment': {
        const current = typeof existing[key] === 'number' ? existing[key] : 0;
        out[key] = current + (value.operand ?? 0);
        break;
      }
      case 'arrayUnion': {
        const current: any[] = Array.isArray(existing[key]) ? existing[key] : [];
        const additions = (value.operand ?? []).filter(
          (item: any) => !current.some(c => JSON.stringify(c) === JSON.stringify(item)),
        );
        out[key] = [...current, ...additions];
        break;
      }
      case 'arrayRemove': {
        const current: any[] = Array.isArray(existing[key]) ? existing[key] : [];
        const removals = new Set((value.operand ?? []).map((i: any) => JSON.stringify(i)));
        out[key] = current.filter(c => !removals.has(JSON.stringify(c)));
        break;
      }
      case 'delete':
        out[key] = null;
        break;
    }
  }
  return out;
}
