import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import { getERPAdapter } from "../lib/integrations/erpAdapter";

const isMockRedis = !((redis as any).options);

export const planSyncQueue = isMockRedis ? null : new Queue("plan-sync", {
  connection: redis as any
});

export const planSyncWorker = isMockRedis ? null : new Worker("plan-sync", async (job) => {
  if (job.name === "sync_erp_catalog") {
    const tenantsSnap = await db.collection("tenants").where("active", "==", true).get();
    
    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      const tenantData = tenantDoc.data();
      
      // Skip if no ERP is configured or it's none
      if (!tenantData.erp_type || tenantData.erp_type === "nenhum") {
        continue;
      }

      try {
        const adapter = await getERPAdapter(tenantId);
        const plans = await adapter.getPlans();
        
        if (plans && Array.isArray(plans)) {
          const plansRef = db.collection("erp_plans").doc(tenantId).collection("plans");
          
          // Get current plans to compare
          const oldPlansSnap = await plansRef.get();
          const oldPlans = oldPlansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          let hasChanges = false;
          const batch = db.batch();
          
          for (const plan of plans) {
            const planId = String(plan.id || plan.plan_id || Math.random().toString(36).substr(2, 9));
            const oldPlan = oldPlans.find((p: any) => p.id === planId);
            
            // Basic diff - can be improved
            if (!oldPlan || JSON.stringify(oldPlan) !== JSON.stringify({id: planId, ...plan})) {
              hasChanges = true;
            }
            
            batch.set(plansRef.doc(planId), plan, { merge: true });
          }
          
          await batch.commit();

          if (hasChanges) {
             console.log(`[Plan Sync] Detected changes for ${tenantId}. Notifying admin.`);
             // Send notification to admin (store in firestore notifications or log)
             await db.collection("notifications").add({
                tenantId,
                title: "Atualização no Catálogo de Planos ERP",
                body: "Novos planos ou alterações detectadas no ERP e sincronizadas.",
                created_at: new Date(),
                read: false,
                type: "system"
             });
          }

          // Update cache cache caching it for 24 hours
          const cacheKey = `erp_plans:${tenantId}`;
          await redis.set(cacheKey, JSON.stringify(plans), "EX", 24 * 60 * 60);
          
          console.log(`[Plan Sync] Synced ${plans.length} plans for tenant ${tenantId}`);
        }
      } catch (error: any) {
        console.error(`[Plan Sync] Error syncing plans for ${tenantId}:`, error.message);
      }
    }
  }
}, {
  connection: redis as any
});

// Setup repeatable job
if (planSyncQueue && planSyncWorker) {
  planSyncWorker.on("failed", (job, err) => {
    console.error(`[Plan Sync] Job ${job?.id} failed:`, err);
  });
  
  planSyncQueue.add("sync_erp_catalog", {}, {
    repeat: {
      pattern: "0 0 * * *", // Every midnight
    },
    jobId: "daily-sync-erp-catalog"
  }).catch(e => console.error("Could not add repeatable plan-sync job:", e));
}
