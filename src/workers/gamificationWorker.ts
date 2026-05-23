import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";

const isMockRedis = !((redis as any).options);

export const gamificationQueue = isMockRedis ? null : new Queue("gamification", {
  connection: redis as any
});

export const gamificationWorker = isMockRedis ? null : new Worker("gamification", async (job) => {
  if (job.name === "calculate_daily_ranking") {
    try {
      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
      
      const tenantsSnap = await db.collection("tenants").where("active", "==", true).get();
      
      for (const tenantDoc of tenantsSnap.docs) {
        const tenantId = tenantDoc.id;
        
        try {
           // Get all operators
           const usersSnap = await db.collection("users")
               .where("tenantId", "==", tenantId)
               .where("role", "in", ["support", "tecnico", "vendas"])
               .get();
           
           const activeOperators = usersSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
           
           if (!activeOperators.length) continue;

           // Get all tickets for this month in this tenant
           // Filtering tickets manually or query by created_at prefix
           // we'll get last 30 days of tickets for the current month
           const startOfMonth = new Date(`${currentMonth}-01T00:00:00.000Z`);
           
           const ticketsSnap = await db.collection("tenants").doc(tenantId).collection("tickets")
                 .where("created_at", ">=", startOfMonth)
                 .get();

           const tickets = ticketsSnap.docs.map(t => ({ id: t.id, ...t.data() }));

           const batch = db.batch();

           for (const operator of activeOperators) {
              const operatorTickets = tickets.filter(t => t.assigned_to === operator.id);
              
              let points = 0;
              let badges: string[] = [];

              // +10 atendimento concluído
              const completedTickets = operatorTickets.filter(t => t.status === "closed" || t.status === "resolved");
              points += completedTickets.length * 10;

              // +50 NPS 5★
              const nps5Tickets = completedTickets.filter(t => t.nps_score === 5);
              points += nps5Tickets.length * 50;

              if (nps5Tickets.length > 0 && !badges.includes('NPS_5_STAR')) {
                badges.push('NPS_5_STAR');
              }

              // +20 FCR
              const fcrTickets = completedTickets.filter(t => t.fcr === true);
              points += fcrTickets.length * 20;

              if (fcrTickets.length > 0 && !badges.includes('FCR_STAR')) {
                 badges.push('FCR_STAR');
              }

              // -10 SLA violado
              const slaViolated = operatorTickets.filter(t => t.sla_breached === true);
              points -= slaViolated.length * 10;

              // +100 meta mensal (e.g. > 50 completed)
               if (completedTickets.length >= 50) {
                 points += 100;
                 if (!badges.includes('MENSAL_GOAL')) badges.push('MENSAL_GOAL');
               }

              // Save to gamification/{tenantId}/scores doc operator_id_month
              const scoreRef = db.collection("gamification").doc(tenantId).collection("scores").doc(`${operator.id}_${currentMonth}`);
              batch.set(scoreRef, {
                 operator_id: operator.id,
                 points: Math.max(0, points), // Ensure points don't go below 0 for display
                 badges,
                 month: currentMonth,
                 updated_at: new Date()
              }, { merge: true });
           }

           await batch.commit();
           console.log(`[Gamification] Calculated ranking for ${tenantId}`);

        } catch (e: any) {
           console.error(`[Gamification] Error processing tenant ${tenantId}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error(`[Gamification Worker] Job failed:`, e.message);
    }
  }
}, {
  connection: redis as any
});

if (gamificationQueue && gamificationWorker) {
  gamificationWorker.on("failed", (job, err) => {
    console.error(`[Gamification] Job ${job?.id} failed:`, err);
  });
  
  gamificationQueue.add("calculate_daily_ranking", {}, {
    repeat: {
      pattern: "0 1 * * *", // Every day at 1 AM
    },
    jobId: "daily-gamification-ranking"
  }).catch(e => console.error("Could not add repeatable gamification job:", e));
}
