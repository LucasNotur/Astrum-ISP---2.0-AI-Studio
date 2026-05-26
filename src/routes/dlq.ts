import express from "express";
import { adminDb as db } from "../lib/firebaseAdmin.ts";
import { getTenantQueue, messageQueue } from "../lib/queue.ts";
import { cobraiQueue } from "../workers/cobraiWorker.ts";

export const dlqRouter = express.Router();

// GET /api/dlq?tenantId=...
dlqRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId query parameter is required" });
    }

    const snapshot = await db.collection("dead_letter_queue")
      .where("tenant_id", "==", tenantId)
      .where("resolved", "==", false)
      .get();

    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.json(jobs);
  } catch (err: any) {
    console.error("Error listing DLQ jobs:", err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/dlq/:id/retry
dlqRouter.post("/:id/retry", async (req, res) => {
  try {
    const id = req.params.id;
    const docRef = db.collection("dead_letter_queue").doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Job not found in DLQ" });
    }

    const data = docSnap.data();
    if (!data) {
      return res.status(500).json({ error: "Job data is empty" });
    }

    const payload = data.payload || {};
    const type = data.type || "test";
    const tenantId = data.tenant_id || payload.tenantId || req.query.tenantId;

    if (type.includes("cobrai") || data.queue_name === "cobrai" || type === "retry") {
      if (cobraiQueue && typeof cobraiQueue.add === "function") {
        await cobraiQueue.add(type, payload);
      }
    } else {
      const queue = tenantId ? getTenantQueue(tenantId) : messageQueue;
      if (queue && typeof queue.add === "function") {
        await queue.add(type, payload);
      }
    }

    await docRef.update({
      resolved: true,
      action: "retry",
      retried_at: new Date()
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Error retrying DLQ job:", err);
    return res.status(500).json({ error: err.message });
  }
});
