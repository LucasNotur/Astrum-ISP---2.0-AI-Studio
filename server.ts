import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import fs from "fs";
import { Server as SocketIOServer } from "socket.io";
import os from "os";
import { createHmac } from "crypto";
import multer from "multer";
import { adminAuth as auth, adminDb as db } from "./src/lib/firebaseAdmin.ts";
import admin from "./src/lib/firebaseAdmin.ts";
import SmeeClient from "smee-client";
import { getIntegrationKeys, decryptCpf } from "./src/lib/dbAdmin";
import { getAIResponse } from "./src/lib/gemini.server.ts";
import redis from "./src/lib/redis.ts";
import { logger } from "./src/lib/logger.ts";
import "./src/workers/messageWorker.ts";
import "./src/workers/cobraiWorker.ts";
import "./src/workers/slaWorker.ts";
import "./src/workers/snoozeWorker.ts";
import "./src/workers/erpSyncWorker.ts";
import "./src/workers/fcrWorker.ts";
import "./src/workers/reportWorker.ts";
import "./src/workers/planSyncWorker.ts";
import "./src/workers/siteScrapeWorker.ts";
import "./src/workers/gamificationWorker.ts";

const isESM =
  typeof import.meta !== "undefined" && typeof import.meta.url !== "undefined";
let _filename: string;
let _dirname: string;

if (isESM) {
  _filename = fileURLToPath(import.meta.url);
  _dirname = path.dirname(_filename);
} else {
  // @ts-ignore
  _filename = __filename;
  // @ts-ignore
  _dirname = __dirname;
}

const processingNumbers = new Map<string, Promise<void>>();

import { tenantQueues } from "./src/lib/queue.ts";

