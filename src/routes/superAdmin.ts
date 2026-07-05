import express from "express";
import { adminDb as db } from "../lib/firebaseAdmin.ts";
import { verifySupabaseToken } from "../lib/authVerify.ts";

export const superAdminRouter = express.Router();

export const verifySuperAdmin = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await verifySupabaseToken(token);
    // FZ-3: super admin agora é role da tabela users (era custom claim isSuperAdmin)
    if (decoded.role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden: SuperAdmin only" });
    }
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

superAdminRouter.get("/ai-circuit", verifySuperAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const providers = ["gemini", "openai", "anthropic"];
    const circuitStatus: Record<string, string> = {};
    const { default: redisClient } = await import("../lib/redis");

    if (redisClient) {
      for (const p of providers) {
        const val = await redisClient.get(`llm_circuit:${p}`);
        if (val === "OPEN") {
          circuitStatus[p] = "OPEN";
        } else {
          const recent = await redisClient.get(`llm_circuit:recent_open:${p}`);
          if (recent) {
            circuitStatus[p] = "HALF_OPEN";
          } else {
            circuitStatus[p] = "CLOSED";
          }
        }
      }
    } else {
      providers.forEach((p) => (circuitStatus[p] = "CLOSED"));
    }

    // Fetch fallback history
    const snapshot = await db
      .collection("audit_logs")
      .where("event_type", "==", "LLM_FALLBACK")
      .limit(50)
      .get();

    const fallbacks = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => {
        const timeA =
          a.timestamp?._seconds ||
          new Date(a.timestamp).getTime() / 1000 ||
          0;
        const timeB =
          b.timestamp?._seconds ||
          new Date(b.timestamp).getTime() / 1000 ||
          0;
        return timeB - timeA;
      });

    res.json({ circuitStatus, fallbacks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

superAdminRouter.get("/tenants", verifySuperAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const snapshot = await db.collection("tenants").get();
    const tenants = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(tenants);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

superAdminRouter.post("/custom-domains", verifySuperAdmin, express.json(), async (req: express.Request, res: express.Response) => {
  try {
    const { domain, tenantId } = req.body;
    const ref = db.collection("custom_domains").doc(domain);
    await ref.set({
      domain,
      tenantId,
      createdAt: new Date().toISOString()
    });
    res.json({ status: "success", domain, tenantId });
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

superAdminRouter.get("/tenants/:id", verifySuperAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const doc = await db.collection("tenants").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

superAdminRouter.post("/tenants/:id/suspend", verifySuperAdmin, express.json(), async (req: express.Request, res: express.Response) => {
  try {
    const docRef = db.collection("tenants").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    await docRef.update({ status: "suspended" });
    res.json({ success: true, message: "Tenant suspended" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

superAdminRouter.post("/tenants/:id/reactivate", verifySuperAdmin, express.json(), async (req: express.Request, res: express.Response) => {
  try {
    const docRef = db.collection("tenants").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    await docRef.update({ status: "active" });
    res.json({ success: true, message: "Tenant reactivated" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

superAdminRouter.get("/metrics", verifySuperAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { calculateMRR, calculateChurnRate } = await import("../lib/saasMetrics");

    const now = new Date();
    // Current Metrics
    const currentMRR = await calculateMRR(now);
    const currentChurnRate = await calculateChurnRate(now);

    // Previous Month Metrics
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMRR = await calculateMRR(prevMonth);
    const previousChurnRate = await calculateChurnRate(prevMonth);

    const mrrVariation =
      previousMRR > 0 ? ((currentMRR - previousMRR) / previousMRR) * 100 : 0;

    // Historical MRR (last 12 months)
    const mrrHistory: any[] = [];
    const historySnap = await db
      .collection("saas_metrics")
      .orderBy("date", "desc")
      .limit(12)
      .get();

    historySnap.forEach((doc) => {
      const data = doc.data();
      mrrHistory.push({
        month: doc.id,
        mrr: data.mrr || 0,
      });
    });
    // Reverse to chronological order
    mrrHistory.reverse();

    const tenantsSnap = await db.collection("tenants").get();
    let activeTenants = 0;
    let churnedTenants = 0;
    const tenantsList: any[] = [];

    tenantsSnap.docs.forEach((doc) => {
      const data = doc.data();
      let tenantMrr = 0;
      if (data.status === "active") {
        activeTenants++;
        if (data.subscription?.monthly_price) {
          tenantMrr = Number(data.subscription.monthly_price);
        } else if (data.plan === "enterprise") {
          tenantMrr = 1500;
        } else if (data.plan === "pro") {
          tenantMrr = 500;
        } else if (data.plan === "starter") {
          tenantMrr = 200;
        }

        tenantsList.push({
          id: doc.id,
          name: data.companyName || data.name || doc.id,
          mrr: tenantMrr,
          plan: data.plan,
        });
      } else if (data.status === "cancelled") {
        churnedTenants++;
      }
    });

    tenantsList.sort((a, b) => b.mrr - a.mrr);
    const topTenants = tenantsList.slice(0, 10);

    res.json({
      total_mrr: currentMRR,
      mrr_variation: mrrVariation,
      current_churn_rate: currentChurnRate,
      previous_churn_rate: previousChurnRate,
      mrr_history: mrrHistory,
      top_tenants: topTenants,
      active_tenants: activeTenants,
      churned_tenants: churnedTenants,
      total_tenants: tenantsSnap.size,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default superAdminRouter;
