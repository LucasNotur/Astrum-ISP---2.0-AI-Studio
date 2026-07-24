import { describe, it, expect } from 'vitest';
import { suggestTechnicians, bestTechnician, type DispatchTech, type DispatchOs } from './dispatch.service';

// OS no centro de SP.
const OS: DispatchOs = { lat: -23.5505, lng: -46.6333, requiredSkills: ['ftth'] };

const perto: DispatchTech = { id: 'perto', name: 'Perto', skills: ['ftth', 'reparo'], lat: -23.5510, lng: -46.6340, activeOrders: 1, status: 'available' };
const longe: DispatchTech = { id: 'longe', name: 'Longe', skills: ['ftth'], lat: -23.6500, lng: -46.7000, activeOrders: 1, status: 'available' };
const semSkill: DispatchTech = { id: 'semskill', name: 'SemSkill', skills: ['reparo'], lat: -23.5510, lng: -46.6340, activeOrders: 0, status: 'available' };
const offline: DispatchTech = { id: 'off', name: 'Offline', skills: ['ftth'], lat: -23.5510, lng: -46.6340, activeOrders: 0, status: 'offline' };

describe('dispatch.service', () => {
  describe('suggestTechnicians', () => {
    it('prioriza o técnico mais próximo com skill compatível', () => {
      const ranked = suggestTechnicians(OS, [longe, perto]);
      expect(ranked[0]!.technicianId).toBe('perto');
      expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
    });

    it('penaliza skills incompletas', () => {
      const ranked = suggestTechnicians(OS, [perto, semSkill]);
      expect(ranked[0]!.technicianId).toBe('perto');
      const sem = ranked.find((r) => r.technicianId === 'semskill')!;
      expect(sem.skillMatch).toBe(false);
    });

    it('exclui offline por padrão', () => {
      const ranked = suggestTechnicians(OS, [perto, offline]);
      expect(ranked.map((r) => r.technicianId)).not.toContain('off');
    });

    it('inclui offline quando pedido', () => {
      const ranked = suggestTechnicians(OS, [perto, offline], { includeOffline: true });
      expect(ranked.map((r) => r.technicianId)).toContain('off');
    });

    it('penaliza carga alta do dia', () => {
      const ocupado: DispatchTech = { ...perto, id: 'ocupado', name: 'Ocupado', activeOrders: 8 };
      const ranked = suggestTechnicians(OS, [ocupado, longe]);
      // Longe tem menos carga; ocupado está muito carregado — longe pode vencer.
      const ocupadoScore = ranked.find((r) => r.technicianId === 'ocupado')!.score;
      const longeScore = ranked.find((r) => r.technicianId === 'longe')!.score;
      expect(longeScore).toBeGreaterThan(ocupadoScore);
    });

    it('lida com OS/técnico sem GPS (distância null, sem quebrar)', () => {
      const semGps: DispatchTech = { ...perto, lat: null, lng: null };
      const ranked = suggestTechnicians({ requiredSkills: [] }, [semGps]);
      expect(ranked[0]!.distanceKm).toBeNull();
      expect(ranked[0]!.reasons).toContain('sem GPS');
    });

    it('sem skills requeridas todos casam', () => {
      const ranked = suggestTechnicians({ lat: -23.55, lng: -46.63 }, [semSkill]);
      expect(ranked[0]!.skillMatch).toBe(true);
    });

    it('score fica entre 0 e 100', () => {
      const ranked = suggestTechnicians(OS, [perto, longe, semSkill]);
      for (const c of ranked) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('bestTechnician', () => {
    it('retorna o melhor candidato', () => {
      expect(bestTechnician(OS, [longe, perto])!.technicianId).toBe('perto');
    });

    it('retorna null sem candidatos elegíveis', () => {
      expect(bestTechnician(OS, [offline])).toBeNull();
    });
  });
});
