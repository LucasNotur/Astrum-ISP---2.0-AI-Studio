import { fromZonedTime } from 'date-fns-tz';

/**
 * Formats a given date using the tenant's timezone using Intl.DateTimeFormat.
 */
export const formatTenantDate = (date: Date | string | number, timezone: string = 'America/Sao_Paulo', options?: Intl.DateTimeFormatOptions): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  try {
     return new Intl.DateTimeFormat('pt-BR', {
         timeZone: timezone,
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
         hour: '2-digit',
         minute: '2-digit',
         ...options
     }).format(d);
  } catch (e) {
     return new Intl.DateTimeFormat('pt-BR', {
         timeZone: 'America/Sao_Paulo',
         year: 'numeric',
         month: '2-digit',
         day: '2-digit',
         hour: '2-digit',
         minute: '2-digit',
         ...options
     }).format(d);
  }
};

/**
 * Calculates the delay in ms from now until a scheduled date/time (in the tenant's timezone).
 * This can be used by BullMQ scheduling functions to convert a tenant's local time to UTC delay.
 */
export const calculateBullMQDelay = (targetDateTimeStr: string, timezone: string = 'America/Sao_Paulo'): number => {
   // e.g. targetDateTimeStr = "2023-12-31T15:00:00" in timezone "America/Sao_Paulo"
   try {
       const targetUtc = fromZonedTime(targetDateTimeStr, timezone);
       const delay = targetUtc.getTime() - Date.now();
       return Math.max(0, delay); // Prevent negative delays
   } catch(e) {
       return 0;
   }
};

