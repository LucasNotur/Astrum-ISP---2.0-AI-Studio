export const NATIONAL_HOLIDAYS = [
  '01/01', // Ano Novo
  '21/04', // Tiradentes
  '01/05', // Dia do Trabalho
  '07/09', // Independência
  '12/10', // Nossa Senhora
  '02/11', // Finados
  '15/11', // Proclamação da República
  '25/12', // Natal
];

const WORKING_WINDOWS: Record<number, { start: number; end: number } | null> = {
  1: { start: 8, end: 18 }, // Segunda
  2: { start: 8, end: 18 }, // Terça
  3: { start: 8, end: 18 }, // Quarta
  4: { start: 8, end: 18 }, // Quinta
  5: { start: 8, end: 17 }, // Sexta
  6: { start: 8, end: 12 }, // Sábado (meio período)
  0: null,                   // Domingo — sem atendimento
};

export function validateScheduleSlot(
  dateStr: string,
  period: 'manha' | 'tarde',
  municipalHolidays: string[] = []
): { valid: boolean; reason?: 'FERIADO_NACIONAL' | 'DOMINGO_SEM_ATENDIMENTO' | 'SABADO_APENAS_MANHA' | 'FERIADO_MUNICIPAL' } {
  // Try to parse the date. Handling both timezone attached and unattached strings.
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  // Using explicit format to prevent timezone offset issues for local dates:
  // Assuming dateStr is in YYYY-MM-DD format based on standard inputs.
  const dayMonth = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  // However, date conversion above might offset if dateStr is just "YYYY-MM-DD".
  // A safer approach if dateStr is "YYYY-MM-DD":
  const parts = dateStr.includes('T') ? dateStr.split('T')[0].split('-') : dateStr.split('-');
  let safeDayMonth = dayMonth;
  if (parts.length >= 3) {
      safeDayMonth = `${parts[2]}/${parts[1]}`;
  }

  if (NATIONAL_HOLIDAYS.includes(safeDayMonth)) {
    return { valid: false, reason: 'FERIADO_NACIONAL' };
  }
  
  if (municipalHolidays.includes(safeDayMonth)) {
    return { valid: false, reason: 'FERIADO_MUNICIPAL' };
  }

  if (WORKING_WINDOWS[dayOfWeek] === null) {
    return { valid: false, reason: 'DOMINGO_SEM_ATENDIMENTO' };
  }

  if (dayOfWeek === 6 && period === 'tarde') {
    return { valid: false, reason: 'SABADO_APENAS_MANHA' };
  }

  return { valid: true };
}
