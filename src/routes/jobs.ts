import express from "express";
import { enqueueMessage } from "../lib/queue.ts";

export const jobsRouter = express.Router();

jobsRouter.post("/schedule-pos-install", async (req, res) => {
  try {
    const { customerId, tenantId, osId, installedPlan } = req.body;
    
    // Agendar para 24 horas no futuro
    const delay = 24 * 60 * 60 * 1000;
    
    await enqueueMessage(
      tenantId || "default", 
      { customerId, tenantId: tenantId || "default", osId, installedPlan }, 
      { delay }, 
      'pos_instalacao'
    );

    return res.json({ success: true, message: "Job scheduled" });
  } catch (err: any) {
    console.error("Error scheduling pos install job:", err);
    return res.status(500).json({ error: "Failed to schedule job" });
  }
});

jobsRouter.post("/schedule-csat", async (req, res) => {
  try {
    const { ticketId, tenantId, customerId, category, resolved_by } = req.body;
    
    const delay = 60 * 1000;
    
    await enqueueMessage(
      tenantId || "default", 
      { ticketId, tenantId: tenantId || "default", customerId, category, resolved_by }, 
      { delay }, 
      'send_csat'
    );

    return res.json({ success: true, message: "CSAT job scheduled" });
  } catch (err: any) {
    console.error("Error scheduling CSAT job:", err);
    return res.status(500).json({ error: "Failed to schedule CSAT job" });
  }
});

jobsRouter.post("/schedule-sla", async (req, res) => {
  try {
    const { ticketId, tenantId, customerId } = req.body;
    
    // Level 1: 10 minutes
    await enqueueMessage(
      tenantId || "default", 
      { ticketId, tenantId: tenantId || "default", customerId, level: 1 }, 
      { delay: 10 * 60 * 1000 }, 
      'sla_warning'
    );
    
    // Level 2: 15 minutes
    await enqueueMessage(
      tenantId || "default", 
      { ticketId, tenantId: tenantId || "default", customerId, level: 2 }, 
      { delay: 15 * 60 * 1000 }, 
      'sla_warning'
    );

    return res.json({ success: true, message: "SLA jobs scheduled" });
  } catch (err: any) {
    console.error("Error scheduling SLA jobs:", err);
    return res.status(500).json({ error: "Failed to schedule SLA jobs" });
  }
});
