import { Queue, Worker } from "bullmq";
import redis, { connection } from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import admin from "../lib/firebaseAdmin";
import { logger } from "../lib/logger";

const isMockRedis = !((redis as any).options);

export const slaQueue = isMockRedis ? {
  add: async () => {
    logger.warn("mock_sla_queue_used");
    return { id: "mock" };
  }
} as any : new Queue('sla_monitor', {
  connection
});

if (!isMockRedis) {
  new Worker('sla_monitor', async (job) => {
    try {
      // 1. Get all tenants
      const tenantsSnap = await db.collection("tenants").get();
      for (const tenantDoc of tenantsSnap.docs) {
        const tenantId = tenantDoc.id;
        
        // Load departments for SLA logic
        const deptsSnap = await db.collection("tenants").doc(tenantId).collection("departments").get();
        const depts = new Map<string, any>();
        deptsSnap.forEach(d => depts.set(d.id, { id: d.id, ...d.data() }));
        
        // Find open or escalated tickets
        const ticketsSnap = await db.collection("tickets")
            .where("tenantId", "==", tenantId)
            .where("status", "in", ["open", "escalated", "waiting_queue", "in_progress"])
            .get();
            
        for (const ticketDoc of ticketsSnap.docs) {
          const ticket = ticketDoc.data();
          if (ticket.sla_breached) continue; // Already breached
          
          let responseSlaMin = 15; // default 15m
          let resolutionSlaHours = 24; // default 24h
          
          if (ticket.departmentId && depts.has(ticket.departmentId)) {
            const dept = depts.get(ticket.departmentId);
            if (dept.sla_response_minutes) responseSlaMin = dept.sla_response_minutes;
            if (dept.sla_resolution_hours) resolutionSlaHours = dept.sla_resolution_hours;
          }
          
          const createdAt = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt);
          const now = new Date();
          
          // Determine if we are violating SLA
          let breached = false;
          let breachType = "";
          
          // Response SLA check
          if (!ticket.human_responded) {
            const elapsedMin = (now.getTime() - createdAt.getTime()) / 60000;
            if (elapsedMin > responseSlaMin) {
              breached = true;
              breachType = "RESPONSE_SLA";
            }
          }
          
          // Resolution SLA check
          if (!breached) {
            const elapsedHours = (now.getTime() - createdAt.getTime()) / 3600000;
            if (elapsedHours > resolutionSlaHours) {
              breached = true;
              breachType = "RESOLUTION_SLA";
            }
          }
          
          if (breached) {
            await ticketDoc.ref.update({
              sla_breached: true,
              priority: "urgent",
              breach_type: breachType,
              breach_time: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Notify supervisor or assigned operator via Redis Pub/Sub
            try {
               const pubClient = isMockRedis ? null : redis;
               if (pubClient) {
                  await pubClient.publish("operator_alerts", JSON.stringify({
                     type: "SLA_BREACH",
                     ticketId: ticketDoc.id,
                     operatorId: ticket.assignedOperatorId || "supervisor", // if assigned, notify them, otherwise supervisor
                     message: `SLA violado (Prioridade Urgente) no ticket #${ticketDoc.id}`
                  }));
               }
            } catch (e) {
               console.error("Error publishing SLA breach", e);
            }
            
            // Generate a system message
            await db.collection(`tickets/${ticketDoc.id}/messages`).add({
              ticketId: ticketDoc.id,
              senderType: "system",
              text: `[ALERTA DE SLA]: Acordo de Nível de Serviço Violado (${breachType}). Ticket marcado como urgente.`,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }
    } catch (err: any) {
      logger.error("sla_monitor_error", { error: err.message });
    }
  }, { connection });

  // Schedule repeatable job
  try {
     slaQueue.add("monitor_all", {}, { repeat: { pattern: "*/5 * * * *" } });
  } catch(e) {
     console.error("Error adding monitor to SLA queue", e);
  }
}
