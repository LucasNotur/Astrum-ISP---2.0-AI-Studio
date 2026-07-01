import { describe, it, expect } from 'vitest';
import { evaluateCutoverReadiness, type CutoverSignals } from './readiness';

const allGreen: CutoverSignals = {
  allTenantsAtendimentoV2: true,
  cobraiV2Stable: true,
  dataGatePassed: true,
  authMigrated: true,
  frontendOnSupabase: true,
  workersPorted: true,
  firestoreBackupVerified: true,
};

describe('evaluateCutoverReadiness (gate S82)', () => {
  it('libera o corte só quando TODOS os sinais estão verdes', () => {
    expect(evaluateCutoverReadiness(allGreen)).toEqual({ ready: true, blockers: [] });
  });

  it('nenhum sinal → bloqueado com todos os motivos', () => {
    const d = evaluateCutoverReadiness({});
    expect(d.ready).toBe(false);
    expect(d.blockers.length).toBe(7);
  });

  it('um único pendente já bloqueia o corte', () => {
    const d = evaluateCutoverReadiness({ ...allGreen, firestoreBackupVerified: false });
    expect(d.ready).toBe(false);
    expect(d.blockers).toEqual(['Backup do Firestore no R2 não verificado']);
  });

  it('backup ausente é um blocker independente (segurança de rollback)', () => {
    const d = evaluateCutoverReadiness({ ...allGreen, dataGatePassed: false, firestoreBackupVerified: false });
    expect(d.blockers).toHaveLength(2);
  });
});