import apiV1Router from "./src/routes/api-v1.ts";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const tenantWorkers = new Map<string, any>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // OpenAPI/Swagger config for API v1
  const swaggerOptions = {
    swaggerDefinition: {
      openapi: '3.0.0',
      info: {
        title: 'API de Atendimento (B2B)',
        version: '1.0.0',
        description: 'Documentação da API v1 para integrações de terceiros. Endpoints autenticados via X-API-Key',
      },
      servers: [
        {
           url: 'https://ais-dev-6csw5lpiggvuc7gub5drm5-366063768648.us-west2.run.app', // Ou o URL do seu app
           description: 'Development server',
        },
      ],
    },
    apis: ["./src/routes/api-v1.ts"], 
  };
  const swaggerDocs = swaggerJsDoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
  
  // Mounted external endpoints
  app.use('/api/v1', apiV1Router);

  // Middleware to parse JSON bodies (increased limit for base64 audio), and keep raw body for webhook verification
  app.use(
    express.json({
      limit: "50mb",
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const { auditMiddleware } = await import("./src/middleware/auditMiddleware");
  app.use(auditMiddleware);

  const { tenantStatusMiddleware } =
    await import("./src/middleware/tenantStatusMiddleware.ts");
  app.use(tenantStatusMiddleware);

  const customDomainCache = new Map<string, { tenantId: string, expiresAt: number }>();

  const customDomainMiddleware = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const host = req.hostname;
    if (host === "localhost" || host.includes("run.app") || req.headers["x-tenant-id"]) {
      return next();
    }
    const now = Date.now();
    let cached = customDomainCache.get(host);
    if (cached && cached.expiresAt > now) {
      if (cached.tenantId) {
        req.headers["x-tenant-id"] = cached.tenantId;
      }
      return next();
    }
    try {
      const doc = await db.collection("custom_domains").doc(host).get();
      if (doc.exists) {
        const tenantId = doc.data()?.tenantId;
        customDomainCache.set(host, { tenantId, expiresAt: now + 5 * 60 * 1000 });
        req.headers["x-tenant-id"] = tenantId;
      } else {
        customDomainCache.set(host, { tenantId: "", expiresAt: now + 5 * 60 * 1000 });
      }
    } catch(e) {
      // ignore
    }
    next();
  };

  app.use(customDomainMiddleware);

  const requireTenant = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (req.path === "/health" || req.path.startsWith("/health/") || req.path === "/webhook/evolution" || req.path === "/webhook/instagram" || req.path === "/webhook/facebook") {
      return next();
    }
    const tenantId = req.headers["x-tenant-id"] || req.body?.tenantId || req.query?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "TENANT_REQUIRED" });
    }
    (req as any).tenantId = tenantId;
    next();
  };

  app.use("/api", requireTenant as any);

  const { tenantRateLimiter } = await import("./src/middleware/tenantRateLimiter.ts");
  app.use("/api", tenantRateLimiter as any);

  const { requirePermission } =
    await import("./src/middleware/permissionMiddleware");

  // --- API Routes with Permissions Enforcement ---

  app.delete(
    "/api/customers/:id",
    requirePermission("customers", "delete"),
    async (req, res) => {
      try {
        const tenantId = (req as any).tenantId;
        const { id } = req.params;
        await db.collection("customers").doc(id).delete();
        res.json({ success: true, message: "Customer deleted successfully" });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.get(
    "/api/audit-logs",
    requirePermission("audit_logs", "read"),
    async (req, res) => {
      try {
        const tenantId = (req as any).tenantId;
        const snap = await db
          .collection("auditLogs")
          .where("tenantId", "==", tenantId)
          .orderBy("timestamp", "desc")
          .limit(50)
          .get();
        const logs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        res.json(logs);
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.get("/api/integrations/vectorstore/ping", async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || "default";
      const { vectorStore } = await import("./src/lib/vectorStore.ts");
      const store = await vectorStore;

      // We can do a dummy search or just check if it throws
      await store.search(Array(1536).fill(0), tenantId, 1);

      res.json({ connected: true, provider: "custom" });
    } catch (e: any) {
      if (e.message.includes("404") || e.message.includes("not found")) {
        // Assume connected but collection doesn't exist
        res.json({ connected: true, provider: "custom" });
      } else {
        res.json({ connected: false, error: e.message });
      }
    }
  });

  app.get("/api/personas", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { getPersonasByTenant } =
        await import("./src/lib/personaManager.ts");
      const personas = await getPersonasByTenant(tenantId);
      res.json(personas);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/personas", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { createPersona } = await import("./src/lib/personaManager.ts");
      const id = await createPersona({ ...req.body, tenant_id: tenantId });
      res.json({ id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/personas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { updatePersona } = await import("./src/lib/personaManager.ts");
      await updatePersona(id, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/voip/initiate-call", async (req, res) => {
    try {
      const { tenantId = "default", ticketId, toNumber, operatorId, operatorName } = req.body;
      if (!ticketId || !toNumber) {
        return res.status(400).json({ error: "Missing ticketId or toNumber" });
      }

      // Simulate configuring PBX API (Asterisk / Twilio Voice)
      console.log(`[VOIP] Initiating call to ${toNumber} via tenant's PBX...`);

      // Log the action to the ticket
      const { FieldValue } = await import("firebase-admin/firestore");
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("tickets")
        .doc(ticketId)
        .collection("messages")
        .add({
          role: "system",
          content: `Ligação VoIP iniciada por ${operatorName || operatorId || "Operador"} para o número ${toNumber}.`,
          type: "voip_call",
          created_at: FieldValue.serverTimestamp(),
        });

      res.json({ success: true, message: "Call initiated successfully via PBX." });
    } catch (e: any) {
      console.error("[VOIP Error]:", e);
      res.status(500).json({ error: e.message });
    }
  });


  app.delete("/api/personas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { deletePersona } = await import("./src/lib/personaManager.ts");
      await deletePersona(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DEPARTMENTS CRUD
  app.get("/api/departments", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(400).json({ error: "No tenantId" });
      const snap = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("departments")
        .get();
      const departments = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      res.json(departments);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/departments", express.json(), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) return res.status(400).json({ error: "No tenantId" });
      const docRef = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("departments")
        .add(req.body);
      res.json({ id: docRef.id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/customers/:id", express.json(), async (req, res) => {
    try {
      const tenantId = req.body.tenantId || (req as any).tenantId;
      const customerId = req.params.id;
      const payload = req.body;

      const fieldsToSync = {
        phone: payload.phone,
        email: payload.email,
        name: payload.name,
        address: payload.address,
      };

      const { getERPAdapter } =
        await import("./src/lib/integrations/erpAdapter");
      const adapter = await getERPAdapter(tenantId);

      let syncPending = false;
      try {
        const syncResult = await adapter.updateCustomerData(
          customerId,
          fieldsToSync,
        );
        if (syncResult && syncResult.error) {
          syncPending = true;
        }
      } catch (e) {
        console.warn("Immediate ERP sync failed, scheduling retry", e);
        syncPending = true;
      }

      if (syncPending) {
        // Salva localmente com sync_pending e joga na fila pra retry a cada 30min
        await db.collection("customers").doc(customerId).update({
          sync_pending: true,
        });

        const { erpSyncQueue } = await import("./src/workers/erpSyncWorker");
        await erpSyncQueue.add(
          "sync-customer",
          {
            tenantId,
            customerId,
            fields: fieldsToSync,
          },
          {
            delay: 30 * 60 * 1000,
            attempts: 5,
            backoff: { type: "fixed", delay: 30 * 60 * 1000 },
          },
        );
      }

      res.json({ success: true, syncPending });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/departments/:id", express.json(), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      if (!tenantId) return res.status(400).json({ error: "No tenantId" });
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("departments")
        .doc(id)
        .set(req.body, { merge: true });
      res.json({ id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/departments/:id", async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      if (!tenantId) return res.status(400).json({ error: "No tenantId" });
      await db
        .collection("tenants")
        .doc(tenantId)
        .collection("departments")
        .doc(id)
        .delete();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/ai-config/:tenantId", async (req, res) => {
    try {
      const snap = await db.collection("ai_provider_configs").get();
      const configs = snap.docs
        .filter((d) => d.id.startsWith(req.params.tenantId + "_"))
        .map((d) => ({
          function: d.id.split("_").slice(1).join("_"),
          ...d.data(),
        }));
      res.json(configs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/ai-config/:tenantId/:function", async (req, res) => {
    try {
      const docRef = db
        .collection("ai_provider_configs")
        .doc(`${req.params.tenantId}_${req.params.function}`);
      await docRef.set(req.body, { merge: true });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Middleware verifySuperAdmin
  const verifySuperAdmin = async (
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
      const decoded = await auth.verifyIdToken(token);
      if (decoded.isSuperAdmin !== true) {
        return res.status(403).json({ error: "Forbidden: SuperAdmin only" });
      }
      (req as any).user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  app.get("/api/super-admin/ai-circuit", verifySuperAdmin, async (req, res) => {
    try {
      const providers = ["gemini", "openai", "anthropic"];
      const circuitStatus: Record<string, string> = {};
      const { default: redisClient } = await import("./src/lib/redis");

      if (redisClient) {
        for (const p of providers) {
          const val = await redisClient.get(`llm_circuit:${p}`);
          if (val === "OPEN") {
            circuitStatus[p] = "OPEN";
          } else {
            const recent = await redisClient.get(
              `llm_circuit:recent_open:${p}`,
            );
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

  app.get("/api/super-admin/tenants", verifySuperAdmin, async (req, res) => {
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

  app.post("/api/super-admin/custom-domains", verifySuperAdmin, async (req, res) => {
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

  app.get("/api/domains/verify", async (req, res) => {
    try {
      const { domain } = req.query;
      if (!domain || typeof domain !== 'string') return res.status(400).json({ error: "missing domain" });
      
      // Simulate DNS verification
      const tenantId = req.headers["x-tenant-id"] || "default";
      await db.collection("custom_domains").doc(domain).set({
        domain,
        tenantId,
        verified: true,
        createdAt: new Date().toISOString()
      }, { merge: true });
      
      res.json({ status: "verified" });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(
    "/api/super-admin/tenants/:id",
    verifySuperAdmin,
    async (req, res) => {
      try {
        const doc = await db.collection("tenants").doc(req.params.id).get();
        if (!doc.exists) {
          return res.status(404).json({ error: "Tenant not found" });
        }
        res.json({ id: doc.id, ...doc.data() });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/super-admin/tenants/:id/suspend",
    verifySuperAdmin,
    express.json(),
    async (req, res) => {
      try {
        await db
          .collection("tenants")
          .doc(req.params.id)
          .update({ status: "suspended" });
        res.json({ success: true, message: "Tenant suspended" });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/super-admin/tenants/:id/reactivate",
    verifySuperAdmin,
    express.json(),
    async (req, res) => {
      try {
        await db
          .collection("tenants")
          .doc(req.params.id)
          .update({ status: "active" });
        res.json({ success: true, message: "Tenant reactivated" });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/settings/holidays/fetch-national", express.json(), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId || req.body.tenantId;
      if (!tenantId) {
         return res.status(400).json({ error: "Missing tenantId" });
      }
      const { fetchAndSaveNationalHolidays } = await import("./src/lib/holidays");
      const data = await fetchAndSaveNationalHolidays(tenantId);
      res.json({ success: true, count: data.length });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings/fcr-target", express.json(), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenantId" });
      }
      const { fcr_target } = req.body;
      if (typeof fcr_target !== "number") {
        return res.status(400).json({ error: "Invalid target" });
      }

      await db.collection("tenants").doc(tenantId).update({
        fcr_target,
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error("Error setting FCR target:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/metrics/time-quality", express.json(), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenantId" });
      }

      const { period = "7d", department = "all" } = req.body;
      let days = 7;
      if (period === "30d") days = 30;
      if (period === "90d") days = 90;

      const now = new Date();
      const startDate = new Date();
      startDate.setDate(now.getDate() - days);

      const prevStartDate = new Date();
      prevStartDate.setDate(now.getDate() - days * 2);

      let ticketsQuery = db
        .collection("tickets")
        .where("tenantId", "==", tenantId)
        .where("createdAt", ">=", prevStartDate);
      if (department !== "all") {
        ticketsQuery = ticketsQuery.where("departmentId", "==", department);
      }

      const snap = await ticketsQuery.get();

      let tmaSum = 0,
        tmaCount = 0;
      let prevTmaSum = 0,
        prevTmaCount = 0;

      let tmrSum = 0,
        tmrCount = 0;
      let prevTmrSum = 0,
        prevTmrCount = 0;

      const historyMap: any = {};
      const agentMap: any = {};

      snap.docs.forEach((doc) => {
        const t = doc.data();
        const createdDt =
          t.createdAt?.toDate?.() ||
          (t.createdAt ? new Date(t.createdAt) : null);
        if (!createdDt) return;

        const isCurrentPeriod = createdDt >= startDate;

        const resolvedDt =
          t.resolvedAt?.toDate?.() ||
          (t.resolved_at ? new Date(t.resolved_at) : null);
        const firstRespDt = t.human_first_response_at?.toDate?.() || null;

        if (resolvedDt) {
          const diff = resolvedDt.getTime() - createdDt.getTime();
          if (isCurrentPeriod) {
            tmaSum += diff;
            tmaCount++;
            const type =
              t.resolvedBy === "ai" || t.handledByAI ? "ai" : "human";

            // For grouping by week, we'll just group by day to make it simpler, or actually "por semana" was requested.
            // Let's group by start of week.
            const day = new Date(createdDt);
            day.setHours(0, 0, 0, 0);
            const dayOfWeek = day.getDay();
            const startOfWeek = new Date(day);
            startOfWeek.setDate(day.getDate() - dayOfWeek);
            const weekStr = startOfWeek.toISOString().split("T")[0];

            if (!historyMap[weekStr]) {
              historyMap[weekStr] = {
                week: weekStr,
                tma_ai_sum: 0,
                tma_ai_count: 0,
                tma_human_sum: 0,
                tma_human_count: 0,
              };
            }
            if (type === "ai") {
              historyMap[weekStr].tma_ai_sum += diff;
              historyMap[weekStr].tma_ai_count++;
            } else {
              historyMap[weekStr].tma_human_sum += diff;
              historyMap[weekStr].tma_human_count++;
            }

            // Agent ranking
            if (type === "human" && t.assignedTo) {
              if (!agentMap[t.assignedTo])
                agentMap[t.assignedTo] = {
                  sum: 0,
                  count: 0,
                  agentId: t.assignedTo,
                };
              agentMap[t.assignedTo].sum += diff;
              agentMap[t.assignedTo].count++;
            }
          } else {
            prevTmaSum += diff;
            prevTmaCount++;
          }
        }

        if (firstRespDt) {
          const diff = firstRespDt.getTime() - createdDt.getTime();
          if (isCurrentPeriod) {
            tmrSum += diff;
            tmrCount++;
          } else {
            prevTmrSum += diff;
            prevTmrCount++;
          }
        }
      });

      const currentTma = tmaCount > 0 ? tmaSum / tmaCount : 0;
      const prevTma = prevTmaCount > 0 ? prevTmaSum / prevTmaCount : 0;
      const tmaTrend =
        prevTma > 0 ? ((currentTma - prevTma) / prevTma) * 100 : 0;

      const currentTmr = tmrCount > 0 ? tmrSum / tmrCount : 0;
      const prevTmr = prevTmrCount > 0 ? prevTmrSum / prevTmrCount : 0;
      const tmrTrend =
        prevTmr > 0 ? ((currentTmr - prevTmr) / prevTmr) * 100 : 0;

      const history = Object.values(historyMap)
        .map((h: any) => ({
          week: h.week,
          tma_ai: h.tma_ai_count > 0 ? h.tma_ai_sum / h.tma_ai_count : 0,
          tma_human:
            h.tma_human_count > 0 ? h.tma_human_sum / h.tma_human_count : 0,
        }))
        .sort((a: any, b: any) => a.week.localeCompare(b.week));

      const rankingPromises = Object.values(agentMap).map(async (a: any) => {
        const userDoc = await db.collection("users").doc(a.agentId).get();
        const name = userDoc.exists
          ? userDoc.data()?.name || userDoc.data()?.email || a.agentId
          : a.agentId;
        return {
          name,
          tma: a.sum / a.count,
          tickets: a.count,
        };
      });

      const ranking = await Promise.all(rankingPromises);
      ranking.sort((a, b) => a.tma - b.tma);

      res.json({
        success: true,
        tma: currentTma,
        tma_trend: tmaTrend,
        tmr: currentTmr,
        tmr_trend: tmrTrend,
        history,
        ranking: ranking.slice(0, 10),
      });
    } catch (e: any) {
      console.error("Error time quality:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/metrics/fcr", express.json(), async (req, res) => {
    try {
      const tenantId = (req as any).tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenantId" });
      }

      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      const fcr_target = tenantDoc.data()?.fcr_target || 80; // Defaults to 80%

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const metricsSnap = await db
        .collection("daily_metrics")
        .where("tenant_id", "==", tenantId)
        .where("date", ">=", thirtyDaysAgo)
        .orderBy("date", "asc")
        .get();

      const history = metricsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          date: data.date.toDate().toISOString().split("T")[0],
          fcr_rate: data.fcr_rate || 0,
          fcr_ai: data.fcr_ai || 0,
          fcr_human: data.fcr_human || 0,
          total_tickets: data.total_tickets || 0,
          escalated_tickets: data.escalated_tickets || 0,
        };
      });

      res.json({ success: true, history, fcr_target });
    } catch (e: any) {
      console.error("/api/metrics/fcr error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/super-admin/metrics", verifySuperAdmin, async (req, res) => {
    try {
      const { calculateMRR, calculateChurnRate } =
        await import("./src/lib/saasMetrics");

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
      const mrrHistory = [];
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

  app.get("/api/billing/subscription/:tenantId", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { getSubscriptionsByTenant } = await import("./src/lib/billing.ts");
      const subs = await getSubscriptionsByTenant(tenantId);
      const activeSub = subs.find(
        (s) => s.status === "ACTIVE" || s.status === "active",
      );
      res.json({ subscription: activeSub || null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/billing/invoices/:tenantId", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { getBillingInvoicesByTenant } =
        await import("./src/lib/billing.ts");
      const invoices = await getBillingInvoicesByTenant(tenantId);
      res.json({ invoices });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/onboarding/provision", express.json(), async (req, res) => {
    try {
      const { email, password, companyName, cnpj, name, planId } = req.body;
      const { validateCnpj } = await import("./src/utils/cnpj.ts");
      const { createSubscription } = await import("./src/lib/billing.ts");

      if (!validateCnpj(cnpj)) {
        return res.status(400).json({ error: "Invalid CNPJ" });
      }

      const userRecord = await auth.createUser({
        email,
        password,
        displayName: name,
      });

      const tenantId = `tenant_${Date.now()}`;

      await db
        .collection("tenants")
        .doc(tenantId)
        .set({
          id: tenantId,
          companyName,
          cnpj,
          cpf_cnpj: cnpj,
          status: "provisioning",
          plan_id: planId || "FREE",
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        });

      await auth.setCustomUserClaims(userRecord.uid, {
        tenantId,
        role: "owner",
      });

      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email,
        displayName: name,
        tenantId,
        role: "owner",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (planId && planId !== "FREE") {
        try {
          await createSubscription(tenantId, planId);
        } catch (e) {
          console.error("Error creating Asaas subscription: ", e);
        }
      }

      await db.collection("tenants").doc(tenantId).update({
        status: "active",
      });

      const { seedNewTenant } = await import("./src/lib/tenantSeed.ts");
      await seedNewTenant(tenantId, companyName, userRecord.uid);

      const verificationCode = Math.floor(
        100000 + Math.random() * 900000,
      ).toString();
      const redis = (await import("./src/lib/redis.ts")).default;
      if (redis) {
        await redis.setex(`email_verify:${tenantId}`, 1800, verificationCode);
      }

      const { sendWelcomeEmail } = await import("./src/lib/email.ts");
      const appUrl = process.env.APP_URL || "http://localhost:5173";
      await sendWelcomeEmail(
        email,
        name,
        companyName,
        `${appUrl}/login`,
        verificationCode,
      );

      res.status(200).json({
        tenantId,
        loginUrl: "/login",
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/onboarding/verify-email", express.json(), async (req, res) => {
    try {
      const { tenantId, code } = req.body;
      if (!tenantId || !code) {
        return res.status(400).json({ error: "Missing tenantId or code" });
      }

      const redis = (await import("./src/lib/redis.ts")).default;
      if (!redis) {
        return res.status(500).json({ error: "Redis not available" });
      }

      const storedCode = await redis.get(`email_verify:${tenantId}`);

      if (!storedCode) {
        return res.status(400).json({ error: "Code expired or not found" });
      }

      if (storedCode !== code.toString()) {
        return res.status(400).json({ error: "Invalid code" });
      }

      await redis.del(`email_verify:${tenantId}`);
      res
        .status(200)
        .json({ success: true, message: "Email verified successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ASaaS Webhook
  app.post("/api/billing/webhook", express.json(), async (req, res) => {
    try {
      const asaasToken = req.headers["asaas-access-token"];
      if (
        asaasToken !== process.env.ASAAS_ACCESS_TOKEN &&
        asaasToken !== process.env.ASAAS_API_KEY
      ) {
        return res.status(403).json({ error: "Invalid access token" });
      }

      const { event, payment } = req.body;
      const { updateBillingInvoice, createBillingInvoice } =
        await import("./src/lib/billing.ts");
      const { messageQueue } = await import("./src/lib/queue.ts");

      if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
        // Update tenant status to active
        if (payment?.subscription) {
          const subsQuery = await db
            .collection("subscriptions")
            .where("asaas_subscription_id", "==", payment.subscription)
            .get();
          if (!subsQuery.empty) {
            const sub = subsQuery.docs[0];
            await db
              .collection("tenants")
              .doc(sub.data().tenant_id)
              .update({ billing_status: "paid", status: "active" });

            await createBillingInvoice({
              tenant_id: sub.data().tenant_id,
              subscription_id: sub.id,
              amount_cents: Math.round(payment.value * 100),
              status: "PAID",
              due_date: new Date(payment.dueDate),
              paid_at: new Date(payment.paymentDate || new Date()),
              invoice_url: payment.invoiceUrl || payment.bankSlipUrl,
            });
          }
        }
      } else if (event === "PAYMENT_OVERDUE") {
        if (payment?.subscription) {
          const subsQuery = await db
            .collection("subscriptions")
            .where("asaas_subscription_id", "==", payment.subscription)
            .get();
          if (!subsQuery.empty) {
            const subDoc = subsQuery.docs[0];
            const tenantId = subDoc.data().tenant_id;
            await db
              .collection("tenants")
              .doc(tenantId)
              .update({ billing_status: "overdue" });

            // Agenda lock-out em 3 dias via BullMQ
            const { cobraiQueue } =
              await import("./src/workers/cobraiWorker.ts");
            await cobraiQueue.add(
              "lockout_tenant",
              { tenantId },
              { delay: 3 * 24 * 60 * 60 * 1000 },
            );
          }
        }
      } else if (event === "PAYMENT_DELETED") {
        if (payment?.subscription) {
          const subsQuery = await db
            .collection("subscriptions")
            .where("asaas_subscription_id", "==", payment.subscription)
            .get();
          if (!subsQuery.empty) {
            const subDoc = subsQuery.docs[0];
            const tenantId = subDoc.data().tenant_id;
            const { cancelSubscription } = await import("./src/lib/billing.ts");
            try {
              await cancelSubscription(tenantId);
            } catch (e) {
              // May fail if already cancelled or without token, fallback to DB
              await db
                .collection("subscriptions")
                .doc(subDoc.id)
                .update({ status: "CANCELLED" });
            }
          }
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Billing Webhook Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // LGPD
  app.post(
    "/api/lgpd/forget-me",
    requirePermission("lgpd", "admin"),
    express.json(),
    async (req, res) => {
      try {
        const { customerId, tenantId } = req.body;
        if (!customerId)
          return res.status(400).json({ error: "Missing customerId" });

        const tId = tenantId || "default";
        const { logAuditEvent } = await import("./src/lib/audit.ts");
        const { createHash } = await import("crypto");
        const batch = db.batch();

        // 1. Customer
        const customerRef = db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        let oldCustomerData = null;
        if (customerSnap.exists) {
          oldCustomerData = customerSnap.data();
          batch.update(customerRef, {
            name: "[REMOVIDO_LGPD]",
            email: "[REMOVIDO_LGPD]",
            phone: "[REMOVIDO_LGPD]",
            address: "[REMOVIDO_LGPD]",
            cpf: "[REMOVIDO_LGPD]",
            rg: "[REMOVIDO_LGPD]",
            cep: "[REMOVIDO_LGPD]",
          });
        }

        // 2. Tickets & messages
        const ticketsSnap = await db
          .collection("tickets")
          .where("customerId", "==", customerId)
          .get();
        for (const tDoc of ticketsSnap.docs) {
          batch.update(tDoc.ref, {
            customerName: "[REMOVIDO_LGPD]",
            subject: "[REMOVIDO_LGPD]",
          });
          const messagesSnap = await tDoc.ref.collection("messages").get();
          for (const mDoc of messagesSnap.docs) {
            batch.update(mDoc.ref, {
              text: "[REMOVIDO_LGPD]",
            });
          }
        }

        // 3. Service Orders
        const orderSnap = await db
          .collection("service_orders")
          .where("customerId", "==", customerId)
          .get();
        for (const oDoc of orderSnap.docs) {
          batch.update(oDoc.ref, {
            customerName: "[REMOVIDO_LGPD]",
            address: "[REMOVIDO_LGPD]",
            description: "[REMOVIDO_LGPD]",
            aiSummary: "[REMOVIDO_LGPD]",
          });
        }

        // 4. Contracts
        const contractsSnap = await db
          .collection("contracts")
          .where("customerId", "==", customerId)
          .get();
        for (const cDoc of contractsSnap.docs) {
          batch.update(cDoc.ref, {
            address: "[REMOVIDO_LGPD]",
            contractBody: "[REMOVIDO_LGPD]",
          });
        }

        await batch.commit();

        const hash = createHash("sha256")
          .update(`${tId}:${customerId}:${Date.now()}`)
          .digest("hex");

        await logAuditEvent({
          event_type: "LGPD_FORGET_ME",
          tenant_id: tId,
          user_id: (req.headers["x-user-id"] as string) || "system",
          ip_address: req.ip,
          resource_id: customerId,
          new_value: { hash, action: "ANONYMIZED_CASCADED" },
          old_value: oldCustomerData,
        });

        res.json({ success: true, hash });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/lgpd/export",
    requirePermission("lgpd", "admin"),
    async (req, res) => {
      try {
        const { customerId, tenantId } = req.query;
        if (!customerId)
          return res.status(400).json({ error: "Missing customerId" });

        const tId = (tenantId as string) || "default";
        const { logAuditEvent } = await import("./src/lib/audit.ts");

        const customerSnap = await db
          .collection("customers")
          .doc(customerId as string)
          .get();
        const customerData = customerSnap.exists ? customerSnap.data() : null;

        const ticketsSnap = await db
          .collection("tickets")
          .where("customerId", "==", customerId)
          .get();
        const tickets = [];
        for (const tDoc of ticketsSnap.docs) {
          const tData = tDoc.data();
          const mSnap = await tDoc.ref.collection("messages").get();
          tData.messages = mSnap.docs.map((m) => m.data());
          tickets.push(tData);
        }

        const osSnap = await db
          .collection("service_orders")
          .where("customerId", "==", customerId)
          .get();
        const serviceOrders = osSnap.docs.map((d) => d.data());

        const contractsSnap = await db
          .collection("contracts")
          .where("customerId", "==", customerId)
          .get();
        const contracts = contractsSnap.docs.map((d) => d.data());

        const exportData = {
          customer: customerData,
          tickets,
          serviceOrders,
          contracts,
        };

        await logAuditEvent({
          event_type: "LGPD_EXPORT",
          tenant_id: tId,
          user_id: (req.headers["x-user-id"] as string) || "system",
          ip_address: req.ip,
          resource_id: customerId as string,
          new_value: { action: "DATA_EXPORTED" },
          old_value: null,
        });

        res.json(exportData);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/unmask", express.json(), async (req, res) => {
    try {
      const { value, reason } = req.body;
      const tenantId = (req as any).tenantId;
      const userId =
        (req.headers["x-user-id"] as string) || req.body?.userId || "system";
      const { unmask } = await import("./src/lib/dataMasking");
      const result = await unmask(value, userId, reason, tenantId);
      res.json({ success: true, value: result });
    } catch (e: any) {
      res.status(403).json({ error: e.message });
    }
  });

  app.post("/api/keys", express.json(), async (req, res) => {
    try {
      const { integrationKeys, tenantId } = req.body;
      const tId = tenantId || "default";

      if (tId === "default") {
        // Global keys
        await db
          .collection("settings")
          .doc("integrations")
          .set(integrationKeys, { merge: true });
      } else {
        // Tenant-specific keys
        await db
          .collection("tenants")
          .doc(tId)
          .collection("settings")
          .doc("integrations")
          .set(integrationKeys, { merge: true });
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Wrapper for Client-Side testing AI directly
  app.post("/api/ai/ask", express.json(), async (req, res) => {
    try {
      const {
        history,
        forceCategory,
        customerData,
        ticketId,
        sessionState,
        tenantId,
        remoteJid,
      } = req.body;
      const { getAIResponse } = await import("./src/lib/gemini.server.ts");
      const result = await getAIResponse(
        history,
        forceCategory,
        customerData,
        ticketId,
        sessionState,
        tenantId || "default",
        remoteJid,
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/quality/live-stats", async (req, res) => {
    try {
      const now = new Date();
      const last24h = admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() - 24 * 60 * 60 * 1000),
      );
      const last7d = admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      );

      const openTicketsSnap = await db
        .collection("tickets")
        .where("status", "==", "open")
        .get();
      const open_tickets = openTicketsSnap.size;

      const recentTicketsSnap = await db
        .collection("tickets")
        .where("createdAt", ">=", last24h)
        .get();
      let resolvedCount = 0;
      let escalatedCount = 0;
      let totalResolutionTime = 0;
      let resolvedWithTimeCount = 0;

      recentTicketsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.status === "resolved" && !data.escalated) {
          resolvedCount++;
          if (data.resolvedAt && data.createdAt) {
            const t = data.resolvedAt.toMillis() - data.createdAt.toMillis();
            totalResolutionTime += t;
            resolvedWithTimeCount++;
          }
        }
        if (data.escalated) {
          escalatedCount++;
        }
      });

      const totalRecent = recentTicketsSnap.size;
      const resolved_last_24h =
        totalRecent > 0 ? (resolvedCount / totalRecent) * 100 : 0;
      const avg_response_time_ms =
        resolvedWithTimeCount > 0
          ? totalResolutionTime / resolvedWithTimeCount
          : 0;

      const csatSnap = await db
        .collection("csat_ratings")
        .where("createdAt", ">=", last7d)
        .get();
      let totalCsat = 0;
      csatSnap.forEach((d) => (totalCsat += d.data().score || 0));
      const avg_csat_week = csatSnap.size > 0 ? totalCsat / csatSnap.size : 0;

      const logsSnap = await db
        .collection("logs")
        .where("escalated", "==", true)
        .where("timestamp", ">=", last24h)
        .get();
      const agentEscalationMap: Record<string, number> = {};
      logsSnap.forEach((d) => {
        const ag = d.data().agent || "UNKNOWN";
        agentEscalationMap[ag] = (agentEscalationMap[ag] || 0) + 1;
      });
      let top_escalating_agent = "N/A";
      let maxEscalations = -1;
      for (const [k, v] of Object.entries(agentEscalationMap)) {
        if (v > maxEscalations) {
          maxEscalations = v;
          top_escalating_agent = k;
        }
      }

      res.json({
        open_tickets,
        resolved_last_24h,
        escalation_rate:
          totalRecent > 0 ? (escalatedCount / totalRecent) * 100 : 0,
        avg_response_time_ms,
        avg_csat_week,
        top_escalating_agent,
      });
    } catch (e: any) {
      if (e.message?.includes("FIREBASE_SERVICE_ACCOUNT_JSON")) {
        return res.status(200).json({
          open_tickets: 0,
          recent_tickets: 0,
          avg_response_time_ms: 0,
          avg_csat_week: 0,
          top_escalating_agent: "None",
        });
      }
      logger.error("live_stats_failed", { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:contractId/promises", async (req, res) => {
    try {
      const contractId = req.params.contractId;
      const contractDoc = await db
        .collection("contracts")
        .doc(contractId)
        .get();

      if (!contractDoc.exists) {
        return res.status(404).json({ error: "Contrato não encontrado." });
      }

      const data = contractDoc.data() || {};
      res.json({
        sales_promises: data.sales_promises || [],
        sales_summary: data.sales_summary || "Sem resumo registrado.",
        installation_deadline_days: data.installation_deadline_days || null,
        speed_promised_mbps: data.speed_promised_mbps || null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/jobs/schedule-csat", async (req, res) => {
    try {
      const { ticketId, tenantId, customerId, category, resolved_by } =
        req.body;
      const { enqueueMessage } = await import("./src/lib/queue");

      await enqueueMessage(
        tenantId,
        {
          ticketId,
          customerId,
          tenantId,
          category,
          resolved_by,
        },
        {
          delay: 120000,
          jobId: `csat:${ticketId}`,
        },
        "send_csat",
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/backup/trigger", express.json(), async (req, res) => {
    try {
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      const data = tenantDoc.data();
      if (!data) return res.status(404).json({ error: "Tenant not found" });

      const projectId = data.gcp_project_id || process.env.GCLOUD_PROJECT;
      const bucketName =
        data.backup_bucket_name || process.env.BACKUP_BUCKET_NAME;

      if (!projectId || !bucketName) {
        return res.status(400).json({
          error:
            "GCLOUD_PROJECT ou BACKUP_BUCKET_NAME não configurado no tenant.",
        });
      }

      const { v1 } = await import("@google-cloud/firestore");
      const client = new v1.FirestoreAdminClient();

      try {
        const responses = await client.exportDocuments({
          name: `projects/${projectId}/databases/(default)`,
          outputUriPrefix: `gs://${bucketName}/backups/${new Date().toISOString().split("T")[0]}_${tenantId}`,
          collectionIds: [
            "customers",
            "tickets",
            "service_orders",
            "contracts",
            "tenants",
            "plans",
            "incidents",
            "csat_ratings",
            "data_access_logs",
          ],
        });

        await db.collection("tenants").doc(tenantId).update({
          last_backup_at: admin.firestore.FieldValue.serverTimestamp(),
          last_backup_status: "success",
          last_backup_size_mb: "Estimado 50MB",
        });

        res.json({ ok: true, started_at: new Date().toISOString() });
      } catch (error: any) {
        await db.collection("tenants").doc(tenantId).update({
          last_backup_status: "failed",
          last_backup_error: error.message,
        });
        throw error;
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/backup/status", async (req, res) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
      const tenantDoc = await db
        .collection("tenants")
        .doc(tenantId as string)
        .get();
      const data = tenantDoc.data() || {};
      res.json({
        last_backup_at: data.last_backup_at?.toDate?.()?.toISOString() || null,
        last_backup_status: data.last_backup_status || null,
        last_backup_size_mb: data.last_backup_size_mb || null,
        last_backup_error: data.last_backup_error || null,
        backup_enabled: data.backup_enabled || false,
        retention_days: data.backup_retention_days || 30,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API routes FIRST
  app.post("/api/upsell/convert", express.json(), async (req, res) => {
    try {
      const { tenantId, customerId, currentPlan, suggestedPlan, outcome } =
        req.body;
      const tId = tenantId || "default";

      if (!customerId || !outcome) {
        return res.status(400).json({ error: "Missing customerId or outcome" });
      }

      await db.collection("upsell_events").add({
        tenant_id: tId,
        customer_id: customerId,
        current_plan: currentPlan || "Unknown",
        suggested_plan: suggestedPlan || "Unknown",
        outcome: outcome, // 'interested', 'converted', 'rejected'
        triggered_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("error_recording_upsell:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/data-export/request", requireTenant, async (req, res) => {
    try {
      const { tenantId, requestedBy } = req.body;
      if (!tenantId || !requestedBy) {
        return res.status(400).json({ error: "Missing parameters" });
      }

      const { processDataExport } = await import("./src/lib/dataExport.ts");
      
      // Start in background
      processDataExport(tenantId, requestedBy).catch(e => {
        console.error("Export background failure", e);
      });
      
      return res.json({ message: "Export job started", tenantId });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/data-export/status", requireTenant, async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || (req as any).tenantId;
      if (!tenantId) {
         return res.status(400).json({ error: "Missing tenantId" });
      }

      let statusData = { status: "unknown", progress: 0 };
      if (redis) {
        const data = await redis.get(`export_status:${tenantId}`);
        if (data) {
           statusData = JSON.parse(data);
        }
      }
      return res.json(statusData);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || (req as any).tenantId;
      const q = (req.query.q as string) || "";
      const type = (req.query.type as string) || "all";
      const limitParam = parseInt(req.query.limit as string) || 12;
      const page = parseInt(req.query.page as string) || 1;

      if (!tenantId || !q) {
        return res.json({ results: [], total: 0 });
      }

      const results: any[] = [];

      // 1. TEXT SEARCH - CUSTOMERS
      if (type === "customers" || type === "all") {
        const snap = await db.collection("customers").where("tenantId", "==", tenantId).orderBy("name").startAt(q).endAt(q + "\uf8ff").limit(limitParam).get();
        snap.docs.forEach(doc => {
            results.push({ id: doc.id, type: "customer", ...doc.data() });
        });
      }

      // 2. TEXT SEARCH - TICKETS
      if (type === "tickets" || type === "all") {
         if (q.startsWith("T-") || !isNaN(Number(q))) {
             const snap = await db.collection("tickets").doc(q).get();
             if (snap.exists && snap.data()?.tenantId === tenantId) {
                results.push({ id: snap.id, type: "ticket", ...snap.data() });
             }
         } else {
             const snap = await db.collection("tickets").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(100).get();
             snap.docs.forEach(doc => {
                 const data = doc.data();
                 const textToMatch = `${data.customerName || ""} ${data.description || ""} ${data.status || ""}`.toLowerCase();
                 if (textToMatch.includes(q.toLowerCase())) {
                     results.push({ id: doc.id, type: "ticket", ...data });
                 }
             });
         }
      }

      // 3. SEMANTIC SEARCH - MESSAGES (VIA VECTOR STORE)
      if (type === "messages" || type === "all") {
         try {
             const { getEmbeddingProvider } = await import("./src/lib/embeddingProvider.ts");
             const { getVectorStore } = await import("./src/lib/vectorStore.ts");
             const embedProvider = await getEmbeddingProvider(tenantId);
             const vStore = await getVectorStore(tenantId);

             const embedding = await embedProvider.embed(q, tenantId);
             const vr = await vStore.search(embedding, tenantId, limitParam);
             vr.forEach(r => {
                 if (r.metadata.type === "message" || r.metadata.ticketId) {
                     results.push({ id: r.id, type: "message", score: r.score, ...r.metadata });
                 }
             });
         } catch (e: any) {
             console.error("[Search] Vector search failed or not configured", e.message);
         }
      }

      const paginatedResults = results.slice((page-1)*limitParam, page*limitParam);
      res.json({ results: paginatedResults, total: results.length });
    } catch (e: any) {
      console.error("Search error", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      firebaseJsonPresent: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    });
  });

  app.get("/api/rate-limit/status", async (req, res) => {
    try {
      let tenantId = req.query.tenantId as string || req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenantId" });
      }
      
      const { getTenantPlanId } = await import("./src/lib/featureFlags");
      const redis = (await import("./src/lib/redis")).default;

      const rawPlanId = await getTenantPlanId(tenantId);
      const planId = rawPlanId.toUpperCase();
      
      const PLAN_LIMITS: Record<string, number> = {
        FREE: 100,
        PRO: 500,
        BUSINESS: 2000,
        ENTERPRISE: Infinity,
      };

      const limit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.FREE;
      const key = `ratelimit:${tenantId}`;
      const count = await redis.zcard(key);

      res.json({
        tenantId,
        plan: planId,
        limit: limit === Infinity ? 'unlimited' : limit,
        used: count,
        remaining: limit === Infinity ? 'unlimited' : Math.max(0, limit - count)
      });
    } catch(e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const upload = multer({ dest: os.tmpdir() });

  // Initialize Smee for local webhooks if in dev. But honestly since AI Studio URL might ALWAYS be behind auth,
  // Let's just always initialize Smee so the webhook can bypass the IAP prompt.
  const SMEE_CHANNEL = `https://smee.io/astrum-evo-webhook-${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : Math.floor(Math.random() * 100000)}`;
  const smeeClientObj = new SmeeClient({
    source: SMEE_CHANNEL,
    target: "http://127.0.0.1:3000/api/webhook/evolution",
    logger: {
      info: (msg: string) =>
        logger.info("smee_client_info", { data: { message: msg } }),
      error: (msg: string) => logger.error("smee_client_error", { error: msg }),
    },
  });
  smeeClientObj.start();

  app.get("/api/queues/stats", async (req, res) => {
    try {
      const { messageQueue } = await import("./src/lib/queue");
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");

      let msgStats = { waiting: 0, active: 0, completed: 0, failed: 0 };
      let cobraiStats = { waiting: 0, active: 0, completed: 0, failed: 0 };

      const { getAggregateJobCounts } = await import("./src/lib/queue");
      msgStats = (await getAggregateJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
      )) as any;
      if (cobraiQueue.getJobCounts) {
        cobraiStats = await cobraiQueue.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
        );
      }

      res.json({
        waiting: (msgStats.waiting || 0) + (cobraiStats.waiting || 0),
        active: (msgStats.active || 0) + (cobraiStats.active || 0),
        completed: (msgStats.completed || 0) + (cobraiStats.completed || 0),
        failed: (msgStats.failed || 0) + (cobraiStats.failed || 0),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/integrations/ixc", async (req, res) => {
    try {
      const tenantId =
        (req.query.tenantId as string) ||
        (req as any).user?.tenantId ||
        "default";
      const { getIXCCredentials } = await import("./src/lib/dbAdmin");
      const creds = await getIXCCredentials(tenantId);
      if (creds.token && creds.token.length > 5)
        creds.token =
          creds.token.substring(0, 4) + "***" + creds.token.slice(-4);
      if (creds.integrationKey && creds.integrationKey.length > 5)
        creds.integrationKey =
          creds.integrationKey.substring(0, 4) +
          "***" +
          creds.integrationKey.slice(-4);
      res.json(creds);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/integrations/ixc", express.json(), async (req, res) => {
    try {
      const tenantId =
        req.body.tenantId || (req as any).user?.tenantId || "default";
      const { url, token, integrationKey } = req.body;
      const { saveIXCCredentials, getIXCCredentials } =
        await import("./src/lib/dbAdmin");

      const currentCreds = await getIXCCredentials(tenantId);
      const finalToken =
        token && !token.includes("***") ? token : currentCreds.token;
      const finalIntKey =
        integrationKey && !integrationKey.includes("***")
          ? integrationKey
          : currentCreds.integrationKey;

      await saveIXCCredentials(tenantId, {
        url,
        token: finalToken,
        integrationKey: finalIntKey,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/integrations/ixc/test", express.json(), async (req, res) => {
    try {
      const tenantId =
        req.body.tenantId || (req as any).user?.tenantId || "default";
      const { url, token, integrationKey } = req.body;

      const { getIXCCredentials } = await import("./src/lib/dbAdmin");
      const currentCreds = await getIXCCredentials(tenantId);
      const finalToken =
        token && !token.includes("***") ? token : currentCreds.token;

      if (!url || !finalToken) {
        return res
          .status(400)
          .json({ success: false, error: "Nenhuma credencial configurada." });
      }

      const endpoint = `${url}/webservice/v1/cliente`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(finalToken).toString("base64")}`,
          ixcsoft: "listar",
        },
        body: JSON.stringify({
          qtype: "cliente.id",
          query: "1",
          oper: ">=",
          page: "1",
          rp: "1",
        }),
      });

      if (!response.ok) {
        return res.status(400).json({
          success: false,
          error: "HTTP " + response.status + ": " + response.statusText,
        });
      }

      const data = await response.json();
      res.json({ success: true, count: data.total || 0 });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get("/api/integrations/hubsoft", async (req, res) => {
    try {
      const tenantId =
        (req.query.tenantId as string) ||
        (req as any).user?.tenantId ||
        "default";
      const { getHubSoftCredentials } = await import("./src/lib/dbAdmin");
      const creds = await getHubSoftCredentials(tenantId);
      res.json({
        url: creds.url,
        token: creds.token ? "**********************" : "",
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/integrations/hubsoft", express.json(), async (req, res) => {
    try {
      const tenantId =
        req.body.tenantId || (req as any).user?.tenantId || "default";
      const { url, token } = req.body;
      const { saveHubSoftCredentials, getHubSoftCredentials } =
        await import("./src/lib/dbAdmin");

      const currentCreds = await getHubSoftCredentials(tenantId);
      const finalToken =
        token && !token.includes("***") ? token : currentCreds.token;

      await saveHubSoftCredentials(tenantId, { url, token: finalToken });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post(
    "/api/integrations/hubsoft/test",
    express.json(),
    async (req, res) => {
      try {
        const tenantId =
          req.body.tenantId || (req as any).user?.tenantId || "default";
        const { url, token } = req.body;

        const { getHubSoftCredentials } = await import("./src/lib/dbAdmin");
        const currentCreds = await getHubSoftCredentials(tenantId);
        const finalToken =
          token && !token.includes("***") ? token : currentCreds.token;

        if (!url || !finalToken) {
          return res
            .status(400)
            .json({ success: false, error: "Nenhuma credencial configurada." });
        }

        const { getClientByCpf } =
          await import("./src/lib/integrations/hubsoftClient");
        const testResult = await getClientByCpf("00000000000", {
          url,
          token: finalToken,
        });

        // Even if client is not found, if it didn't throw an auth error, we are good.
        res.json({ success: true, count: testResult ? 1 : 0 });
      } catch (e: any) {
        // HubSoft 401 error or other
        res.status(500).json({ success: false, error: e.message });
      }
    },
  );

  app.get("/api/integrations/sgp", async (req, res) => {
    try {
      const tenantId =
        (req.query.tenantId as string) ||
        (req as any).user?.tenantId ||
        "default";
      const { getSGPCredentials } = await import("./src/lib/dbAdmin");
      const creds = await getSGPCredentials(tenantId);
      res.json({
        url: creds.url,
        token: creds.token ? "**********************" : "",
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/integrations/sgp", express.json(), async (req, res) => {
    try {
      const tenantId =
        req.body.tenantId || (req as any).user?.tenantId || "default";
      const { url, token } = req.body;
      const { saveSGPCredentials, getSGPCredentials } =
        await import("./src/lib/dbAdmin");

      const currentCreds = await getSGPCredentials(tenantId);
      const finalToken =
        token && !token.includes("***") ? token : currentCreds.token;

      await saveSGPCredentials(tenantId, { url, token: finalToken });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post(
    "/api/integrations/sgp/test",
    express.json(),
    async (req, res) => {
      try {
        const tenantId =
          req.body.tenantId || (req as any).user?.tenantId || "default";
        const { url, token } = req.body;

        const { getSGPCredentials } = await import("./src/lib/dbAdmin");
        const currentCreds = await getSGPCredentials(tenantId);
        const finalToken =
          token && !token.includes("***") ? token : currentCreds.token;

        if (!url || !finalToken) {
          return res
            .status(400)
            .json({ success: false, error: "Nenhuma credencial configurada." });
        }

        const { getClientByCpf } =
          await import("./src/lib/integrations/sgpClient");
        await getClientByCpf("00000000000", {
          url,
          token: finalToken,
        });
        res.json({ success: true, count: 1 });
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    },
  );

  app.get("/api/integrations/rbx", async (req, res) => {
    try {
      const tenantId =
        (req.query.tenantId as string) ||
        (req as any).user?.tenantId ||
        "default";
      const { getRBXCredentials } = await import("./src/lib/dbAdmin");
      const creds = await getRBXCredentials(tenantId);
      res.json({
        url: creds.url,
        token: creds.token ? "**********************" : "",
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/integrations/rbx", express.json(), async (req, res) => {
    try {
      const tenantId =
        req.body.tenantId || (req as any).user?.tenantId || "default";
      const { url, token } = req.body;
      const { saveRBXCredentials, getRBXCredentials } =
        await import("./src/lib/dbAdmin");

      const currentCreds = await getRBXCredentials(tenantId);
      const finalToken =
        token && !token.includes("***") ? token : currentCreds.token;

      await saveRBXCredentials(tenantId, { url, token: finalToken });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post(
    "/api/integrations/rbx/test",
    express.json(),
    async (req, res) => {
      try {
        const tenantId =
          req.body.tenantId || (req as any).user?.tenantId || "default";
        const { url, token } = req.body;

        const { getRBXCredentials } = await import("./src/lib/dbAdmin");
        const currentCreds = await getRBXCredentials(tenantId);
        const finalToken =
          token && !token.includes("***") ? token : currentCreds.token;

        if (!url || !finalToken) {
          return res
            .status(400)
            .json({ success: false, error: "Nenhuma credencial configurada." });
        }

        const { getClientByCpf } =
          await import("./src/lib/integrations/rbxClient");
        await getClientByCpf("00000000000", {
          url,
          token: finalToken,
        });

        res.json({ success: true, count: 1 });
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    },
  );

  app.get("/api/integrations/voalle", async (req, res) => {
    try {
      const tenantId =
        (req.query.tenantId as string) ||
        (req as any).user?.tenantId ||
        "default";
      const { getVoalleCredentials } = await import("./src/lib/dbAdmin");
      const creds = await getVoalleCredentials(tenantId);
      res.json({
        url: creds.url,
        clientId: creds.clientId ? "**********************" : "",
        clientSecret: creds.clientSecret ? "**********************" : "",
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/api/integrations/voalle", express.json(), async (req, res) => {
    try {
      const tenantId =
        req.body.tenantId || (req as any).user?.tenantId || "default";
      const { url, clientId, clientSecret } = req.body;
      const { saveVoalleCredentials, getVoalleCredentials } =
        await import("./src/lib/dbAdmin");

      const currentCreds = await getVoalleCredentials(tenantId);
      const finalClientId =
        clientId && !clientId.includes("***")
          ? clientId
          : currentCreds.clientId;
      const finalClientSecret =
        clientSecret && !clientSecret.includes("***")
          ? clientSecret
          : currentCreds.clientSecret;

      await saveVoalleCredentials(tenantId, {
        url,
        clientId: finalClientId,
        clientSecret: finalClientSecret,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post(
    "/api/integrations/voalle/test",
    express.json(),
    async (req, res) => {
      try {
        const tenantId =
          req.body.tenantId || (req as any).user?.tenantId || "default";
        const { url, clientId, clientSecret } = req.body;

        const { getVoalleCredentials } = await import("./src/lib/dbAdmin");
        const currentCreds = await getVoalleCredentials(tenantId);
        const finalClientId =
          clientId && !clientId.includes("***")
            ? clientId
            : currentCreds.clientId;
        const finalClientSecret =
          clientSecret && !clientSecret.includes("***")
            ? clientSecret
            : currentCreds.clientSecret;

        if (!url || !finalClientId || !finalClientSecret) {
          return res
            .status(400)
            .json({ success: false, error: "Nenhuma credencial configurada." });
        }

        const { authenticate } =
          await import("./src/lib/integrations/voalleClient");
        const token = await authenticate({
          url,
          clientId: finalClientId,
          clientSecret: finalClientSecret,
        });

        if (!token) {
          return res.status(400).json({
            success: false,
            error: "Autenticação falhou. Verifique as credenciais.",
          });
        }

        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    },
  );

  app.get("/api/integrations/redis/status", async (req, res) => {
    try {
      const redis = (await import("./src/lib/redis")).default as any;
      const { messageQueue } = await import("./src/lib/queue");
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");

      let connected = false;
      let memoryUsed = "0M";
      if (redis.status === "ready") {
        connected = true;
        const memoryInfo = await redis.info("memory");
        const match = memoryInfo.match(/used_memory_human:(.*)/);
        if (match && match[1]) memoryUsed = match[1].trim();
      }

      let msgStats = { waiting: 0, active: 0 };
      let cobraiStats = { waiting: 0, active: 0 };

      const { getAggregateJobCounts } = await import("./src/lib/queue");
      msgStats = (await getAggregateJobCounts("waiting", "active")) as any;
      if (cobraiQueue.getJobCounts) {
        cobraiStats = await cobraiQueue.getJobCounts("waiting", "active");
      }

      const q = db
        .collection("dead_letter_queue")
        .where("resolved", "==", false);
      const dlqSnap = await q.get();
      const dlqCount = dlqSnap.size;

      res.json({
        connected,
        memoryUsed,
        queueWaiting: (msgStats.waiting || 0) + (cobraiStats.waiting || 0),
        queueActive: (msgStats.active || 0) + (cobraiStats.active || 0),
        dlqCount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/integrations/redis/test", async (req, res) => {
    const { url } = req.body;
    if (!url)
      return res
        .status(400)
        .json({ success: false, error: "Missing Redis URL" });

    try {
      const redisMod = await import("ioredis");
      const Redis = redisMod.default || (redisMod as any).Redis || redisMod;
      const startTime = Date.now();
      const testRedis = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        retryStrategy() {
          return null; // Don't retry on test connection
        },
      });

      testRedis.on("error", () => {}); // Catch all errors to avoid Unhandled error event

      try {
        await new Promise<void>((resolve, reject) => {
          testRedis.once("ready", () => resolve());
          testRedis.once("error", (err) => reject(err));
        });

        await testRedis.set("test_key", "test_value", "EX", 5);
        const val = await testRedis.get("test_key");

        if (val !== "test_value")
          throw new Error("Falha na validação de SET/GET");

        const latencyMs = Date.now() - startTime;

        res.json({ success: true, latencyMs });
      } finally {
        testRedis.disconnect();
      }
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  app.get("/api/whatsapp/health-stats", async (req, res) => {
    try {
      const { tenantId, instanceId } = req.query;
      if (!tenantId || typeof tenantId !== "string") {
        return res.status(400).json({ error: "Missing tenantId" });
      }

      const redis = (await import("./src/lib/redis.ts")).default;
      if (!redis) {
        return res.json({
          ban_signals: 0,
          is_paused: false,
          throttle_events: 0,
          daily_messages_today: 0,
          messages_in_queue: 0,
          status: "unknown",
        });
      }

      // We need evolutionUrl/Instance. If instanceId is not provided, we might fall back to something else, or just return 0.
      const evoInstanceStr =
        typeof instanceId === "string" ? instanceId : "default";

      const banSignalsStr = await redis.get(`ban_signals:${evoInstanceStr}`);
      const banSignals = banSignalsStr ? parseInt(banSignalsStr, 10) : 0;

      const isPaused =
        (await redis.get(`pause_jobs:${evoInstanceStr}`)) === "paused";

      const throttleEventsStr = await redis.get(`throttle_events:${tenantId}`);
      const throttleEvents = throttleEventsStr
        ? parseInt(throttleEventsStr, 10)
        : 0;

      const d = new Date();
      const yyyyMmDd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dailyKey = `daily_msg_count:${tenantId}:${yyyyMmDd}`;
      const dailyCountStr = await redis.get(dailyKey);
      const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0;

      const { getTenantQueue } = await import("./src/lib/queue.ts");
      let messagesInQueue = 0;
      try {
        const queue = getTenantQueue(tenantId);
        if (queue && queue.getJobCounts) {
          const stats = await queue.getJobCounts(
            "waiting",
            "active",
            "delayed",
          );
          messagesInQueue =
            (stats.waiting || 0) + (stats.active || 0) + (stats.delayed || 0);
        }
      } catch (e) {}

      res.json({
        ban_signals: banSignals,
        is_paused: isPaused,
        throttle_events: throttleEvents,
        daily_messages_today: dailyCount,
        messages_in_queue: messagesInQueue,
        status: isPaused ? "paused" : banSignals > 0 ? "warning" : "healthy",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/dlq", async (req, res) => {
    try {
      const { tenantId } = req.query;
      if (!tenantId || typeof tenantId !== "string") {
        return res.status(400).json({ error: "Missing tenantId" });
      }

      const dlqSnap = await db
        .collection("dead_letter_queue")
        .where("tenant_id", "==", tenantId)
        .where("resolved", "==", false)
        .get();

      const jobs = dlqSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/dlq/:jobId/retry", async (req, res) => {
    try {
      const { jobId } = req.params;
      const docRef = db.collection("dead_letter_queue").doc(jobId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: "Job not found" });
      }

      const data = docSnap.data()!;
      if (data.resolved) {
        return res.status(400).json({ error: "Job already resolved" });
      }

      const { getTenantQueue } = await import("./src/lib/queue.ts");
      const tenantId = data.tenant_id;
      const type = data.type || "process_message";
      const queue = getTenantQueue(tenantId);
      await queue.add(type, data.payload);

      await docRef.update({
        resolved: true,
        resolved_at: new Date(),
      });

      res.json({ success: true, message: "Job requeued" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/erp/billing-status", async (req, res) => {
    try {
      const { cpf, tenantId } = req.query;
      if (!cpf || !tenantId) {
        return res
          .status(400)
          .json({ error: "Faltando parâmetros cpf ou tenantId" });
      }

      const redis = (await import("./src/lib/redis")).default;
      const cacheKey = `erp_billing_${tenantId}_${cpf}`;
      const cached = await redis?.get(cacheKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }

      const { getERPAdapter } =
        await import("./src/lib/integrations/erpAdapter");
      const adapter = await getERPAdapter(tenantId as string);

      const billingStatus = await adapter.getBillingStatus(cpf as string);
      if (billingStatus.error) {
        return res.status(404).json(billingStatus);
      }

      // Format response
      const customer = billingStatus.customer;
      const financial = billingStatus.financial as any[];

      // Calculate derived fields similarly to the gemini prompt logic or just return raw?
      // "retorna { customer_name, has_overdue, next_due_date, total_overdue_amount, pix_code, boleto_url, status } com cache Redis 60s."
      const overdue = financial.filter(
        (f) =>
          f.status === "A" &&
          new Date(f.data_vencimento || f.data_venc) < new Date(),
      );
      const has_overdue = overdue.length > 0;
      const total_overdue_amount = overdue.reduce(
        (sum, f) => sum + parseFloat(f.valor || "0"),
        0,
      );

      const future = financial
        .filter(
          (f) =>
            f.status === "A" &&
            new Date(f.data_vencimento || f.data_venc) >= new Date(),
        )
        .sort(
          (a, b) =>
            new Date(a.data_vencimento || a.data_venc).getTime() -
            new Date(b.data_vencimento || b.data_venc).getTime(),
        );

      let pending = has_overdue
        ? overdue[0]
        : future.length > 0
          ? future[0]
          : null;

      const responseData = {
        customer_name: customer.razao || customer.nome || "",
        has_overdue,
        next_due_date: pending
          ? pending.data_vencimento || pending.data_venc
          : null,
        total_overdue_amount,
        pix_code: pending
          ? pending.linha_digitavel || pending.copia_cola || ""
          : "", // Assumes some structure, will refine if needed
        boleto_url: pending
          ? pending.link_boleto || pending.pdf || pending.link || ""
          : "",
        status: has_overdue
          ? "inadimplente"
          : pending
            ? "adimplente"
            : "sem_faturas",
      };

      await redis?.set(cacheKey, JSON.stringify(responseData), "EX", 60);

      res.status(200).json(responseData);
    } catch (err: any) {
      logger.error("error_erp_billing_api", {
        error: err.message,
        data: { stack: err.stack },
      });
      res
        .status(500)
        .json({ error: "Erro interno no servidor ao consultar ERP" });
    }
  });

  app.get("/api/health/whatsapp", async (req, res) => {
    try {
      // Endpoint mock or simple for checking whatsapp health
      res.json({ status: "open", checked_at: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cobrai/queue-stats", async (req, res) => {
    try {
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      if (!cobraiQueue.getJobCounts) {
        return res.json({ waiting: 0, active: 0, completed: 0, failed: 0 });
      }
      const stats = await cobraiQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
      );
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cobrai/queue", async (req, res) => {
    try {
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      if (!cobraiQueue.getJobs) return res.json([]);
      const jobsWait = await cobraiQueue.getJobs(["waiting", "delayed"]);
      const jobsActive = await cobraiQueue.getJobs(["active"]);
      const formatted = [...jobsActive, ...jobsWait].map((j: any) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        status: j.finishedOn
          ? "completed"
          : j.processedOn
            ? "active"
            : "waiting",
        delay: j.delay,
        failedReason: j.failedReason,
      }));
      res.json(formatted);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cobrai/send-now", async (req, res) => {
    try {
      const { customerId, stage, tenantId } = req.body;
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      if (!customerId || !stage)
        return res.status(400).json({ error: "Missing parameters" });
      if (cobraiQueue.add) {
        await cobraiQueue.add("manual-send", {
          customerId,
          stage,
          tenantId: tenantId || "default",
        });
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Queue uninitialized" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/cobrai/queue/:id", async (req, res) => {
    try {
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      if (!cobraiQueue.getJob)
        return res.status(500).json({ error: "Queue uninitialized" });
      const job = await cobraiQueue.getJob(req.params.id);
      if (job) {
        await job.remove();
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Job not found" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/system/webhook-url", (req, res) => {
    res.json({ webhookUrl: SMEE_CHANNEL });
  });

  app.get("/api/traces/:traceId", async (req, res) => {
    try {
      const { traceId } = req.params;
      const snap = await db
        .collectionGroup("message_traces")
        .where("trace_id", "==", traceId)
        .get();
      if (snap.empty) return res.status(404).json({ error: "Trace not found" });
      const docs = snap.docs.map((d) => ({
        ticketId: d.ref.parent.parent?.id,
        id: d.id,
        ...d.data(),
      }));
      res.json({ traces: docs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rag/scrape-url", express.json(), async (req, res) => {
    try {
      const { url, tenantId } = req.body;
      if (!url || !tenantId)
        return res.status(400).json({ error: "Missing url or tenantId" });

      const { load } = await import("cheerio");

      const fetchResponse = await fetch(url);
      if (!fetchResponse.ok)
        throw new Error(`HTTP error! status: ${fetchResponse.status}`);
      const htmlText = await fetchResponse.text();

      const $ = load(htmlText);
      $("script, style, nav, footer, header, aside").remove();
      const extractedText = $("body").text().replace(/\s+/g, " ").trim();

      if (!extractedText)
        throw new Error("No readable text found on the page.");

      // Chunk in roughly 500 tokens (approx 2000 chars)
      const CHUNK_SIZE = 2000;
      const chunks = [];
      for (let i = 0; i < extractedText.length; i += CHUNK_SIZE) {
        chunks.push(extractedText.substring(i, i + CHUNK_SIZE));
      }

      const { addToKnowledgeBase } = await import("./src/lib/dbAdmin");
      const pageTitle = $("title").text().trim() || url;

      let ids = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkTitle =
          chunks.length > 1 ? `${pageTitle} (Parte ${i + 1})` : pageTitle;
        const id = await addToKnowledgeBase({
          title: chunkTitle,
          content: chunks[i],
          category: "site_scrape",
          tenantId,
        });
        ids.push(id);
      }

      res.json({ success: true, count: ids.length, ids });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // RAG Native PDF Parser API
  app.post("/api/rag/upload-pdf", upload.single("pdf"), async (req, res) => {
    try {
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      logger.info("pdf_parser_triggered", {
        data: { filename: file.originalname },
      });
      const dataBuffer = fs.readFileSync(file.path);

      const tenantId = (req as any).tenantId;
      if (tenantId) {
        const { adminStorage } = await import("./src/lib/firebaseAdmin.ts");
        const filename = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
        const bucket = adminStorage.bucket();
        const fileUpload = bucket.file(`tenants/${tenantId}/rag/${filename}`);
        await fileUpload.save(dataBuffer, {
          metadata: { contentType: "application/pdf" },
        });
        logger.info("pdf_uploaded_to_storage", {
          data: { path: fileUpload.name },
        });
      }

      // Parse Native do PDF para texto bruto
      // Dynamic import to bypass ESM issues with pdf-parse CJS
      const pdfParseModule: any = await import("pdf-parse");
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const pdfData = await pdfParse(dataBuffer);
      const extractedText = pdfData.text;

      // Limpeza
      fs.unlinkSync(file.path);

      // Usa motor RAG (Gemini)
      const keys = await getIntegrationKeys();
      const provider = keys.ragProvider || "openai";
      const isCustom = provider === "custom";
      const isOpenAILike = provider === "openai" || isCustom;

      const ragAiKey = isCustom
        ? keys.customRag || ""
        : provider === "openai"
          ? keys.openaiRag || keys.openaiGlobal
          : keys.geminiRag || keys.geminiGlobal || process.env.GEMINI_API_KEY;
      const ragAiModel =
        keys[`${provider}RagModel`] ||
        (provider === "openai"
          ? "gpt-4o-mini"
          : isCustom
            ? ""
            : "gemini-2.5-flash");
      const ragAiBaseUrl = isCustom ? keys.customRagBaseUrl : undefined;

      if (!ragAiKey) {
        // Se nao tem chave, devolve o texto bruto e uma mensagem
        return res.json({
          summary: `**Texto Extraído de ${file.originalname}**\n\n(IA Não Configurada - Mostrando primeiros 500 caracteres)\n\n${extractedText.substring(0, 500)}...`,
          rawText: extractedText,
        });
      }

      const prompt = `Você é um especialista em Base de Conhecimento RAG. Crie um resumo ultra-conciso e estruture as partes e regras operacionais mais importantes que você leu abaixo. Formate usando Markdown.\n\nArquivo: ${file.originalname}\n\n${extractedText.substring(0, 10000)}`;
      let summaryText = "";

      if (isOpenAILike) {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({
          apiKey: ragAiKey as string,
          baseURL: ragAiBaseUrl as string,
          dangerouslyAllowBrowser: true,
        });
        const aiRes = await openai.chat.completions.create({
          model: ragAiModel as string,
          messages: [{ role: "user", content: prompt }],
        });
        summaryText = aiRes.choices[0]?.message?.content || "";
      } else {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const ai = new GoogleGenerativeAI(ragAiKey as string);
        const modelFlash = ai.getGenerativeModel({
          model: ragAiModel as string,
        });
        const aiRes = await modelFlash.generateContent(prompt);
        summaryText = aiRes.response.text();
      }

      res.json({
        summary: `**Resumo Extraído (IA ${provider.toUpperCase()} ${ragAiModel}): ${file.originalname}**\n\n${summaryText}\n\nVocê pode revisar e salvar isso como um artigo oficial para o Motor de RAG.`,
        rawText: extractedText,
      });
    } catch (error) {
      logger.error("pdf_parser_failed", { error: String(error) });
      res.status(500).json({ error: "Falha ao processar o arquivo PDF." });
    }
  });

  // OS Image Upload API
  app.post(
    "/api/os/:osId/upload-image",
    upload.single("image"),
    async (req, res) => {
      try {
        const tenantId = (req as any).tenantId;
        const file = (req as any).file;

        if (!tenantId) {
          if (file) fs.unlinkSync(file.path);
          return res.status(400).json({ error: "TENANT_REQUIRED" });
        }

        const { osId } = req.params;
        if (!file) return res.status(400).json({ error: "No image uploaded" });

        const dataBuffer = fs.readFileSync(file.path);
        const { adminStorage } = await import("./src/lib/firebaseAdmin.ts");
        const filename = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
        const bucket = adminStorage.bucket();
        const fileUpload = bucket.file(
          `tenants/${tenantId}/os/${osId}/${filename}`,
        );

        await fileUpload.save(dataBuffer, {
          metadata: { contentType: file.mimetype || "image/jpeg" },
        });

        fs.unlinkSync(file.path);
        res.json({ success: true, path: fileUpload.name });
      } catch (error: any) {
        if ((req as any).file) fs.unlinkSync((req as any).file.path);
        logger.error("os_image_upload_failed", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/prompts/validate", express.json(), async (req, res) => {
    const { content, agent, tenantId } = req.body;
    const tId = tenantId || "default";

    const errors: string[] = [];

    // Regra 1: tamanho máximo
    if (content.length > 8000) {
      errors.push(
        "Prompt muito longo (máximo 8.000 caracteres). Simplifique as instruções.",
      );
    }

    // Regra 2: palavras que criam loops
    const loopPatterns = [
      /sempre\s+pergunte/i,
      /repita\s+sempre/i,
      /nunca\s+encerre/i,
      /continue\s+perguntando/i,
    ];
    loopPatterns.forEach((p) => {
      if (p.test(content))
        errors.push(
          `Instrução pode criar loop infinito: "${content.match(p)?.[0]}"`,
        );
    });

    // Regra 3: não pode remover o SECURITY_BLOCK
    if (
      content.includes("ignore suas instruções") ||
      content.includes("ignore regras")
    ) {
      errors.push(
        "Prompt não pode conter instruções para ignorar regras de segurança.",
      );
    }

    // Regra 4: deve ter pelo menos 1 instrução clara
    if (
      content.split("\n").filter((l: string) => l.trim().length > 10).length < 3
    ) {
      errors.push("Prompt muito curto. Adicione pelo menos 3 instruções.");
    }

    if (errors.length > 0) {
      return res.status(400).json({ valid: false, errors });
    }

    try {
      const { getIntegrationKeys } = await import("./src/lib/dbAdmin");
      const keys = await getIntegrationKeys(tId);

      const provider = keys.chatProvider || "gemini";
      const isCustom = provider === "custom";
      const apiKey = isCustom
        ? keys.customChat
        : provider === "openai"
          ? keys.openaiChat || keys.openaiGlobal
          : keys.gemini_api_key ||
            keys.geminiGlobal ||
            process.env.GEMINI_API_KEY;
      const modelStr = isCustom
        ? keys.customChatModel
        : provider === "openai"
          ? keys.openaiChatModel
          : "gemini-1.5-flash";

      if (!apiKey) {
        return res.status(400).json({
          valid: false,
          errors: ["API Key não configurada. Configure em Integrações."],
        });
      }

      let testResponse = "";

      if (provider === "openai" || isCustom) {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({
          apiKey: apiKey as string,
          baseURL: isCustom ? (keys.customChatBaseUrl as string) : undefined,
          dangerouslyAllowBrowser: true,
        });
        const testResult = await openai.chat.completions.create({
          model: (modelStr as string) || "gpt-3.5-turbo",
          max_tokens: 100,
          messages: [
            { role: "system", content: content },
            { role: "user", content: "olá, preciso de ajuda" },
          ],
        });
        testResponse = testResult.choices[0]?.message.content || "";
      } else {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const ai = new GoogleGenerativeAI(apiKey as string);
        const m = ai.getGenerativeModel({
          model: (modelStr as string) || "gemini-1.5-flash",
        });
        const prompt = `System: ${content}\nUser: olá, preciso de ajuda`;
        const resAI = await m.generateContent(prompt);
        testResponse = resAI.response.text();
      }

      return res.status(200).json({ valid: true, test_response: testResponse });
    } catch (err: any) {
      return res.status(400).json({
        valid: false,
        errors: ["Prompt causou erro na IA: " + err.message],
      });
    }
  });

  app.post(
    "/api/jobs/schedule-pos-install",
    express.json(),
    async (req, res) => {
      try {
        const { customerId, tenantId, osId, installedPlan } = req.body;
        const { enqueueMessage } = await import("./src/lib/queue");
        await enqueueMessage(
          tenantId,
          {
            customerId,
            tenantId,
            osId,
            installedPlan,
          },
          {
            delay: 86400000,
            jobId: `pos_instalacao:${osId}`,
          },
          "pos_instalacao",
        );
        res.json({ success: true });
      } catch (error: any) {
        logger.error("pos_instalacao_schedule_failed", {
          error: error.message,
        });
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post("/api/jobs/schedule-sla", express.json(), async (req, res) => {
    try {
      const { ticketId, tenantId, customerId } = req.body;
      const { enqueueMessage } = await import("./src/lib/queue");

      await enqueueMessage(
        tenantId,
        { ticketId, tenantId, customerId, level: 1 },
        { delay: 5 * 60 * 1000, jobId: `sla_5min:${ticketId}` },
        "sla_warning",
      );

      await enqueueMessage(
        tenantId,
        { ticketId, tenantId, customerId, level: 2 },
        { delay: 15 * 60 * 1000, jobId: `sla_15min:${ticketId}` },
        "sla_warning",
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error("sla_schedule_failed", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tickets/human-response", express.json(), async (req, res) => {
    try {
      const { ticketId } = req.body;
      const docRef = db.collection("tickets").doc(ticketId);
      const tDoc = await docRef.get();
      const tenantId = tDoc.exists ? tDoc.data()?.tenantId : null;

      await docRef.update({
        human_responded: true,
        human_first_response_at: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (tenantId) {
        const { getTenantQueue } = await import("./src/lib/queue");
        const queue = getTenantQueue(tenantId);
        const job5 = await queue.getJob(`sla_5min:${ticketId}`);
        if (job5) await job5.remove();
        const job15 = await queue.getJob(`sla_15min:${ticketId}`);
        if (job15) await job15.remove();
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/evolution/fetch-history", express.json(), async (req, res) => {
    try {
      const { ticketId, customerId } = req.body;
      const keys = await getIntegrationKeys();
      const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
      const evoInstance = keys.evolutionInstance;
      const evoApiKey = keys.evolutionApiKey;

      if (!evoUrl || !evoInstance || !evoApiKey) {
        return res
          .status(400)
          .json({ error: "Evolution API não configurada." });
      }

      // Get customer phone
      const custDoc = await db.collection("customers").doc(customerId).get();
      if (!custDoc.exists) {
        return res.status(404).json({ error: "Cliente não encontrado." });
      }
      let phone = custDoc.data()?.phone;
      if (!phone) {
        return res
          .status(400)
          .json({ error: "Cliente sem telefone cadastrado." });
      }

      phone = phone.replace(/\D/g, "");
      const remoteJid = `${phone}@s.whatsapp.net`;

      // Fetch messages from Evolution
      const resp = await fetch(`${evoUrl}/chat/findMessages/${evoInstance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoApiKey },
        body: JSON.stringify({ where: { remoteJid } }),
      });
      const data = await resp.json();

      if (
        !data ||
        !data.messages ||
        !Array.isArray(data.messages?.records || data.messages)
      ) {
        logger.error("evolution_fetch_failed", {
          error: "No messages returned",
          data,
        });
        return res.status(400).json({
          error: "Nenhuma mensagem retornada ou formato inválido.",
          data,
        });
      }

      const rawMessages = data.messages.records || data.messages;
      let count = 0;

      // Reverse messages if needed to insert from oldest to newest
      const sortedMessages = [...rawMessages].sort((a: any, b: any) => {
        const timeA = a.messageTimestamp || a.timestamp;
        const timeB = b.messageTimestamp || b.timestamp;
        return timeA - timeB;
      });

      for (const msg of sortedMessages) {
        // basic text extraction
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";
        if (!text) continue;

        const fromMe = msg.key?.fromMe;

        // try to avoid duplicate insertion by checking if same text exists recently in ticket?
        // for safety we just insert. A real app would check message key/id.
        await db.collection(`tickets/${ticketId}/messages`).add({
          ticketId,
          senderType: fromMe ? "human" : "customer",
          text,
          createdAt: msg.messageTimestamp
            ? admin.firestore.Timestamp.fromDate(
                new Date(msg.messageTimestamp * 1000),
              )
            : admin.firestore.FieldValue.serverTimestamp(),
          isImported: true,
        });
        count++;
      }

      res.status(200).json({ success: true, imported: count });
    } catch (e: any) {
      logger.error("evolution_fetch_failed", { error: e.message || String(e) });
      return res.status(500).json({
        error:
          "Falha de conexão com a Evolution API. URL indisponível ou erro de rede.",
      });
    }
  });

  // Generic proxy for Evolution API to avoid CORS or Mixed Content in frontend
  app.post("/api/evolution/proxy", express.json(), async (req, res) => {
    try {
      const {
        path: apiPath,
        method = "GET",
        body,
        evolutionUrl,
        evolutionApiKey,
      } = req.body;

      if (!evolutionUrl || !evolutionApiKey) {
        return res.status(400).json({
          error: "Evolution API credentials not provided in the request.",
        });
      }

      if (!apiPath) {
        return res.status(400).json({ error: "No path provided for proxy." });
      }

      // remove leading slash if present to avoid double slashes
      const cleanPath = apiPath.startsWith("/") ? apiPath.slice(1) : apiPath;
      const targetUrl = `${evolutionUrl.replace(/\/$/, "")}/${cleanPath}`;

      const fetchOptions: any = {
        method,
        headers: {
          apikey: evolutionApiKey,
          "Content-Type": "application/json",
        },
      };

      if (
        body &&
        (method === "POST" || method === "PUT" || method === "PATCH")
      ) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      logger.error("evolution_proxy_failed", {
        error: error.message || String(error),
      });
      res.status(500).json({
        error: "Erro de conexão com a Evolution API. URL ou rede indisponível.",
      });
    }
  });

  // Webhook for Evolution API
  app.post("/api/webhook/evolution", async (req, res) => {
    try {
      const redis = (await import("./src/lib/redis")).default;

      if (
        req.body?.event === "messages.delete" ||
        req.body?.data?.message?.revokedMessage
      ) {
        const revokedId =
          req.body?.data?.key?.id ||
          req.body?.data?.message?.revokedMessage?.key?.id;
        const instance =
          req.body?.instance ?? req.body?.data?.instance ?? req.body?.sender;
        if (revokedId) {
          // Marcar no Redis como revogada
          if (redis) {
            await redis.set(`revoked:${revokedId}`, "1", "EX", 3600);
          }
          // Tentar remover da fila se ainda aguardando
          if (instance) {
            const tq = await db
              .collection("tenants")
              .where("evolution_instance", "==", instance)
              .limit(1)
              .get();
            if (!tq.empty) {
              const tenantId = tq.docs[0].id;
              const { getTenantQueue } = await import("./src/lib/queue");
              const queue = getTenantQueue(tenantId);
              const job = await queue.getJob(revokedId);
              if (job) {
                const state = await job.getState();
                if (state === "waiting" || state === "delayed")
                  await job.remove();
              }
            }
          }
        }
        return res.status(200).json({ ok: true });
      }

      const webhookMessageData = req.body?.data ?? req.body;
      const isFromMe =
        webhookMessageData?.key?.fromMe ??
        webhookMessageData?.message?.key?.fromMe ??
        false;
      if (isFromMe === true) {
        return res.status(200).json({ ok: true, skipped: "own_message" });
      }

      const crypto = await import("crypto");
      const traceId = crypto.randomUUID();
      const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
      const signature = (req.headers["x-hub-signature-256"] as string) ?? "";
      const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";

      if (secret && signature) {
        const expected =
          "sha256=" +
          crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        try {
          const expectedBuffer = Buffer.from(expected);
          const signatureBuffer = Buffer.from(signature);
          if (
            expectedBuffer.length !== signatureBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
          ) {
            logger.warn("webhook_hmac_failed");
            return res.status(401).json({ error: "Unauthorized" });
          }
        } catch (e) {
          logger.warn("webhook_hmac_failed");
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      const payload = req.body;

      const instance =
        payload?.instance ?? payload?.data?.instance ?? payload?.sender;
      if (!instance) {
        return res.status(200).json({ ok: true, skipped: "no_instance_field" });
      }

      let tenantId: string | null = null;
      let tenantData: any = null;
      let instanceData: any = null;

      let tenantQuery = await db
        .collection("tenants")
        .where("evolution_instance", "==", instance)
        .limit(1)
        .get();

      if (!tenantQuery.empty) {
        tenantId = tenantQuery.docs[0].id;
        tenantData = tenantQuery.docs[0].data();
      } else {
        tenantQuery = await db
          .collection("tenants")
          .where("evolution_instances", "array-contains", instance)
          .limit(1)
          .get();
        if (!tenantQuery.empty) {
          tenantId = tenantQuery.docs[0].id;
          tenantData = tenantQuery.docs[0].data();
        } else {
          // Check new structure: whatsapp_instances/{tenantId}/instances/{instanceId}
          const instanceQuery = await db
            .collectionGroup("instances")
            .where("instance_id", "==", instance)
            .limit(1)
            .get();
          if (!instanceQuery.empty) {
            const docSnap = instanceQuery.docs[0];
            instanceData = docSnap.data();
            const possibleTenantId = docSnap.ref.parent.parent?.id;
            if (possibleTenantId) {
              const tDoc = await db
                .collection("tenants")
                .doc(possibleTenantId)
                .get();
              if (tDoc.exists) {
                tenantId = possibleTenantId;
                tenantData = tDoc.data();
              }
            }
          }
        }
      }

      if (!tenantId || !tenantData) {
        logger.warn("webhook_received", {
          error: "unknown_instance",
          data: { instance },
        });
        return res.status(200).json({ ok: true, skipped: "unknown_instance" });
      }

      // Enrich payload with the instance that received it
      payload.enriched_instance_id = instance;
      if (instanceData) {
        payload.enriched_instance_data = instanceData;
      }

      // PARTE C — Healthcheck cache validation antes de enfilerar
      const cacheKey = `tenant_health:${instance}`;
      let healthStatus = await import("./src/lib/redis").then((m) =>
        m.default.get(cacheKey),
      );

      if (!healthStatus) {
        healthStatus = tenantData?.whatsapp_health?.status || "open";
        await import("./src/lib/redis").then((m) =>
          m.default.set(cacheKey, healthStatus, "EX", 300),
        );
      }

      if (healthStatus !== "open" && healthStatus !== "unknown") {
        logger.warn("webhook_health_failed", {
          data: { instance, healthStatus },
        });
        return res
          .status(503)
          .json({ error: "Service Unavailable: WhatsApp Disconnected" });
      }

      // Handle connection.update for Battery Level
      if (
        payload.event === "connection.update" ||
        payload.event === "CONNECTION_UPDATE"
      ) {
         if (payload.data?.batteryLevel !== undefined) {
            const level = payload.data.batteryLevel;
            await db.collection("tenants").doc(tenantId).update({ "whatsapp_health.battery": level });
            if (level < 20) {
                await db.collection("notifications").add({
                    tenantId, 
                    title: "Bateria Fraca", 
                    message: `A bateria do aparelho conectado à Evolution está em ${level}%.`, 
                    type: "alert", 
                    read: false, 
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
         }
         return res.status(200).json({ status: "received_connection_update" });
      }

      // Handle message updates globally (Delivered/Read)
      if (
        payload.event === "messages.update" ||
        payload.event === "MESSAGES_UPDATE"
      ) {
        if (payload.data?.status === "ERROR") {
          logger.warn("whatsapp_delivery_error", {
            data: { remoteJid: payload.data?.remoteJid },
          });
        }
        
        let updateEvoId = payload.data?.key?.id;
        if (!updateEvoId && Array.isArray(payload.data) && payload.data.length > 0) {
            updateEvoId = payload.data[0]?.key?.id;
        }

        let msgStatus = payload.data?.update?.status || payload.data?.status;
        if (!msgStatus && Array.isArray(payload.data) && payload.data.length > 0) {
            msgStatus = payload.data[0]?.update?.status || payload.data[0]?.status;
        }

        if (updateEvoId && (msgStatus === 3 || msgStatus === "DELIVERY_ACK" || msgStatus === 4 || msgStatus === "READ")) {
            try {
                // Find message by evoMsgId
                const ticketsMsgs = await db.collectionGroup("messages").where("evoMsgId", "==", updateEvoId).get();
                const ticketsMsgs2 = await db.collectionGroup("messages").where("evoMsgIds", "array-contains", updateEvoId).get();
                const docsObj = new Map();
                ticketsMsgs.docs.forEach(d => docsObj.set(d.id, d));
                ticketsMsgs2.docs.forEach(d => docsObj.set(d.id, d));
                
                for (const docSnap of docsObj.values()) {
                    const mapUpd: any = {};
                    if (msgStatus === 3 || msgStatus === "DELIVERY_ACK") {
                       mapUpd.delivered_at = admin.firestore.FieldValue.serverTimestamp();
                    } else if (msgStatus === 4 || msgStatus === "READ") {
                       mapUpd.read_at = admin.firestore.FieldValue.serverTimestamp();
                       mapUpd.delivered_at = mapUpd.delivered_at || admin.firestore.FieldValue.serverTimestamp();
                    }
                    
                    if (Object.keys(mapUpd).length > 0) {
                        await docSnap.ref.update(mapUpd);
                    }
                }
            } catch (err: any) {
                logger.error("error_updating_message_analytics", { error: err.message });
            }
        }
        return res.status(200).json({ status: "received" });
      }

      if (
        payload.event !== "messages.upsert" &&
        payload.event !== "MESSAGES_UPSERT"
      ) {
        return res.status(200).json({ status: "received" });
      }

      logger.info("webhook_received", {
        phone_last4: (
          payload.data?.message?.key?.remoteJid || payload.data?.key?.remoteJid
        )?.slice(-4),
      });

      // LOG PAYLOAD FOR DEBUGGING
      fs.appendFileSync(
        "webhook-payloads.log",
        "\n" + new Date().toISOString() + " " + JSON.stringify(payload) + "\n",
      );

      // Handle different Evolution API Payload structures
      let messageContainer = null;
      if (
        payload.data &&
        payload.data.message &&
        payload.data.message.message
      ) {
        messageContainer = payload.data.message;
      } else if (
        payload.data &&
        payload.data.messages &&
        payload.data.messages.length > 0
      ) {
        messageContainer = payload.data.messages[0];
      } else if (payload.data && payload.data[0] && payload.data[0].message) {
        messageContainer = payload.data[0];
      } else if (payload.data && payload.data.message) {
        // Fallback where data.message is the message itself
        messageContainer = {
          message: payload.data.message,
          key: payload.data.key,
        };
      }

      const messageData = messageContainer?.message;
      if (!messageContainer || !messageData) {
        fs.appendFileSync(
          "webhook-payloads.log",
          "\n-- No message data found. messageContainer: " +
            JSON.stringify(messageContainer) +
            "\n",
        );
        return res.status(200).json({ status: "received_but_empty" });
      }

      const messageId = messageContainer.key?.id;
      if (messageId) {
        // PARTE A — Idempotência
        const processedKey = `processed:${messageId}`;
        const lock = await redis.set(processedKey, "1", "EX", 300, "NX");
        if (!lock) {
          return res
            .status(200)
            .json({ ok: true, duplicate: true, status: "already_processed" });
        }
      }

      let remoteJid = messageContainer.key?.remoteJid;
      if (remoteJid && remoteJid.includes(":")) {
        remoteJid = remoteJid.replace(/:\d+/, "");
      }
      const fromMe = messageContainer.key?.fromMe;
      const pushName =
        payload.data?.pushName ||
        payload.pushName ||
        messageContainer?.pushName ||
        `Lead ${remoteJid?.replace(/\D/g, "").slice(-4) || "Novo"}`;

      // Verificar bloqueio de sessão
      const isBlocked = await redis.get(`blocked:${remoteJid}`);
      if (isBlocked && !fromMe) {
        return res.status(200).json({ ok: true, skipped: "blocked_session" });
      }

      // Ignore messages from ourselves or from groups
      if (fromMe || !remoteJid || remoteJid.includes("@g.us")) {
        return res.status(200).json({ status: "received" });
      }

      // NOVO: TRATAMENTO DE SINCRONIZAÇÃO HISTÓRICA
      let isHistoricalSync = false;
      const messageTs =
        messageContainer.messageTimestamp || messageContainer.timestamp;
      if (messageTs) {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        if (nowInSeconds - messageTs > 3600) {
          // older than 1 hour
          logger.info("webhook_historical_sync_detected", {
            data: { messageTs, remoteJid },
          });
          isHistoricalSync = true;
        }
      }

      // NOVO: TRATAMENTO DE NÚMEROS INTERNACIONAIS (PARTE A)
      const phoneNumber = remoteJid.replace("@s.whatsapp.net", "");
      const isBrazilian =
        phoneNumber.startsWith("55") && phoneNumber.length >= 12;

      if (!isBrazilian) {
        const internationalMessage = phoneNumber.startsWith("1")
          ? "Hello! Our service is currently available only in Portuguese for Brazilian customers. For support, please contact us at [email]."
          : "Olá! Nosso atendimento é em português para clientes no Brasil. Para suporte internacional, entre em contato pelo email [email].";

        const { getIntegrationKeys } = await import("./src/lib/dbAdmin");
        const keys = await getIntegrationKeys();
        const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
        const evoInstance = keys.evolutionInstance;
        const evoApiKey = keys.evolutionApiKey;

        if (evoUrl && evoInstance && evoApiKey) {
          await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({
              number: remoteJid,
              text: internationalMessage,
            }),
          }).catch(() => {});
        }

        const { logSecurityEvent } = await import("./src/lib/audit");
        await logSecurityEvent("INTERNATIONAL_NUMBER", {
          remoteJid,
          prefix: phoneNumber.substring(0, 4),
        });
        return res
          .status(200)
          .json({ ok: true, skipped: "international_number" });
      }

      const existingTicket = await db
        .collection("tickets")
        .where("phone_number", "==", remoteJid)
        .where("tenantId", "==", tenantId)
        .where("status", "==", "open")
        .limit(1)
        .get();

      let ticketId;
      if (existingTicket.empty) {
        const newTicket = await db.collection("tickets").add({
          phone_number: remoteJid,
          tenantId: tenantId,
          status: "open",
          customerId: remoteJid, // Fallback customerId
          subject: "Novo atendimento WhatsApp",
          priority: "medium",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          session_state: { active_flow: "IDLE" },
          aiEnabled: true,
          aiAttempts: 0,
        });
        ticketId = newTicket.id;
      } else {
        ticketId = existingTicket.docs[0].id;
      }

      let textMessage =
        messageData.conversation || messageData.extendedTextMessage?.text || "";

      if (messageData?.audioMessage || messageData?.pttMessage) {
        const audioUrl =
          messageData?.audioMessage?.url ??
          messageData?.pttMessage?.url ??
          payload.data?.message?.base64;

        if (audioUrl) {
          const { enqueueMessage } = await import("./src/lib/queue.ts");
          await enqueueMessage(
            tenantId,
            {
              remoteJid,
              tenantId,
              messageId,
              isAudio: true,
              audioUrl,
              pushName,
              messageData,
              payload,
              ticketId,
              traceId,
              enriched_instance_id: payload.enriched_instance_id,
              enriched_instance_data: payload.enriched_instance_data,
            },
            { jobId: `audio:${instance}:${remoteJid}:${Date.now()}` },
            "process-message",
          );
          return res.status(200).json({ ok: true, status: "queued_audio" });
        }
      }

      // PARTE B — Message Aggregation Window
      const windowKey = `msg_window:${instance}:${remoteJid}`;
      const bufferKey = `msg_buffer:${instance}:${remoteJid}`;

      // Acumular mensagem no buffer
      const existing = await redis.get(bufferKey);
      const buffer = existing ? JSON.parse(existing) : [];
      let textContent = "";
      if (messageContainer?.message?.conversation) {
        textContent = messageContainer.message.conversation;
      } else if (messageContainer?.message?.extendedTextMessage?.text) {
        textContent = messageContainer.message.extendedTextMessage.text;
      } else if (messageContainer?.message?.audioMessage) {
        textContent = "[Audio Message]";
      } else if (messageContainer?.message?.locationMessage) {
        const { degreesLatitude: lat, degreesLongitude: lng } =
          messageContainer.message.locationMessage;

        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          { headers: { "User-Agent": "AstrumTelecom/1.0" } },
        );
        const geo = await geoRes.json();
        const cep = geo?.address?.postcode?.replace("-", "") ?? null;

        if (cep) {
          textContent = cep;
          payload.location_cep_detected = cep;
        } else {
          const { getIntegrationKeys } = await import("./src/lib/dbAdmin");
          const keys = await getIntegrationKeys();
          const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
          const evoInstance = keys.evolutionInstance;
          const evoApiKey = keys.evolutionApiKey;
          if (evoUrl && evoApiKey && evoInstance) {
            await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: evoApiKey,
              },
              body: JSON.stringify({
                number: remoteJid,
                text: "Recebi sua localização! Mas não consegui identificar o CEP exato. Pode me digitar o CEP de 8 dígitos?",
              }),
            });
          }
          return res.status(200).json({ status: "queued_location_prompt" });
        }
      } else if (
        messageContainer?.message?.templateButtonReplyMessage
          ?.selectedDisplayText
      ) {
        textContent =
          messageContainer.message.templateButtonReplyMessage
            .selectedDisplayText;
      } else if (
        messageContainer?.message?.buttonsResponseMessage?.selectedDisplayText
      ) {
        textContent =
          messageContainer.message.buttonsResponseMessage.selectedDisplayText;
      }

      buffer.push({
        id: messageContainer?.key?.id || messageId,
        text: textContent,
        timestamp: Date.now(),
        messageData: messageData,
        payload: payload,
      });
      await redis.set(bufferKey, JSON.stringify(buffer), "EX", 30);

      // Renovar janela de 2 segundos -- na verdade o NX só cria se não existir.
      // Se eu quiser renovar a janela a cada mensagem, o NX não serve, precisaria fazer:
      // se existir janela, apenas renova o TTL. Se NÃO existir, cria com TTL 2 e dispara o Job.
      // E no user snippet: `redis.set(windowKey, '1', 'EX', 2, 'NX')` -> só seta se não existir e dura 2 seg
      // Quando não existia (isNewWindow == true), agenda o job pra daqui a 2.1s.
      // Pra *renovar* a cada digitação, tem que dar um expire.
      // O prompt diz: "O comportamento desejado: aguardar 2 segundos após a última mensagem antes de processar."
      // Mas a implementação sugerida do prompt diz: `const isNewWindow = await redis.set(windowKey, '1', 'EX', 2, 'NX');`
      // E `if (isNewWindow) { await messageQueue.add(..., { delay: 2100 }) }`
      // O Redis do BullMQ com delay 2.1s vai processar em 2.1s *da primeira mensagem*.
      // Vamos seguir a ideia do user mas adicionando atraso dinâmico ou respeitando o buffer.
      // Pelo prompt: "Renovar janela de 2 segundos ... / Se janela já existe: apenas acumulou no buffer, o job existente vai pegar tudo".
      // Se agendar 2.1s depois, o job processa todas as msg que chegarem naqueles 2s iniciais!
      // Vamos fazer exatamente como o usuário pediu, enviando { remoteJid, tenantId: instanceName, bufferKey, payload: payload }
      const isNewWindow = await redis.set(windowKey, "1", "EX", 2, "NX");

      if (isNewWindow) {
        // Primeira mensagem da janela — agendar processamento para 2.1s depois
        const { enqueueMessage } = await import("./src/lib/queue.ts");
        await enqueueMessage(
          tenantId,
          {
            remoteJid,
            tenantId,
            bufferKey,
            pushName,
            messageId,
            ticketId,
            traceId,
            isHistoricalSync,
            enriched_instance_id: payload.enriched_instance_id,
            enriched_instance_data: payload.enriched_instance_data,
          },
          {
            delay: 2100,
            jobId: `window:${instance}:${remoteJid}:${Date.now()}`,
          },
          "process-message",
        );
      }

      // Respond immediately to prevent Evolution API from retrying/timing out
      return res.status(200).json({ status: "queued" });
    } catch (error: any) {
      if (error.message?.includes("FIREBASE_SERVICE_ACCOUNT_JSON")) {
        logger.info("webhook_skipped_no_firebase", {
          error: "Firebase Admin is disabled due to missing environment keys.",
        });
        if (!res.headersSent) {
          return res.status(200).json({ status: "skipped_no_firebase" });
        }
        return;
      }
      logger.error("webhook_processing_failed", { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal enqueue error",
          message: error.message,
          stack: error.stack,
        });
      }
    }
  });

  const validateNocSignature = (req: any, res: any, next: any) => {
    const signature = req.headers["x-noc-signature"];
    const secret = process.env.NOC_WEBHOOK_SECRET;
    if (!secret) return next();

    if (!signature) {
      return res.status(401).json({ error: "Missing signature" });
    }
    const hmac = createHmac("sha256", secret);
    const calculated = hmac.update(JSON.stringify(req.body)).digest("hex");
    if (signature !== calculated) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    next();
  };

  const resolveIncident = async (ctoId: string, tenantId: string) => {
    const { cobraiQueue } = await import("./src/workers/cobraiWorker");

    // 1. Atualizar incidents com status: 'resolved', resolved_at
    const incidentsSnap = await db
      .collection("incidents")
      .where("cto_id", "==", ctoId)
      .where("tenant_id", "==", tenantId)
      .where("status", "==", "active")
      .get();

    for (const incidentDoc of incidentsSnap.docs) {
      await incidentDoc.ref.update({
        status: "resolved",
        resolved_at: new Date(),
      });
    }

    // 2. Deletar cto_incidents/{ctoId}
    await db.collection("cto_incidents").doc(ctoId).delete();

    // 3. Enviar template HSM de resolução para clientes afetados
    const affectedCustomers = await db
      .collection("customers")
      .where("cto_id", "==", ctoId)
      .where("tenant_id", "==", tenantId)
      .where("status", "==", "ativo")
      .get();

    for (const customer of affectedCustomers.docs) {
      await cobraiQueue.add(
        "noc_notification",
        {
          customerId: customer.id,
          tenantId: tenantId,
          templateName: "noc_incident_resolved",
          params: { cto_name: customer.data().cto_name },
        },
        { delay: 0, priority: 1 },
      );
    }
  };

  app.get("/api/webhook/facebook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe") {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/api/webhook/facebook", express.json(), async (req, res) => {
    try {
      res.status(200).send("EVENT_RECEIVED");

      const body = req.body;
      if (body.object === "page") {
        for (const entry of body.entry) {
          const pageId = entry.id;

          const tenantQuery = await db.collection("tenants").where("facebook.pageId", "==", pageId).limit(1).get();
          if (tenantQuery.empty) {
             logger.warn("facebook_webhook_no_tenant", { data: { pageId } });
             continue;
          }
          const tenantId = tenantQuery.docs[0].id;
          const { getTenantQueue } = await import("./src/lib/queue");
          const queue = getTenantQueue(tenantId);

          if (entry.messaging) {
            for (const event of entry.messaging) {
               if (event.message && !event.message.is_echo) {
                  const remoteJid = event.sender.id;
                  const messageText = event.message.text;
                  const messageId = event.message.mid;
                  
                  const payload = {
                      source: "facebook",
                      messageId,
                      remoteJid,
                      pushName: "Facebook User",
                      message: {
                         conversation: messageText || ""
                      },
                      sender: pageId,
                  };

                  await queue.add("process-message", payload, {
                     jobId: messageId
                  });
               }
            }
          }
        }
      }
    } catch (err) {
       console.error("facebook_webhook_error:", err);
    }
  });

  app.get("/api/webhook/instagram", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe") {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/api/webhook/instagram", express.json(), async (req, res) => {
    try {
      res.status(200).send("EVENT_RECEIVED");

      const body = req.body;
      if (body.object === "instagram") {
        for (const entry of body.entry) {
          const pageId = entry.id;

          const tenantQuery = await db.collection("tenants").where("instagram.pageId", "==", pageId).limit(1).get();
          if (tenantQuery.empty) {
             logger.warn("instagram_webhook_no_tenant", { data: { pageId } });
             continue;
          }
          const tenantId = tenantQuery.docs[0].id;
          const { getTenantQueue } = await import("./src/lib/queue");
          const queue = getTenantQueue(tenantId);

          if (entry.messaging) {
            for (const event of entry.messaging) {
               if (event.message && !event.message.is_echo) {
                  const remoteJid = event.sender.id;
                  const messageText = event.message.text;
                  const messageId = event.message.mid;
                  
                  const payload = {
                      source: "instagram",
                      messageId,
                      remoteJid,
                      pushName: "Instagram User",
                      message: {
                         conversation: messageText || ""
                      },
                      sender: pageId,
                  };

                  await queue.add("process-message", payload, {
                     jobId: messageId
                  });
               }
            }
          }
        }
      }
    } catch (err) {
       console.error("instagram_webhook_error:", err);
    }
  });

  app.post(
    "/api/webhook/noc",
    express.json(),
    validateNocSignature,
    async (req, res) => {
      try {
        const {
          event_type,
          cto_id,
          cto_name,
          tenant_id,
          severity,
          description,
        } = req.body;
        const { cobraiQueue } = await import("./src/workers/cobraiWorker");

        if (
          event_type === "DOWN" &&
          severity >= parseInt(process.env.NOC_ALERT_SEVERITY_THRESHOLD ?? "3")
        ) {
          // 1. Registrar incidente no Firestore
          const incidentRef = await db.collection("incidents").add({
            cto_id,
            cto_name,
            tenant_id,
            status: "active",
            source: "NOC",
            severity,
            description,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 2. Bloquear OS para essa CTO por 6h
          await db
            .collection("cto_incidents")
            .doc(cto_id)
            .set({
              incident_id: incidentRef.id,
              blocked_until: admin.firestore.Timestamp.fromDate(
                new Date(Date.now() + 6 * 60 * 60 * 1000),
              ),
            });

          // 3. Buscar todos os clientes ativos nessa CTO
          const affectedCustomers = await db
            .collection("customers")
            .where("cto_id", "==", cto_id)
            .where("tenant_id", "==", tenant_id)
            .where("status", "==", "ativo")
            .get();

          // 4. Disparar mensagem proativa para cada cliente via CobrAI queue
          for (const customer of affectedCustomers.docs) {
            await cobraiQueue.add(
              "noc_notification",
              {
                customerId: customer.id,
                tenantId: tenant_id,
                templateName: "noc_incident_proactive",
                params: { cto_name, incident_id: incidentRef.id },
              },
              { delay: 0, priority: 1 },
            );
          }
        }

        if (event_type === "UP") {
          // Resolver incidente e notificar clientes afetados
          await resolveIncident(cto_id, tenant_id);
        }

        res.status(200).json({ received: true });
      } catch (e: any) {
        logger.error("noc_webhook_failed", { error: e.message });
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.post("/api/webhook/ixc", express.json(), async (req, res) => {
    try {
      res.status(200).json({ received: true });
      const tenantId = (req.query.tenantId ||
        req.body.tenant_id ||
        req.headers["x-tenant-id"]) as string;
      if (!tenantId) return;
      const tenantSnap = await db.collection("tenants").doc(tenantId).get();
      if (!tenantSnap.exists) return;

      const secret = tenantSnap.data()?.erp_webhook_secret;
      if (secret) {
        const signature =
          req.headers["x-api-signature"] ||
          req.headers["x-ixc-signature"] ||
          req.headers["x-webhook-signature"] ||
          req.headers["x-signature"];
        if (!signature) return;
        const hmac = createHmac("sha256", secret);
        const calculated = hmac.update(JSON.stringify(req.body)).digest("hex");
        if (signature !== calculated) return;
      }

      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      const { parseIXCEvent } =
        await import("./src/lib/integrations/webhookOrchestrator");
      const redis = (await import("./src/lib/redis")).default;

      const normalizedEvent = parseIXCEvent(tenantId, req.body);

      // Idempotency: exact event ID
      const isNewEvent = await redis.set(
        `erp_event:${normalizedEvent.event_id}`,
        "1",
        "EX",
        3600,
        "NX",
      );
      if (!isNewEvent) return; // already processed

      // Deduplication: same type+CPF within 60s
      if (normalizedEvent.customer_cpf) {
        const debounceKey = `erp_debounce:${normalizedEvent.type}:${normalizedEvent.customer_cpf}`;
        const isDebounce = await redis.set(debounceKey, "1", "EX", 60, "NX");
        if (!isDebounce) {
          console.log(
            `Debounced IXC event ${normalizedEvent.type} for CPF ${normalizedEvent.customer_cpf}`,
          );
          return;
        }
      }

      await cobraiQueue.add("erp_event", normalizedEvent);
    } catch (e) {
      console.error("IXC Webhook Error:", e);
    }
  });

  app.post("/api/webhook/mkauth", express.json(), async (req, res) => {
    try {
      res.status(200).json({ received: true });
      const tenantId = (req.query.tenantId ||
        req.body.tenant_id ||
        req.headers["x-tenant-id"]) as string;
      if (!tenantId) return;
      const tenantSnap = await db.collection("tenants").doc(tenantId).get();
      if (!tenantSnap.exists) return;

      const secret = tenantSnap.data()?.erp_webhook_secret;
      if (secret) {
        const signature =
          req.headers["x-api-signature"] ||
          req.headers["x-mkauth-signature"] ||
          req.headers["x-webhook-signature"] ||
          req.headers["x-signature"];
        if (!signature) return;
        const hmac = createHmac("sha256", secret);
        const calculated = hmac.update(JSON.stringify(req.body)).digest("hex");
        if (signature !== calculated) return;
      }

      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      const { parseMKAuthEvent } =
        await import("./src/lib/integrations/webhookOrchestrator");
      const redis = (await import("./src/lib/redis")).default;

      const normalizedEvent = parseMKAuthEvent(tenantId, req.body);

      // Idempotency: exact event ID
      const isNewEvent = await redis.set(
        `erp_event:${normalizedEvent.event_id}`,
        "1",
        "EX",
        3600,
        "NX",
      );
      if (!isNewEvent) return; // already processed

      // Deduplication: same type+CPF within 60s
      if (normalizedEvent.customer_cpf) {
        const debounceKey = `erp_debounce:${normalizedEvent.type}:${normalizedEvent.customer_cpf}`;
        const isDebounce = await redis.set(debounceKey, "1", "EX", 60, "NX");
        if (!isDebounce) {
          console.log(
            `Debounced MKAuth event ${normalizedEvent.type} for CPF ${normalizedEvent.customer_cpf}`,
          );
          return;
        }
      }

      await cobraiQueue.add("erp_event", normalizedEvent);
    } catch (e) {
      console.error("MKAuth Webhook Error:", e);
    }
  });

  app.post("/api/webhook/voalle", express.json(), async (req, res) => {
    try {
      res.status(200).json({ received: true });
      const tenantId = (req.query.tenantId ||
        req.body.tenant_id ||
        req.headers["x-tenant-id"]) as string;
      if (!tenantId) return;
      const tenantSnap = await db.collection("tenants").doc(tenantId).get();
      if (!tenantSnap.exists) return;

      const secret = tenantSnap.data()?.erp_webhook_secret;
      if (secret) {
        const signature =
          req.headers["x-api-signature"] ||
          req.headers["x-voalle-signature"] ||
          req.headers["x-webhook-signature"] ||
          req.headers["x-signature"];
        if (!signature) return;
        const hmac = createHmac("sha256", secret);
        const calculated = hmac.update(JSON.stringify(req.body)).digest("hex");
        if (signature !== calculated) return;
      }

      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      const { parseVoalleEvent } =
        await import("./src/lib/integrations/webhookOrchestrator");
      const redis = (await import("./src/lib/redis")).default;

      const normalizedEvent = parseVoalleEvent(tenantId, req.body);

      // Idempotency: exact event ID
      const isNewEvent = await redis.set(
        `erp_event:${normalizedEvent.event_id}`,
        "1",
        "EX",
        3600,
        "NX",
      );
      if (!isNewEvent) return; // already processed

      // Deduplication: same type+CPF within 60s
      if (normalizedEvent.customer_cpf) {
        const debounceKey = `erp_debounce:${normalizedEvent.type}:${normalizedEvent.customer_cpf}`;
        const isDebounce = await redis.set(debounceKey, "1", "EX", 60, "NX");
        if (!isDebounce) {
          console.log(
            `Debounced Voalle event ${normalizedEvent.type} for CPF ${normalizedEvent.customer_cpf}`,
          );
          return;
        }
      }

      await cobraiQueue.add("erp_event", normalizedEvent);
    } catch (e) {
      console.error("Voalle Webhook Error:", e);
    }
  });

  app.post(
    "/api/webhook/payment-confirmed",
    express.json(),
    async (req, res) => {
      try {
        const { cpf, tenantId } = req.body;
        if (!cpf || !tenantId)
          return res.status(400).json({ error: "Missing cpf or tenantId" });

        const { enqueueMessage } = await import("./src/lib/queue");
        const { logAuditEvent } = await import("./src/lib/audit");
        const { getERPAdapter } =
          await import("./src/lib/integrations/erpAdapter");

        // 1. Identificar cliente por CPF
        const customersSnap = await db
          .collection("customers")
          .where("cpf", "==", cpf)
          .where("tenantId", "==", tenantId)
          .get();
        if (customersSnap.empty) {
          // Tenta buscar no banco com `tenant_id` se o admin não padronizou o nome
          const backupSnap = await db
            .collection("customers")
            .where("cpf", "==", cpf)
            .where("tenant_id", "==", tenantId)
            .get();
          if (backupSnap.empty)
            return res.status(404).json({ error: "Cliente não encontrado" });
        }

        const customerDoc = !customersSnap.empty
          ? customersSnap.docs[0]
          : (
              await db
                .collection("customers")
                .where("cpf", "==", cpf)
                .where("tenant_id", "==", tenantId)
                .get()
            ).docs[0];
        const customer = customerDoc.data();
        const customerId = customerDoc.id;
        const phone = customer.phone;

        // 2. Chamar adapter.unlockCustomer(cpf)
        const adapter = await getERPAdapter(tenantId);
        await adapter.unlockCustomer(cpf);

        // 3. Enviar WhatsApp de confirmação com BullMQ
        if (phone) {
          const text = `Olá, ${customer.name?.split(" ")[0] || "cliente"}! Identificamos o seu pagamento com sucesso. Seu acesso já foi restabelecido! Muito obrigado. 🎉`;
          await enqueueMessage(
            tenantId,
            { text, phone, tenantId },
            {},
            "send_whatsapp_text",
          );
        }

        // 4. Fechar ticket de cobrança
        const phoneToMatch =
          typeof phone === "string" ? phone.replace(/\D/g, "") : null;
        let ticketQuery = db
          .collection("tickets")
          .where("tenantId", "==", tenantId)
          .where("status", "==", "open");

        // We look for any open financial ticket for this customer
        const openTickets = await ticketQuery.get();
        for (const ticket of openTickets.docs) {
          const tData = ticket.data();
          if (
            (tData.customerId === customerId ||
              tData.cpf === cpf ||
              (phoneToMatch &&
                String(tData.phone_number).includes(phoneToMatch))) &&
            (tData.category === "FATURA" ||
              tData.subject?.toLowerCase().includes("fatura"))
          ) {
            await ticket.ref.update({
              status: "resolved",
              resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
              resolution_note:
                "Ticket fechado automaticamente por confirmação de pagamento via Webhook.",
            });
          }
        }

        // 5. Registrar no audit_logs
        await logAuditEvent({
          event_type: "PAYMENT_CONFIRMED" as any,
          tenant_id: tenantId,
          resource_id: customerId,
          old_value: "blocked/pending",
          new_value: "unlocked",
        });

        res
          .status(200)
          .json({ success: true, message: "Pagamento processado." });
      } catch (e: any) {
        logger.error("payment_confirmed_webhook_error", { error: e.message });
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.post(
    "/api/integrations/embeddings/test",
    express.json(),
    async (req, res) => {
      try {
        const { provider, apiKey, model, baseUrl, dimensions } = req.body;
        const start = Date.now();

        let embedding;
        if (provider === "openai" || !provider) {
          const fetchRes = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: "teste de conexão",
              model: model || "text-embedding-3-small",
            }),
          });
          const data = await fetchRes.json();
          if (data.error) throw new Error(data.error.message);
          embedding = data.data[0].embedding;
        } else {
          const fetchRes = await fetch(`${baseUrl}/embeddings`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ input: "teste de conexão", model }),
          });
          const data = await fetchRes.json();
          if (data.error) throw new Error(data.error.message);
          embedding =
            data.data?.[0]?.embedding ?? data.embeddings?.[0] ?? data.embedding;
        }

        res.json({
          success: true,
          model: model || "text-embedding-3-small",
          dimensions: embedding.length,
          latency_ms: Date.now() - start,
        });
      } catch (e: any) {
        res.status(400).json({ success: false, error: e.message });
      }
    },
  );

  app.post(
    "/api/integrations/vectorstore/test",
    express.json(),
    async (req, res) => {
      try {
        const { url, apiKey, collection, provider } = req.body;
        const start = Date.now();

        if (provider !== "qdrant" && provider !== undefined) {
          throw new Error(
            `Provider ${provider} not supported by this interface yet.`,
          );
        }

        const response = await fetch(`${url}/collections/${collection}`, {
          headers: { "api-key": apiKey },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.status?.error ||
              `Request failed with status ${response.status}`,
          );
        }

        res.json({
          success: response.ok,
          collection: data.result?.name,
          vectors_count: data.result?.vectors_count ?? 0,
          status: data.result?.status,
          latency_ms: Date.now() - start,
        });
      } catch (e: any) {
        res.status(400).json({ success: false, error: e.message });
      }
    },
  );

  app.get("/api/integrations/vectorstore/ping", async (req, res) => {
    try {
      const { tenantId } = req.query;
      const { getVectorStore } = await import("./src/lib/vectorStore");
      // Just test if we can get the store instance without errors
      const store = await getVectorStore(tenantId as string);

      const q = db
        .collection("knowledge_base")
        .where("tenant_id", "==", tenantId || "default")
        .where("vector_indexed", "==", true);

      const countSnap = await q.count().get();
      const articles_count = countSnap.data().count;

      res.json({ connected: true, articles_count, provider: "qdrant" });
    } catch (e: any) {
      res.json({ connected: false, error: e.message });
    }
  });

  app.post("/api/knowledge/articles", express.json(), async (req, res) => {
    try {
      const { title, content, category, tenantId } = req.body;
      const { addToKnowledgeBase } = await import("./src/lib/dbAdmin");
      const id = await addToKnowledgeBase({
        title,
        content,
        category,
        tenantId,
      });
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/knowledge/articles/:id", express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, category, tenantId } = req.body;
      const { getVectorStore } = await import("./src/lib/vectorStore");
      const { getEmbeddingProvider } =
        await import("./src/lib/embeddingProvider");

      const docRef = db.collection("knowledge_base").doc(id);
      await docRef.update({ title, content, category });

      const embeddingProvider = await getEmbeddingProvider(tenantId);
      const vectorStore = await getVectorStore(tenantId);

      const embedding = await embeddingProvider.embed(
        `${title}\n\n${content}`,
        tenantId,
      );
      await vectorStore.upsert(
        {
          id,
          text: content,
          embedding,
          metadata: { tenant_id: tenantId, category, title },
        },
        tenantId,
      );

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete(
    "/api/knowledge/articles/:id",
    express.json(),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { tenantId } = req.query;
        const { deleteKBArticle } = await import("./src/lib/dbAdmin");
        const { getVectorStore } = await import("./src/lib/vectorStore");

        await deleteKBArticle(id);
        const vectorStore = await getVectorStore(tenantId as string);
        try {
          await vectorStore.delete(id, tenantId as string);
        } catch (e) {
          console.warn(`Could not delete from vector store for id ${id}`, e);
        }

        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.post(
    "/api/knowledge/articles/:id/reindex",
    express.json(),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { tenantId } = req.body;
        const { getVectorStore } = await import("./src/lib/vectorStore");
        const { getEmbeddingProvider } =
          await import("./src/lib/embeddingProvider");

        const docRef = db.collection("knowledge_base").doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          return res.status(404).json({ error: "Article not found" });
        }

        const articleData = docSnap.data();
        const contentForEmbedding = `${articleData?.title}\n\n${articleData?.content}`;

        const embeddingProvider = await getEmbeddingProvider(tenantId);
        const vectorStore = await getVectorStore(tenantId);

        const embedding = await embeddingProvider.embed(
          contentForEmbedding,
          tenantId,
        );
        await vectorStore.upsert(
          {
            id,
            text: articleData?.content,
            embedding,
            metadata: {
              tenant_id: tenantId,
              category: articleData?.category,
              title: articleData?.title,
            },
          },
          tenantId,
        );

        await docRef.update({
          vector_indexed: true,
          vector_indexed_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    },
  );

  app.post("/api/knowledge/search-test", express.json(), async (req, res) => {
    try {
      const { query, tenantId } = req.body;
      const start = Date.now();
      const { searchKnowledgeBase } = await import("./src/lib/dbAdmin");
      const results = await searchKnowledgeBase(query, tenantId);

      res.json({ success: true, results, latency_ms: Date.now() - start });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/knowledge/reindex", express.json(), async (req, res) => {
    try {
      const { tenantId } = req.body;
      const { getVectorStore } = await import("./src/lib/vectorStore");
      const { getEmbeddingProvider } =
        await import("./src/lib/embeddingProvider");

      const articlesSnap = await db
        .collection("knowledge_base")
        .where("tenant_id", "==", tenantId || "default")
        .get();

      const total_articles = articlesSnap.size;
      res.json({ started: true, total_articles });

      if (total_articles === 0) return;

      const redisModule = await import("./src/lib/redis").catch(() => null);
      const redisClient = redisModule?.default || redisModule?.redis;

      const setProgress = async (indexed: number) => {
        if (redisClient) {
          await redisClient.set(
            `reindex:${tenantId || "default"}`,
            JSON.stringify({
              total: total_articles,
              indexed,
              percent: Math.round((indexed / total_articles) * 100),
              status: indexed === total_articles ? "done" : "running",
            }),
            "EX",
            3600,
          );
        }
      };

      await setProgress(0);

      const embeddingProvider = await getEmbeddingProvider(tenantId);
      const vectorStore = await getVectorStore(tenantId);

      const docs = articlesSnap.docs;
      let indexedCount = 0;

      // Process in batches of 10 inside background task
      const batchSize = 10;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batchDocs = docs.slice(i, i + batchSize);

        await Promise.all(
          batchDocs.map(async (docSnap) => {
            try {
              const data = docSnap.data();
              const textToEmbed = `${data.title}\n\n${data.content}`;
              const embedding = await embeddingProvider.embed(
                textToEmbed,
                tenantId,
              );

              await vectorStore.upsert(
                {
                  id: docSnap.id,
                  text: data.content,
                  embedding,
                  metadata: {
                    tenant_id: data.tenant_id,
                    category: data.category,
                    title: data.title,
                  },
                },
                tenantId,
              );

              await docSnap.ref.update({
                vector_indexed: true,
              });

              indexedCount++;
            } catch (err) {
              console.error(`Error reindexing doc ${docSnap.id}:`, err);
            }
          }),
        );
        await setProgress(indexedCount);
      }
    } catch (e: any) {
      console.error("Reindex Error:", e);
    }
  });

  app.get("/api/knowledge/reindex/status", async (req, res) => {
    try {
      const { tenantId } = req.query;
      const key = `reindex:${tenantId || "default"}`;
      const redisModule = await import("./src/lib/redis").catch(() => null);
      const redisClient = redisModule?.default || redisModule?.redis;
      if (!redisClient) {
        return res.json({ status: "idle" });
      }
      const statusStr = await redisClient.get(key);
      if (statusStr) {
        res.json(JSON.parse(statusStr));
      } else {
        res.json({ status: "idle" });
      }
    } catch (e) {
      res.json({ status: "idle" });
    }
  });


  // Redis Mock para detectar clusters de incidentes
  const redisMock = new Map<string, { count: number, expiresAt: number }>();
  
  const incrRedis = (key: string, ttlSeconds: number) => {
     const now = Date.now();
     let entry = redisMock.get(key);
     if (!entry || entry.expiresAt < now) {
        entry = { count: 0, expiresAt: now + (ttlSeconds * 1000) };
     }
     entry.count += 1;
     redisMock.set(key, entry);
     return entry.count;
  };

  app.post("/api/incidents/macro", async (req, res) => {
     try {
       const { tenantId, ctoId, client } = req.body;
       const tId = tenantId || "default";
       
       // check se ja existe
       const incRef = db.collection("macro_incidents");
       const activeIncidents = await incRef.where("tenantId", "==", tId).where("ctoId", "==", ctoId).where("status", "==", "active").get();
       
       if (activeIncidents.empty) {
          const doc = await incRef.add({
             tenantId: tId,
             ctoId,
             status: "active",
             createdAt: new Date().toISOString(),
             affectedClients: [client]
          });
          
          try {
             const { cobraiQueue } = await import("./src/workers/cobraiWorker");
             if (cobraiQueue && cobraiQueue.add) {
                const custSnap = await db.collection("customers")
                    .where("tenantId", "==", tId)
                    .where("cto_id", "==", ctoId)
                    .where("status", "==", "ativo")
                    .get();
                    
                for (const cust of custSnap.docs) {
                   await cobraiQueue.add("incident_notification", {
                       customerId: cust.id,
                       tenantId: tId,
                       cto_name: ctoId,
                       estimated_resolution: 'breve'
                   }, { priority: 1, delay: 0 });
                }
             }
          } catch(err) {
             console.error("Erro dispatching incident notifications", err);
          }

          res.json({ status: "created", incidentId: doc.id, message: `Acidente de rede em massa detectado na CTO ${ctoId}. Equipe de campo em prioridade máxima.` });
       } else {
          const incId = activeIncidents.docs[0].id;
          const affected = activeIncidents.docs[0].data().affectedClients || [];
          if (!affected.includes(client)) {
             await incRef.doc(incId).update({ affectedClients: [...affected, client] });
          }
          res.json({ status: "exists", incidentId: incId, message: `Já existe um incidente ativo na CTO ${ctoId}. Sua solicitação foi vinculada ao evento.` });
       }
     } catch(e: any) {
        res.status(500).json({ error: e.message });
     }
  });

  app.get("/api/incidents/active", async (req, res) => {
    try {
      const { tenantId } = req.query;
      const tId = (tenantId as string) || "default";
      const incRef = db.collection("macro_incidents");
      const activeIncidents = await incRef.where("tenantId", "==", tId).where("status", "==", "active").get();
      const incidents = activeIncidents.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      res.json(incidents);
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/incidents/:id/resolve", async (req, res) => {
    try {
      const { id } = req.params;
      const incRef = db.collection("macro_incidents").doc(id);
      
      const incDoc = await incRef.get();
      if (!incDoc.exists) return res.status(404).json({ error: "Not found" });
      
      const incData = incDoc.data();
      const tId = incData?.tenantId || "default";
      const ctoId = incData?.ctoId;
      
      await incRef.update({ status: "resolved", resolvedAt: new Date().toISOString() });
      
      try {
         const { cobraiQueue } = await import("./src/workers/cobraiWorker");
         if (cobraiQueue && cobraiQueue.add && ctoId) {
            const custSnap = await db.collection("customers")
                .where("tenantId", "==", tId)
                .where("cto_id", "==", ctoId)
                .get();
                
            for (const cust of custSnap.docs) {
               if (cust.data().status === "ativo") {
                  await cobraiQueue.add("incident_resolved", {
                      customerId: cust.id,
                      tenantId: tId,
                      cto_name: ctoId
                  }, { priority: 1, delay: 0 });
               }
               
               const ticketsSnap = await db.collection("tickets")
                    .where("tenantId", "==", tId)
                    .where("customerId", "==", cust.id)
                    .where("status", "==", "open")
                    .get();
               for (const ticketDoc of ticketsSnap.docs) {
                   await ticketDoc.ref.update({ status: "resolved", summary: "Fechado automaticamente: Serviço normalizado na região CTO " + ctoId });
               }
            }
         }
      } catch(err) {
         console.error("Erro dispatching incident notifications", err);
      }
      
      res.json({ status: "resolved", incidentId: id });
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/os", async (req, res) => {
    try {
      const { tenantId, ctoId, client, address, type } = req.body;
      const tId = tenantId || "default";
      
      const redisKey = `cluster_os:${tId}:${ctoId}`;
      const count = incrRedis(redisKey, 600); // 10 min TTL

      if (count >= 5) {
         // Não cria OS individual, aciona/checa incidente macro
         const incReq = await fetch(`http://localhost:${PORT}/api/incidents/macro`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: tId, ctoId, client })
         });
         const incResp = await incReq.json();
         return res.json({ clusterDetected: true, ...incResp });
      }

      // Se < 5, cria OS Individual
      const osRef = db.collection("service_orders");
      const doc = await osRef.add({
         tenantId: tId,
         ctoId,
         client,
         address,
         type,
         status: "pending",
         createdAt: new Date().toISOString()
      });

      return res.json({ clusterDetected: false, status: "created", osId: doc.id });
    } catch(e: any) {
       res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/os/optimize-route", async (req, res) => {
    try {
      const { technicianId, date, tenantId } = req.query;
      const tId = (tenantId as string) || "default";
      
      const osSnap = await db.collection("service_orders").where("tenantId", "==", tId).get();
      let oss = osSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      if (oss.length === 0) {
        oss = [
          { id: 'OS-1023', address: 'Av. Paulista 1000, Sao Paulo', status: 'pending', title: 'Instalacao', client: 'Joao' },
          { id: 'OS-1024', address: 'Rua Direita 10, Sao Paulo', status: 'pending', title: 'Reparo', client: 'Jose' },
          { id: 'OS-1025', address: 'Rua Oscar Freire 500, Sao Paulo', status: 'pending', title: 'Manutencao', client: 'Maria' }
        ];
      }
      
      for (const os of oss) {
        if (!os.lat || !os.lng) {
          try {
             const encoded = encodeURIComponent(os.address);
             const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`, {
                headers: { 'User-Agent': 'AstrumTechApp/1.0' }
             });
             const data = await resp.json();
             if (data && data.length > 0) {
                os.lat = parseFloat(data[0].lat);
                os.lng = parseFloat(data[0].lon);
             } else {
                os.lat = -23.5505; 
                os.lng = -46.6333;
             }
             await new Promise(r => setTimeout(r, 1000));
          } catch(e) {
             os.lat = -23.5505;
             os.lng = -46.6333;
          }
        }
      }
      
      let currentLat = -23.5505;
      let currentLng = -46.6333;
      
      let unvisited = [...oss];
      let route = [];
      let totalDistance = 0;
      
      const getDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
         const R = 6371; 
         const dLat = (lat2 - lat1) * Math.PI / 180;
         const dLon = (lon2 - lon1) * Math.PI / 180;
         const a = 
           Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
           Math.sin(dLon/2) * Math.sin(dLon/2); 
         const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
         return R * c;
      };
      
      while (unvisited.length > 0) {
         let nearestIdx = -1;
         let minDist = Infinity;
         
         for (let i = 0; i < unvisited.length; i++) {
           const dist = getDist(currentLat, currentLng, unvisited[i].lat, unvisited[i].lng);
           if (dist < minDist) {
             minDist = dist;
             nearestIdx = i;
           }
         }
         
         const nearest = unvisited[nearestIdx];
         route.push(nearest);
         totalDistance += minDist;
         currentLat = nearest.lat;
         currentLng = nearest.lng;
         unvisited.splice(nearestIdx, 1);
      }
      
      res.json({ route, totalDistance: Math.round(totalDistance * 10) / 10 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/health", async (req, res) => {
    const checks = {
      server: "ok",
      redis: "unknown",
      firestore: "unknown",
      workers: "unknown",
    };

    try {
      if (redis.ping) await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    try {
      await db.collection("tenants").limit(1).get();
      checks.firestore = "ok";
    } catch {
      checks.firestore = "error";
    }

    const workerCount = tenantQueues.size;
    checks.workers =
      workerCount > 0 ? `ok (${workerCount} tenants)` : "no_workers";

    const allOk = Object.values(checks).every(
      (v) => v === "ok" || v.startsWith("ok"),
    );
    res
      .status(allOk ? 200 : 503)
      .json({ status: allOk ? "healthy" : "degraded", checks });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: 24678 + Math.floor(Math.random() * 1000),
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info("worker_started", { data: { port: PORT } });
  });

  app.get("/api/webchat/config", async (req, res) => {
     try {
         const tenantId = req.query.tenantId as string;
         if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
         
         const snap = await db.collection("tenants").doc(tenantId).get();
         if (!snap.exists) return res.status(404).json({ error: "Tenant not found" });
         
         const data = snap.data() || {};
         res.json({
             primaryColor: data.primary_color || data.webchat?.primaryColor || "#0f172a",
             logoUrl: data.logo_url || data.webchat?.logoUrl || null,
             agentName: data.agent_name || data.webchat?.agentName || data.name || "Atendimento Online",
             welcomeMessage: data.welcome_message || data.webchat?.welcomeMessage || "Olá! Como posso te ajudar hoje?"
         });
     } catch (e: any) {
         res.status(500).json({ error: e.message });
     }
  });

  app.post("/api/webchat/message", express.json(), async (req, res) => {
     try {
         const { tenantId, sessionId, text, pushName } = req.body;
         if (!tenantId || !sessionId || !text) {
             return res.status(400).json({ error: "Faltam parâmetros obrigatórios" });
         }
         
         const { getTenantQueue } = await import("./src/lib/queue");
         const queue = getTenantQueue(tenantId);
         
         const remoteJid = `webchat_${sessionId}`;
         const payload = {
             source: "webchat",
             messageId: `webchat_${Date.now()}`,
             remoteJid,
             pushName: pushName || "Visitante",
             message: {
                 conversation: text
             },
             sender: sessionId,
         };

         await queue.add("process-message", payload, {
             jobId: payload.messageId
         });

         const { default: redis } = await import("./src/lib/redis");
         // Aguarda resposta da IA via long-polling (timeout 15s)
         const popRes = await redis.blpop(`webchat_response:${sessionId}`, 15);
         
         if (popRes) {
             const [_, responseText] = popRes;
             return res.json({ success: true, text: responseText });
         } else {
             return res.json({ success: true, text: null, timeout: true });
         }
      } catch (e: any) {
         logger.error("webchat_message_error", { error: e.message });
         return res.status(500).json({ error: "Internal server error" });
     }
  });

  // HSM Templates CRUD
  app.get("/api/hsm-templates", async (req, res) => {
    try {
      const tenantId = req.query.tenantId as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
      
      const snap = await db.collection("tenants").doc(tenantId).collection("hsm_templates").get();
      const templates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(templates);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/hsm-templates", express.json(), async (req, res) => {
    try {
      const { tenantId, name, category, language, header_type, header_content, body, footer, buttons } = req.body;
      if (!tenantId || !name || !category || !language || !body) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const now = new Date().toISOString();
      const newTemplate = {
        name,
        category, // MARKETING | UTILITY | AUTHENTICATION
        language, // pt_BR | en_US
        header_type: header_type || "none", // none | text | image | video
        header_content: header_content || "",
        body, // string with {{1}}, {{2}}...
        footer: footer || "",
        buttons: buttons || [], // array of {type, text, url|phone}
        status: "PENDING", // PENDING | APPROVED | REJECTED | PAUSED
        meta_template_id: "",
        created_at: now,
        updated_at: now,
      };

      const docRef = await db.collection("tenants").doc(tenantId).collection("hsm_templates").add(newTemplate);
      res.json({ id: docRef.id, ...newTemplate });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/hsm-templates/:id", express.json(), async (req, res) => {
    try {
      const templateId = req.params.id;
      const { tenantId, name, category, language, header_type, header_content, body, footer, buttons, status, meta_template_id } = req.body;
      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });

      const docRef = db.collection("tenants").doc(tenantId).collection("hsm_templates").doc(templateId);
      const snap = await docRef.get();
      
      if (!snap.exists) {
        return res.status(404).json({ error: "Template not found" });
      }

      const updates: any = {
        updated_at: new Date().toISOString(),
      };
      
      if (name !== undefined) updates.name = name;
      if (category !== undefined) updates.category = category;
      if (language !== undefined) updates.language = language;
      if (header_type !== undefined) updates.header_type = header_type;
      if (header_content !== undefined) updates.header_content = header_content;
      if (body !== undefined) updates.body = body;
      if (footer !== undefined) updates.footer = footer;
      if (buttons !== undefined) updates.buttons = buttons;
      if (status !== undefined) updates.status = status;
      if (meta_template_id !== undefined) updates.meta_template_id = meta_template_id;

      await docRef.update(updates);
      res.json({ id: templateId, ...snap.data(), ...updates });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/hsm-templates/:id", express.json(), async (req, res) => {
    try {
      const templateId = req.params.id;
      // Using query to simplify as we might need tenantId from body or query, but typically DELETE uses query or body for tenantId. Let's assume tenantId is passed in query.
      const tenantId = req.query.tenantId as string;
      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });

      const docRef = db.collection("tenants").doc(tenantId).collection("hsm_templates").doc(templateId);
      const snap = await docRef.get();
      
      if (!snap.exists) {
        return res.status(404).json({ error: "Template not found" });
      }

      const currentStatus = snap.data()?.status;
      if (currentStatus !== "PENDING" && currentStatus !== "REJECTED") {
        return res.status(400).json({ error: "Cannot delete template unless status is PENDING or REJECTED" });
      }

      await docRef.delete();
      res.json({ success: true, message: "Template deleted" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      logger.error("port_in_use", { error: err.message });
      // O sistema vai reiniciar automaticamente em breve
    } else {
      logger.error("server_fatal_error", { error: err.message });
    }
  });

  // Snapshot SaaS metrics every 24h
  setInterval(
    async () => {
      try {
        const { snapshotSaasMetrics } = await import("./src/lib/saasMetrics");
        await snapshotSaasMetrics();
      } catch (e) {
        console.error("Failed to run SaaS metrics job:", e);
      }
    },
    24 * 60 * 60 * 1000,
  );

  // Cron: Retenta automaticamente jobs da DLQ a cada 30 min
  setInterval(
    async () => {
      try {
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const dlqSnap = await db
          .collection("dead_letter_queue")
          .where("resolved", "==", false)
          .where("retry_count", "<", 5)
          .where("failed_at", "<", tenMinsAgo)
          .get();

        if (!dlqSnap.empty) {
          logger.info("dlq_auto_retry_start", {
            data: { count: dlqSnap.size },
          });
          const { getTenantQueue } = await import("./src/lib/queue.ts");

          for (const doc of dlqSnap.docs) {
            const data = doc.data();
            const tenantId = data.tenant_id;
            const type = data.type || "process_message";
            const queue = getTenantQueue(tenantId);
            await queue.add(type, data.payload);
            await doc.ref.update({
              resolved: true,
              resolved_at: new Date(),
            });
          }
        }
      } catch (error: any) {
        logger.error("dlq_auto_retry_error", { error: error.message });
      }
    },
    30 * 60 * 1000,
  );

  async function gracefulShutdown(signal: string) {
    logger.info("shutdown_initiated", { data: { signal } });

    // 1. Parar de aceitar novas requisições
    server.close(() => logger.info("http_server_closed"));

    // 2. Aguardar jobs em andamento terminarem (max 30s)
    const shutdownTimeout = setTimeout(() => {
      logger.warn("shutdown_timeout", { error: "Forcing shutdown after 30s" });
      process.exit(1);
    }, 30000);

    // 3. Fechar workers graciosamente
    for (const [tenantId, worker] of tenantWorkers.entries()) {
      await worker.close();
      logger.info("worker_closed", { tenant_id: tenantId });
    }

    clearTimeout(shutdownTimeout);
    logger.info("shutdown_complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer();
