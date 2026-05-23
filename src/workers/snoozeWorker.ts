import { Queue, Worker } from "bullmq";
import redis, { connection } from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import admin from "../lib/firebaseAdmin";
import { logger } from "../lib/logger";

const isMockRedis = !((redis as any).options);

export const snoozeQueue = isMockRedis ? {
  add: async () => {
    logger.warn("mock_snooze_queue_used");
    return { id: "mock" };
  }
} as any : new Queue('snooze_checker', {
  connection
});

if (!isMockRedis) {
  new Worker('snooze_checker', async (job) => {
    try {
      const now = new Date();
      // To avoid composite index requirements and considering snoozed tickets are relatively low,
      // we can query all 'snoozed' tickets and filter them in memory, or use a simpler query.
      const ticketsSnap = await db.collection("tickets")
            .where("status", "==", "snoozed")
            .get();
            
      for (const ticketDoc of ticketsSnap.docs) {
        const ticket = ticketDoc.data();
        if (ticket.snoozed_until) {
           const snoozedUntilDate = ticket.snoozed_until.toDate ? ticket.snoozed_until.toDate() : new Date(ticket.snoozed_until);
           if (snoozedUntilDate <= now) {
             // Reactive ticket
             await ticketDoc.ref.update({
               status: 'open',
               updatedAt: admin.firestore.FieldValue.serverTimestamp()
               // We keep snoozed_reason/until for history or clear them if needed.
             });

             // Generate a system message
             await db.collection(`tickets/${ticketDoc.id}/messages`).add({
               ticketId: ticketDoc.id,
               senderType: "system",
               text: `[SISTEMA]: O período de soneca terminou. O ticket foi reaberto. Motivo da soneca: ${ticket.snooze_reason || 'Não informado'}.`,
               createdAt: admin.firestore.FieldValue.serverTimestamp()
             });

             // Notify operator
             try {
                const pubClient = isMockRedis ? null : redis;
                if (pubClient) {
                   await pubClient.publish("operator_alerts", JSON.stringify({
                      type: "TICKET_REACTIVATED",
                      ticketId: ticketDoc.id,
                      operatorId: ticket.assignedOperatorId || ticket.snoozed_by || "supervisor",
                      message: `Ticket #${ticketDoc.id.slice(0,6)} reativado após soneca.`
                   }));
                }
             } catch (e) {
                console.error("Error publishing snooze alert", e);
             }
           }
        }
      }
    } catch (err: any) {
      logger.error("snooze_checker_error", { error: err.message });
    }
  }, { connection });

  try {
     snoozeQueue.add("check_snoozed", {}, { repeat: { pattern: "* * * * *" } });
  } catch(e) {
     console.error("Error adding snooze checker to queue", e);
  }
}
