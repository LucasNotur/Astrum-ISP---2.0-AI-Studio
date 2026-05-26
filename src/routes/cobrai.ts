import express from "express";
import { cobraiQueue, processCobraiJob } from "../workers/cobraiWorker.ts";
import { adminDb as db } from "../lib/firebaseAdmin.ts";

export const cobraiRouter = express.Router();

const getCobraiJobs = async () => {
  if (cobraiQueue && typeof cobraiQueue.getJobs === "function") {
    try {
      return await cobraiQueue.getJobs(['waiting', 'active', 'delayed', 'paused', 'completed', 'failed']);
    } catch (e) {
      console.error("Failed to get cobrai jobs from BullMQ queue, falling back", e);
    }
  }
  return [];
};

const getCobraiJobCounts = async () => {
  if (cobraiQueue && typeof cobraiQueue.getJobCounts === "function") {
    try {
      const counts = await cobraiQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (e) {
      console.error("Failed to get cobrai counts from BullMQ, falling back", e);
    }
  }
  return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
};

// GET /api/cobrai/queue-stats
cobraiRouter.get("/queue-stats", async (req, res) => {
  try {
    const stats = await getCobraiJobCounts();
    return res.json(stats);
  } catch (err: any) {
    console.error("Error in GET /queue-stats:", err);
    return res.json({ waiting: 0, active: 0, completed: 0, failed: 0 });
  }
});

// GET /api/cobrai/queue
cobraiRouter.get("/queue", async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string;
    const rawJobs = await getCobraiJobs();
    
    const jobsList = rawJobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      status: job.status || 'waiting'
    })).filter((job: any) => {
      if (tenantId) {
        return job.data?.tenantId === tenantId;
      }
      return true;
    });
    
    return res.json(jobsList);
  } catch (err: any) {
    console.error("Error in GET /queue:", err);
    return res.json([]);
  }
});

// DELETE /api/cobrai/queue/:id
cobraiRouter.delete("/queue/:id", async (req, res) => {
  try {
    const jobId = req.params.id;
    if (cobraiQueue && typeof cobraiQueue.getJob === "function") {
      const job = await cobraiQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    }
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Error in DELETE /queue/:id:", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/cobrai/send-now
cobraiRouter.post("/send-now", async (req, res) => {
  try {
    const { customerId, stage, tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }

    if (customerId && stage) {
      const payload = { customerId, tenantId, stage };
      if (cobraiQueue && typeof cobraiQueue.add === "function" && cobraiQueue.add.name !== "mock") {
        await cobraiQueue.add("cobrai_manual", payload);
      } else {
        await processCobraiJob({ name: "cobrai_manual", data: payload });
      }
      return res.json({ ok: true, status: "scheduled_or_processed" });
    } else {
      const customersSnap = await db.collection("customers")
        .where("tenantId", "==", tenantId)
        .where("financial_status", "==", "inadimplente")
        .get();

      let count = 0;
      for (const customerDoc of customersSnap.docs) {
        const customerData = customerDoc.data();
        let currentStage = "D_MINUS_5";
        const overdueDays = customerData.overdue_days || 0;
        if (overdueDays >= 30) {
          currentStage = "D_PLUS_30";
        } else if (overdueDays >= 15) {
          currentStage = "D_PLUS_15";
        } else if (overdueDays >= 3) {
          currentStage = "D_PLUS_3";
        } else if (overdueDays === 0) {
          currentStage = "D_ZERO";
        }
        
        const payload = { customerId: customerDoc.id, tenantId, stage: currentStage };
        if (cobraiQueue && typeof cobraiQueue.add === "function" && cobraiQueue.add.name !== "mock") {
          await cobraiQueue.add("cobrai_routine", payload);
        } else {
          await processCobraiJob({ name: "cobrai_routine", data: payload });
        }
        count++;
      }
      return res.json({ ok: true, message: `Dispatched ${count} customers to CobrAI rulebook.` });
    }
  } catch (err: any) {
    console.error("Error in POST /send-now:", err);
    return res.status(500).json({ error: err.message });
  }
});
