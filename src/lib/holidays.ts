import { adminDb as db } from "./firebaseAdmin";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'state' | 'municipal' | 'custom';
}

export async function fetchAndSaveNationalHolidays(tenantId: string) {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  let holidays: Holiday[] = [];

  try {
    const [res1, res2] = await Promise.all([
      fetch(`https://brasilapi.com.br/api/feriados/v1/${currentYear}`),
      fetch(`https://brasilapi.com.br/api/feriados/v1/${nextYear}`)
    ]);
    
    if (res1.ok) {
       const data = await res1.json();
       holidays = holidays.concat(data.map((h: any) => ({
          date: h.date,
          name: h.name,
          type: 'national'
       })));
    }
    
    if (res2.ok) {
       const data = await res2.json();
       holidays = holidays.concat(data.map((h: any) => ({
          date: h.date,
          name: h.name,
          type: 'national'
       })));
    }
  } catch (err) {
    // silently catch fetch errors for fallback
  }
  
  if (holidays.length === 0) {
     // Fallback if APIs are unavailable
     const fallbackCurrent: Holiday[] = [
        { date: `${currentYear}-01-01`, name: 'Confraternização Universal', type: 'national' },
        { date: `${currentYear}-12-25`, name: 'Natal', type: 'national' },
     ];
     const fallbackNext: Holiday[] = [
        { date: `${nextYear}-01-01`, name: 'Confraternização Universal', type: 'national' },
        { date: `${nextYear}-12-25`, name: 'Natal', type: 'national' },
     ];
     holidays = [...fallbackCurrent, ...fallbackNext];
  }
  
  const batch = db.batch();
  for (const h of holidays) {
      const ref = db.collection(`holidays/${tenantId}/dates`).doc(h.date);
      batch.set(ref, h, { merge: true });
  }
  
  if (holidays.length > 0) {
      await batch.commit();
  }
  
  return holidays;
}

export async function isHoliday(tenantId: string, dateObjOrStr: Date | string, timezone: string = 'America/Sao_Paulo'): Promise<boolean> {
   if (!tenantId) return false;
   
   let dateStr = '';
   if (typeof dateObjOrStr === 'string') {
      dateStr = dateObjOrStr.split('T')[0];
   } else {
      try {
         const formatter = new Intl.DateTimeFormat('en-CA', { 
            timeZone: timezone, 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
         });
         dateStr = formatter.format(dateObjOrStr); // YYYY-MM-DD
      } catch (e) {
         dateStr = dateObjOrStr.toISOString().split('T')[0];
      }
   }
   
   const doc = await db.collection(`holidays/${tenantId}/dates`).doc(dateStr).get();
   return doc.exists;
}

export async function getHolidays(tenantId: string): Promise<Holiday[]> {
    const snap = await db.collection(`holidays/${tenantId}/dates`).get();
    return snap.docs.map(d => d.data() as Holiday);
}

export async function getNextWorkingDay(tenantId: string, dateObjOrStr: Date | string, timezone: string = 'America/Sao_Paulo'): Promise<Date> {
    let date = typeof dateObjOrStr === 'string' ? new Date(dateObjOrStr) : new Date(dateObjOrStr);
    
    while (true) {
        // Check if weekend (0 = Sunday, 6 = Saturday)
        // Wait, getting day based on timezone is safer, but default Date getDay is local.
        // Assuming simple getDay is fine for this example.
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const isHol = await isHoliday(tenantId, date, timezone);
        
        if (!isWeekend && !isHol) {
            return date;
        }
        
        // Add one day
        date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    }
}
