import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import admin, { adminDb as db } from "../lib/firebaseAdmin.ts";
import { logger } from "../lib/logger.ts";
import type { Query } from '../lib/db-compat';

const router = express.Router();

// Rate limiter: 1000 requests per hour per IP (or we can key by API Key)
const apiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  keyGenerator: (req) => {
     return req.header("x-api-key") || ipKeyGenerator(req.ip || "unknown");
  },
  message: { error: "Too many requests, please try again later." },
});

// Authentication Middleware
const requireApiKey = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const apiKey = req.header("X-API-Key");
  if (!apiKey) {
    return res.status(401).json({ error: "X-API-Key header is missing" });
  }

  try {
    // API keys are usually stored in tenants/{tenantId}/api_keys/{keyDocId}
    // We can use a collectionGroup query to find it if we don't know the tenant, 
    // or if they are stored in a root collection. Let's see how they are structured.
    // The prompt says: (em tenants/{tenantId}/api_keys)
    // So we use collectionGroup:
    const apiKeysSnap = await db.collectionGroup("api_keys").where("key", "==", apiKey).limit(1).get();
    
    if (apiKeysSnap.empty) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    
    const keyDoc = apiKeysSnap.docs[0];
    const keyData = keyDoc.data();
    
    // The parent of an api_key doc should be the api_keys collection, and its parent should be the tenant doc
    const tenantRef = keyDoc.ref.parent.parent;
    if (!tenantRef) {
       return res.status(401).json({ error: "Invalid API Key context" });
    }
    
    if (keyData.active === false) {
       return res.status(403).json({ error: "API Key inactive" });
    }

    // Attach tenant info to request
    (req as any).tenantId = tenantRef.id;
    (req as any).apiKeyData = keyData;
    
    next();
  } catch (err) {
    logger.error("api_key_auth_error", { error: (err as Error).message });
    res.status(500).json({ error: "Internal Server Error during authentication" });
  }
};

router.use(apiRateLimiter);

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 */

/**
 * @swagger
 * /api/v1/tickets:
 *   get:
 *     summary: Obter tickets
 *     description: Retorna uma lista de tickets do tenant atual, com filtros opcionais.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtro por status (ex. open, resolved, closed)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Quantidade máxima de resultados
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset para paginação
 *     responses:
 *       200:
 *         description: Lista de tickets
 */
router.get("/tickets", requireApiKey, async (req, res) => {
  const tenantId = (req as any).tenantId;
  const { status, limit = "50", offset = "0" } = req.query;
  
  try {
    let q: Query = db.collection("tickets").where("tenantId", "==", tenantId);
    
    if (status) {
      q = q.where("status", "==", status);
    }
    
    q = q.orderBy("createdAt", "desc").limit(Number(limit) || 50);
    // Note: Firestore offset exists but has a cost. For simplicity we use offset()
    if (Number(offset) > 0) {
       q = q.offset(Number(offset));
    }
    
    const snap = await q.get();
    const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    res.json({ data: tickets, count: tickets.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/customers:
 *   get:
 *     summary: Obter clientes
 *     description: Retorna uma lista paginada de clientes do tenant.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Quantidade máxima de resultados
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset para paginação
 *     responses:
 *       200:
 *         description: Lista de clientes
 */
router.get("/customers", requireApiKey, async (req, res) => {
  const tenantId = (req as any).tenantId;
  const { limit = "50", offset = "0" } = req.query;
  
  try {
    let q: Query = db.collection("customers").where("tenantId", "==", tenantId);
    
    // Sort by createdAt usually
    q = q.orderBy("createdAt", "desc").limit(Number(limit) || 50);
    if (Number(offset) > 0) {
       q = q.offset(Number(offset));
    }
    
    const snap = await q.get();
    const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    res.json({ data: customers, count: customers.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/metrics/daily:
 *   get:
 *     summary: Obter métricas diárias
 *     description: Retorna métricas diárias, como tickets criados e resolvidos.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *         description: Data (YYYY-MM-DD), default é hoje
 *     responses:
 *       200:
 *         description: Métricas do dia
 */
router.get("/metrics/daily", requireApiKey, async (req, res) => {
  const tenantId = (req as any).tenantId;
  const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
  
  try {
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(`${dateStr}T23:59:59.999Z`);
    
    const snap = await db.collection("tickets")
      .where("tenantId", "==", tenantId)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get();
      
    let resolved = 0;
    let escalated = 0;
    snap.docs.forEach(d => {
       const s = d.data().status;
       if (s === "resolved" || s === "closed") resolved++;
       if (s === "escalated" || d.data().escalated) escalated++;
    });
    
    res.json({
       date: dateStr,
       total_tickets: snap.size,
       resolved,
       escalated,
       ai_handled: resolved
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/metrics/summary:
 *   get:
 *     summary: Obter resumo de métricas
 *     description: Retorna o total geral de métricas do tenant.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Resumo do tenant
 */
router.get("/metrics/summary", requireApiKey, async (req, res) => {
  const tenantId = (req as any).tenantId;
  try {
     // A fast way might be from a counters collection or aggregation
     // We will do a rough aggregate here if not available
     // Ideally we'd use AggregateQuery but for simplicity count() is enough
     const snap = await db.collection("tickets").where("tenantId", "==", tenantId).count().get();
     
     const customersCount = await db.collection("customers").where("tenantId", "==", tenantId).count().get();
     
     res.json({
        total_tickets: snap.data().count,
        total_customers: customersCount.data().count
     });
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

export default router;
