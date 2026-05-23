import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import customAdmin, { adminDb as db } from "../lib/firebaseAdmin";

const isMockRedis = !((redis as any).options);

export const fcrQueue = isMockRedis ? {
  add: async () => {},
  upsertJobScheduler: async () => {}
} as any : new Queue("fcr-calculator", { connection: redis as any });

export const fcrWorker = isMockRedis ? null : new Worker('fcr-calculator', async (job) => {
  if (job.name === 'calculate_fcr_daily') {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    
    // reset to start of day
    yesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday.getTime());
    endOfYesterday.setHours(23, 59, 59, 999);

    try {
      const tenantsSnap = await db.collection("tenants").where("status", "==", "active").get();

      for (const doc of tenantsSnap.docs) {
        const tenantId = doc.id;
        
        const ticketsSnap = await db.collection("tickets")
          .where("tenantId", "==", tenantId)
          .where("createdAt", ">=", yesterday)
          .where("createdAt", "<=", endOfYesterday)
          .get();

        let totalTickets = ticketsSnap.size;
        let resolvedCount = 0;
        let escalatedCount = 0;
        let aiResolved = 0;
        let humanResolved = 0;

        type MetricAgg = { sum: number, count: number };
        const initAgg = (): MetricAgg => ({ sum: 0, count: 0 });

        const tma: any = { total: initAgg(), by_channel: {}, by_type: { ai: initAgg(), human: initAgg() } };
        const tmr: any = { total: initAgg(), by_channel: {}, by_type: { ai: initAgg(), human: initAgg() } };

        ticketsSnap.docs.forEach(ticketDoc => {
          const ticket = ticketDoc.data();
          
          const escalated = ticket.status === "escalated" || ticket.escalated === true;
          if (escalated) {
            escalatedCount++;
          }

          const reopened = ticket.reopened === true;
          const resolved = ticket.status === "resolved" || ticket.status === "closed";
          
          const type = (ticket.resolvedBy === "ai" || ticket.handledByAI) ? "ai" : "human";
          const channel = ticket.channel || "webchat";

          if (resolved && !escalated && !reopened) {
            resolvedCount++;
            if (type === "ai") aiResolved++;
            else humanResolved++;
          }
          
          const createdAtDt = ticket.createdAt?.toDate?.() || (ticket.createdAt ? new Date(ticket.createdAt) : null);
          const resolvedAtDt = ticket.resolvedAt?.toDate?.() || (ticket.resolved_at ? new Date(ticket.resolved_at) : null);
          const humanFirstResponseDt = ticket.human_first_response_at?.toDate?.() || null;

          if (createdAtDt) {
             const createdTime = createdAtDt.getTime();
             
             if (resolvedAtDt) {
               const diffTma = resolvedAtDt.getTime() - createdTime;
               tma.total.sum += diffTma; tma.total.count++;
               tma.by_type[type].sum += diffTma; tma.by_type[type].count++;
               if (!tma.by_channel[channel]) tma.by_channel[channel] = initAgg();
               tma.by_channel[channel].sum += diffTma; tma.by_channel[channel].count++;
             }
             
             if (humanFirstResponseDt) {
               const diffTmr = humanFirstResponseDt.getTime() - createdTime;
               tmr.total.sum += diffTmr; tmr.total.count++;
               tmr.by_type[type].sum += diffTmr; tmr.by_type[type].count++;
               if (!tmr.by_channel[channel]) tmr.by_channel[channel] = initAgg();
               tmr.by_channel[channel].sum += diffTmr; tmr.by_channel[channel].count++;
             }
          }
        });

        const computeAvg = (agg: MetricAgg | undefined) => (agg && agg.count > 0) ? agg.sum / agg.count : 0;
        const parseMap = (map: Record<string, MetricAgg>) => Object.keys(map).reduce((acc, k) => ({...acc, [k]: computeAvg(map[k])}), {});

        const fcrRate = totalTickets > 0 ? (resolvedCount / totalTickets) * 100 : 0;
        const fcrAi = totalTickets > 0 ? (aiResolved / totalTickets) * 100 : 0;
        const fcrHuman = totalTickets > 0 ? (humanResolved / totalTickets) * 100 : 0;

        const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        const docId = `${tenantId}_${dateStr}`;

        await db.collection("daily_metrics").doc(docId).set({
          tenant_id: tenantId,
          date: yesterday,
          fcr_rate: fcrRate,
          fcr_ai: fcrAi,
          fcr_human: fcrHuman,
          total_tickets: totalTickets,
          resolved_tickets: resolvedCount,
          escalated_tickets: escalatedCount,
          tma: {
             total: computeAvg(tma.total),
             by_type: { ai: computeAvg(tma.by_type.ai), human: computeAvg(tma.by_type.human) },
             by_channel: parseMap(tma.by_channel)
          },
          tmr: {
             total: computeAvg(tmr.total),
             by_type: { ai: computeAvg(tmr.by_type.ai), human: computeAvg(tmr.by_type.human) },
             by_channel: parseMap(tmr.by_channel)
          },
          calculatedAt: new Date()
        }, { merge: true });
        
        // --- SENTIMENT AGGREGATION ---
        try {
          const startOfYesterdayObj = customAdmin.firestore.Timestamp.fromDate(yesterday);
          const endOfYesterdayObj = customAdmin.firestore.Timestamp.fromDate(endOfYesterday);
          
          const msgsSnap = await db.collectionGroup("messages")
            .where("tenantId", "==", tenantId)
            .where("createdAt", ">=", startOfYesterdayObj)
            .where("createdAt", "<=", endOfYesterdayObj)
            .get();

          let positive = 0;
          let neutral = 0;
          let negative = 0;
          let angry = 0;
          let urgent = 0;
          
          msgsSnap.docs.forEach(doc => {
            const data = doc.data();
            const s = data.sentiment;
            if (s === "POSITIVE") positive++;
            else if (s === "NEUTRAL") neutral++;
            else if (s === "NEGATIVE") negative++;
            else if (s === "ANGRY") angry++;
            else if (s === "URGENT") urgent++;
          });

          const totalMessages = positive + neutral + negative + angry + urgent;
          
          if (totalMessages > 0) {
            const angryPercent = (angry / totalMessages) * 100;
            const rates = {
               positive: (positive / totalMessages) * 100,
               neutral: (neutral / totalMessages) * 100,
               negative: (negative / totalMessages) * 100,
               angry: angryPercent,
               urgent: (urgent / totalMessages) * 100
            };

            await db.collection("daily_sentiment_metrics").doc(docId).set({
              tenant_id: tenantId,
              date: yesterday,
              total_classified_messages: totalMessages,
              raw_counts: { positive, neutral, negative, angry, urgent },
              rates
            }, { merge: true });

            if (angryPercent > 15) {
              await db.collection("notifications").add({
                tenantId,
                title: "ALERTA DE DESVIO: Sentimento ANGRY Alto",
                message: `O nível de irritação dos clientes ontem (${angryPercent.toFixed(1)}%) ultrapassou o limite de 15%. Equipe de qualidade foi notificada por email.`,
                type: "SENTIMENT_ALERT",
                read: false,
                timestamp: customAdmin.firestore.FieldValue.serverTimestamp()
              });
              
              try {
                  const tDoc = await db.collection("tenants").doc(tenantId).get();
                  if (tDoc.exists) {
                      const adminEmail = tDoc.data()?.email || "noturcursos1@gmail.com";
                      const { sendEmail } = await import("../lib/email");
                      await sendEmail(adminEmail, `ALERTA DE DESVIO: Sentimento ANGRY Crítico`, `Atenção, o índice de clientes irritados (ANGRY) registrado ontem atingiu ${angryPercent.toFixed(1)}%, ultrapassando o limite de 15%. Total de mensagens analisadas: ${totalMessages}.`);
                      console.log(`[ALERT] EMAIL TO ADMIN: ANGRY rate at ${angryPercent.toFixed(1)}% for tenant ${tenantId} sent to ${adminEmail}`);
                  }
              } catch (e) {
                  console.error("Failed to send alert email", e);
              }
            }
          }
        } catch (err) {
          console.error("Error calculating daily sentiment metrics for", tenantId, err);
        }
        // -----------------------------
        
        console.log(`[FCR Worker] Calculated metrics for tenant ${tenantId}: FCR=${fcrRate.toFixed(2)}%`);
      }
    } catch (e) {
      console.error("[FCR Worker] Error calculating daily metrics:", e);
    }
  }
}, {
  connection: redis as any,
  concurrency: 1
});

// Configure the cron job to run at 1am daily
if (!isMockRedis) {
  try {
     // Using upsertJobScheduler for repeatable jobs in BullMQ 5.x
     fcrQueue.upsertJobScheduler(
        'daily-fcr-job',
        { pattern: '0 1 * * *', tz: 'America/Sao_Paulo' },
        { name: 'calculate_fcr_daily', data: {} }
     ).catch((e: any) => console.error("Error scheduling FCR job", e));
  } catch(e) {
     console.error("Could not schedule fcr job", e);
  }
}
