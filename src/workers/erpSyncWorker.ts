import { Queue, Worker } from "bullmq";
import redis from "../lib/redis";
import { adminDb as db } from "../lib/firebaseAdmin";
import { getERPAdapter } from "../lib/integrations/erpAdapter";

const isMockRedis = !(redis as any).options;

export const erpSyncQueue = isMockRedis
  ? ({
      add: async () => console.warn("Using mock erpSyncQueue"),
    } as any)
  : new Queue("erp-sync", { connection: redis as any });

export const erpSyncWorker = isMockRedis
  ? null
  : new Worker(
      "erp-sync",
      async (job) => {
        const { tenantId, customerId, fields } = job.data;

        try {
          const adapter = await getERPAdapter(tenantId);
          const result = await adapter.updateCustomerData(customerId, fields);

          if (result && result.error) {
            throw new Error(result.error);
          }

          // Success: remove sync_pending completely
          await db.collection("customers").doc(customerId).update({
            sync_pending: false,
          });

          console.log(`ERP Sync successful for ${customerId}`);
        } catch (error: any) {
          console.error(`ERP Sync failed for ${customerId}:`, error.message);
          // Let BullMQ handle retry (we will use backoff in job options)
          throw error;
        }
      },
      {
        connection: redis as any,
        concurrency: 2,
      },
    );

if (erpSyncWorker) {
  erpSyncWorker.on("failed", (job, err) => {
    console.error(`ERP Sync Job ${job?.id} failed:`, err);
  });
}
