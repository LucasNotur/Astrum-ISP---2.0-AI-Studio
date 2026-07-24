/**
 * Dossiê #77 — Agendamento Multi-Parâmetro e cruzamento de técnicos.
 * Agenda visitas técnicas cruzando disponibilidade de técnicos,
 * região, habilidades e janela de horário do cliente.
 */

export interface Technician {
  id: string;
  tenantId: string;
  name: string;
  skills: string[];
  region: string;
  maxDailySlots: number;
}

export interface TimeSlot {
  date: string;
  startHour: number;
  endHour: number;
}

export interface Appointment {
  id: string;
  tenantId: string;
  technicianId: string;
  customerId: string;
  slot: TimeSlot;
  serviceType: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  createdAt: string;
}

export interface SchedulingPorts {
  listTechnicians: (tenantId: string) => Promise<Technician[]>;
  getAppointments: (tenantId: string, technicianId: string, date: string) => Promise<Appointment[]>;
  createAppointment: (appt: Omit<Appointment, 'id' | 'createdAt'>) => Promise<Appointment>;
  cancelAppointment: (id: string) => Promise<void>;
}

export function matchSkills(technician: Technician, requiredSkills: string[]): boolean {
  return requiredSkills.every((skill) => technician.skills.includes(skill));
}

export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.date !== b.date) return false;
  return a.startHour < b.endHour && b.startHour < a.endHour;
}

export function isSlotAvailable(existingAppointments: Appointment[], slot: TimeSlot): boolean {
  return !existingAppointments.some(
    (appt) => appt.status !== 'cancelled' && slotsOverlap(appt.slot, slot),
  );
}

export function findAvailableTechnicians(
  technicians: Technician[],
  appointments: Map<string, Appointment[]>,
  region: string,
  requiredSkills: string[],
  slot: TimeSlot,
): Technician[] {
  return technicians.filter((tech) => {
    if (tech.region !== region) return false;
    if (!matchSkills(tech, requiredSkills)) return false;
    const techAppts = appointments.get(tech.id) ?? [];
    const activeCount = techAppts.filter((a) => a.status !== 'cancelled' && a.slot.date === slot.date).length;
    if (activeCount >= tech.maxDailySlots) return false;
    return isSlotAvailable(techAppts, slot);
  });
}

export async function scheduleAppointment(
  tenantId: string,
  customerId: string,
  region: string,
  requiredSkills: string[],
  serviceType: string,
  slot: TimeSlot,
  ports: SchedulingPorts,
): Promise<{ ok: boolean; appointment?: Appointment; error?: string }> {
  if (slot.startHour >= slot.endHour) {
    return { ok: false, error: 'Horário de início deve ser antes do fim' };
  }
  if (slot.startHour < 7 || slot.endHour > 19) {
    return { ok: false, error: 'Agendamentos permitidos entre 07h e 19h' };
  }

  const technicians = await ports.listTechnicians(tenantId);
  const regionTechs = technicians.filter((t) => t.region === region);
  if (regionTechs.length === 0) {
    return { ok: false, error: `Nenhum técnico na região "${region}"` };
  }

  const appointmentMap = new Map<string, Appointment[]>();
  for (const tech of regionTechs) {
    const appts = await ports.getAppointments(tenantId, tech.id, slot.date);
    appointmentMap.set(tech.id, appts);
  }

  const available = findAvailableTechnicians(regionTechs, appointmentMap, region, requiredSkills, slot);
  if (available.length === 0) {
    return { ok: false, error: 'Nenhum técnico disponível para os critérios informados' };
  }

  const bestTech = available.reduce((best, tech) => {
    const bestCount = (appointmentMap.get(best.id) ?? []).filter((a) => a.status !== 'cancelled').length;
    const techCount = (appointmentMap.get(tech.id) ?? []).filter((a) => a.status !== 'cancelled').length;
    return techCount < bestCount ? tech : best;
  });

  const appointment = await ports.createAppointment({
    tenantId,
    technicianId: bestTech.id,
    customerId,
    slot,
    serviceType,
    status: 'scheduled',
  });

  return { ok: true, appointment };
}
