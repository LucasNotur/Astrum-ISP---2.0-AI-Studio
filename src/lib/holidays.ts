import { adminDb as db } from "./firebaseAdmin";

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'state' | 'municipal' | 'custom';
}

export async function fetchAndSaveNationalHolidays(tenantId: string) {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  const [res1, res2] = await Promise.all([
    fetch(`https://brasilapi.com.br/api/feriados/v1/${currentYear}`),
    fetch(`https://brasilapi.com.br/api/feriados/v1/${nextYear}`)
  ]);
  
  let holidays: Holiday[] = [];
  
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

export async function isHoliday(tenantId: string, dateObjOrStr: Date | string): Promise<boolean> {
   if (!tenantId) return false;
   
   let dateStr = '';
   if (typeof dateObjOrStr === 'string') {
      dateStr = dateObjOrStr.split('T')[0];
   } else {
      dateStr = dateObjOrStr.toISOString().split('T')[0];
   }
   
   const doc = await db.collection(`holidays/${tenantId}/dates`).doc(dateStr).get();
   return doc.exists;
}

export async function getHolidays(tenantId: string): Promise<Holiday[]> {
    const snap = await db.collection(`holidays/${tenantId}/dates`).get();
    return snap.docs.map(d => d.data() as Holiday);
}
