import { describe, it, expect, vi } from 'vitest';
import {
  matchSkills, slotsOverlap, isSlotAvailable, findAvailableTechnicians,
  scheduleAppointment, Technician, Appointment, TimeSlot, SchedulingPorts,
} from './scheduling.service';

const TECHS: Technician[] = [
  { id: 'tech-1', tenantId: 't1', name: 'Carlos', skills: ['fibra', 'roteador'], region: 'SP-Leste', maxDailySlots: 6 },
  { id: 'tech-2', tenantId: 't1', name: 'Ana', skills: ['fibra', 'fusão'], region: 'SP-Leste', maxDailySlots: 4 },
  { id: 'tech-3', tenantId: 't1', name: 'Pedro', skills: ['roteador'], region: 'SP-Norte', maxDailySlots: 5 },
];

const SLOT: TimeSlot = { date: '2026-07-25', startHour: 10, endHour: 12 };

const EXISTING_APPT: Appointment = {
  id: 'appt-1', tenantId: 't1', technicianId: 'tech-1', customerId: 'c-1',
  slot: { date: '2026-07-25', startHour: 9, endHour: 11 },
  serviceType: 'instalação', status: 'scheduled', createdAt: '2026-07-22',
};

function makePorts(): SchedulingPorts {
  return {
    listTechnicians: vi.fn().mockResolvedValue(TECHS),
    getAppointments: vi.fn().mockResolvedValue([]),
    createAppointment: vi.fn().mockImplementation(async (appt) => ({ id: 'appt-new', createdAt: '2026-07-22', ...appt })),
    cancelAppointment: vi.fn().mockResolvedValue(undefined),
  };
}

describe('scheduling.service', () => {
  describe('matchSkills', () => {
    it('aceita técnico com todas as skills', () => {
      expect(matchSkills(TECHS[0], ['fibra', 'roteador'])).toBe(true);
    });
    it('rejeita técnico sem skill requerida', () => {
      expect(matchSkills(TECHS[0], ['fusão'])).toBe(false);
    });
    it('aceita sem skills requeridas', () => {
      expect(matchSkills(TECHS[0], [])).toBe(true);
    });
  });

  describe('slotsOverlap', () => {
    it('detecta sobreposição', () => {
      expect(slotsOverlap(SLOT, { date: '2026-07-25', startHour: 11, endHour: 13 })).toBe(true);
    });
    it('sem sobreposição quando adjacente', () => {
      expect(slotsOverlap(SLOT, { date: '2026-07-25', startHour: 12, endHour: 14 })).toBe(false);
    });
    it('sem sobreposição em datas diferentes', () => {
      expect(slotsOverlap(SLOT, { date: '2026-07-26', startHour: 10, endHour: 12 })).toBe(false);
    });
  });

  describe('isSlotAvailable', () => {
    it('disponível sem conflito', () => {
      expect(isSlotAvailable([], SLOT)).toBe(true);
    });
    it('indisponível com conflito', () => {
      expect(isSlotAvailable([EXISTING_APPT], SLOT)).toBe(false);
    });
    it('ignora agendamentos cancelados', () => {
      expect(isSlotAvailable([{ ...EXISTING_APPT, status: 'cancelled' }], SLOT)).toBe(true);
    });
  });

  describe('findAvailableTechnicians', () => {
    it('filtra por região, skill e disponibilidade', () => {
      const map = new Map([['tech-1', [EXISTING_APPT]], ['tech-2', []]]);
      const result = findAvailableTechnicians(TECHS, map, 'SP-Leste', ['fibra'], SLOT);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tech-2');
    });
  });

  describe('scheduleAppointment', () => {
    it('agenda com técnico disponível', async () => {
      const ports = makePorts();
      const result = await scheduleAppointment('t1', 'c-1', 'SP-Leste', ['fibra'], 'instalação', SLOT, ports);
      expect(result.ok).toBe(true);
      expect(result.appointment?.status).toBe('scheduled');
    });

    it('rejeita horário inválido (início >= fim)', async () => {
      const ports = makePorts();
      const result = await scheduleAppointment('t1', 'c-1', 'SP-Leste', [], 'reparo', { date: '2026-07-25', startHour: 14, endHour: 14 }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('antes do fim');
    });

    it('rejeita horário fora do expediente', async () => {
      const ports = makePorts();
      const result = await scheduleAppointment('t1', 'c-1', 'SP-Leste', [], 'reparo', { date: '2026-07-25', startHour: 6, endHour: 8 }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('07h e 19h');
    });

    it('rejeita região sem técnicos', async () => {
      const ports = makePorts();
      const result = await scheduleAppointment('t1', 'c-1', 'SP-Sul', [], 'reparo', SLOT, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Nenhum técnico');
    });

    it('escolhe técnico com menos agendamentos', async () => {
      const ports = makePorts();
      (ports.getAppointments as any).mockImplementation(async (_t: string, techId: string) => {
        if (techId === 'tech-1') return [{ ...EXISTING_APPT, slot: { date: '2026-07-25', startHour: 7, endHour: 9 } }];
        return [];
      });
      const result = await scheduleAppointment('t1', 'c-1', 'SP-Leste', ['fibra'], 'instalação', SLOT, ports);
      expect(result.ok).toBe(true);
      expect(result.appointment?.technicianId).toBe('tech-2');
    });
  });
});
