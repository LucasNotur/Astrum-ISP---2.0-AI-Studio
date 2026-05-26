import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import { getERPAdapter } from "../lib/integrations/erpAdapter";
import { sendAdminEmail } from "../lib/email";

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
          const oldPlans = oldPlansSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
          
          let hasChanges = false;
          const batch = db.batch();
          
          for (const plan of plans) {
            const planId = String(plan.id || plan.plan_id || Math.random().toString(36).substr(2, 9));
            const oldPlan = oldPlans.find((p: any) => p.id === planId);
            
            // Define clean diff to avoid false positives
            const cleanPlan = { id: planId, name: plan.name, price_cents: plan.price_cents, active: plan.active };
            const cleanOldPlan = oldPlan ? { id: oldPlan.id, name: oldPlan.name, price_cents: oldPlan.price_cents, active: oldPlan.active } : null;

            if (!cleanOldPlan || cleanOldPlan.name !== cleanPlan.name || cleanOldPlan.price_cents !== cleanPlan.price_cents || cleanOldPlan.active !== cleanPlan.active) {
              hasChanges = true;
            }
            
            batch.set(plansRef.doc(planId), cleanPlan, { merge: true });
          }

          // Handle removed plans
          for (const oldPlan of oldPlans) {
             const stillExists = plans.some((p: any) => String(p.id || p.plan_id) === oldPlan.id);
             if (!stillExists && oldPlan.active !== false) {
                 hasChanges = true;
                 batch.set(plansRef.doc(oldPlan.id), { active: false }, { merge: true });
             }
          }
          
          await batch.commit();

          if (hasChanges) {
             console.log(`[Plan Sync] Detected changes for ${tenantId}. Notifying admin.`);
             await sendAdminEmail(tenantId, "Atualização de Catálogo", "Detectamos alterações no seu catálogo de planos ERP.");
          }

          // Update cache cache caching it for 24 hours
          const cacheKey = `erp_plans:${tenantId}`;
          const currentPlansSnap = await plansRef.get();
          const currentPlans = currentPlansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          await redis.set(cacheKey, JSON.stringify(currentPlans), "EX", 24 * 60 * 60);
          
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
