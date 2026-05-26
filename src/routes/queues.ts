import express from "express";
import { messageQueue } from "../lib/queue.ts";

export const queuesRouter = express.Router();

const getMessageQueueCounts = async () => {
  if (messageQueue && typeof messageQueue.getJobCounts === "function") {
    try {
      const counts = await messageQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (e) {
      console.error("Failed to get message counts from BullMQ, falling back", e);
    }
  }
  return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
};

// GET /api/queues/stats
queuesRouter.get("/stats", async (req, res) => {
  try {
    const stats = await getMessageQueueCounts();
    return res.json(stats);
  } catch (err: any) {
    console.error("Error in GET /stats:", err);
    return res.json({ waiting: 0, active: 0, completed: 0, failed: 0 });
  }
});
