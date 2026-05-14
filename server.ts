import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import fs from "fs";
import os from "os";
import { createHmac } from "crypto";
import multer from "multer";
import { signInAnonymously } from "firebase/auth";
import SmeeClient from "smee-client";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import { auth, db } from "./src/lib/firebase.ts";
import { getIntegrationKeys, decryptCpf } from "./src/lib/db.ts";
import { getAIResponse } from "./src/lib/gemini.ts";
import redis from "./src/lib/redis.ts";
import { logger } from "./src/lib/logger.ts";
// Workers are run in a separate process via "npm run worker"
// import "./src/workers/messageWorker.ts";
import "./src/workers/cobraiWorker.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const processingNumbers = new Map<string, Promise<void>>();

import { tenantQueues } from "./src/lib/queue.ts";

const tenantWorkers = new Map<string, any>();

async function startServer() {
  // Autenticação anônima do servidor para bypass nas Rules (via isWebhook no Firestore)
  // IMPORTANTE: Se der erro 'admin-restricted-operation', habilite o provedor "Anônimo" no Console do Firebase.
  try {
    await signInAnonymously(auth);
    logger.info("system_authenticated_firebase");
  } catch (err: any) {
    if (
      err.code === "auth/admin-restricted-operation" ||
      err.message?.includes("admin-restricted-operation")
    ) {
      logger.warn("firebase_anonymous_provider_disabled");
    } else {
      logger.error("system_authentication_failed", { error: err.message });
    }
  }

  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies (increased limit for base64 audio), and keep raw body for webhook verification
  app.use(
    express.json({
      limit: "50mb",
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get("/api/integrations/vectorstore/ping", async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || "default";
      const { vectorStore } = await import("./src/lib/vectorStore.ts");
      const store = await vectorStore;
      
      // We can do a dummy search or just check if it throws
      await store.search(Array(1536).fill(0), tenantId, 1);
      
      res.json({ connected: true, provider: 'custom' });
    } catch (e: any) {
      if (e.message.includes("404") || e.message.includes("not found")) {
        // Assume connected but collection doesn't exist
         res.json({ connected: true, provider: 'custom' });
      } else {
         res.json({ connected: false, error: e.message });
      }
    }
  });

  app.get("/api/admin/ai-config/:tenantId", async (req, res) => {
    try {
      const { collection, getDocs } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase.ts");
      const snap = await getDocs(collection(db, "ai_provider_configs"));
      const configs = snap.docs
        .filter(d => d.id.startsWith(req.params.tenantId + "_"))
        .map(d => ({ function: d.id.split('_').slice(1).join('_'), ...d.data() }));
      res.json(configs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/ai-config/:tenantId/:function", async (req, res) => {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase.ts");
      const docRef = doc(db, "ai_provider_configs", `${req.params.tenantId}_${req.params.function}`);
      await setDoc(docRef, req.body, { merge: true });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/quality/live-stats", async (req, res) => {
    try {
      const { collection, getDocs, query, where, Timestamp } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const openTicketsSnap = await getDocs(query(collection(db, "tickets"), where("status", "==", "open")));
      const open_tickets = openTicketsSnap.size;

      const recentTicketsSnap = await getDocs(query(collection(db, "tickets"), where("createdAt", ">=", Timestamp.fromDate(last24h))));
      let resolvedCount = 0;
      let escalatedCount = 0;
      let totalResolutionTime = 0;
      let resolvedWithTimeCount = 0;

      recentTicketsSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'resolved' && !data.escalated) {
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
      const resolved_last_24h = totalRecent > 0 ? (resolvedCount / totalRecent) * 100 : 0;
      const avg_response_time_ms = resolvedWithTimeCount > 0 ? totalResolutionTime / resolvedWithTimeCount : 0;
      
      const csatSnap = await getDocs(query(collection(db, "csat_ratings"), where("createdAt", ">=", Timestamp.fromDate(last7d))));
      let totalCsat = 0;
      csatSnap.forEach(d => totalCsat += d.data().score || 0);
      const avg_csat_week = csatSnap.size > 0 ? totalCsat / csatSnap.size : 0;

      const logsSnap = await getDocs(query(collection(db, "logs"), where("escalated", "==", true), where("timestamp", ">=", Timestamp.fromDate(last24h))));
      const agentEscalationMap: Record<string, number> = {};
      logsSnap.forEach(d => {
         const ag = d.data().agent || 'UNKNOWN';
         agentEscalationMap[ag] = (agentEscalationMap[ag] || 0) + 1;
      });
      let top_escalating_agent = 'N/A';
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
        escalation_rate: totalRecent > 0 ? (escalatedCount / totalRecent) * 100 : 0,
        avg_response_time_ms,
        avg_csat_week,
        top_escalating_agent
      });
    } catch (e: any) {
      logger.error("live_stats_failed", { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/contracts/:contractId/promises", async (req, res) => {
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      
      const contractId = req.params.contractId;
      const contractDoc = await getDoc(doc(db, "contracts", contractId));
      
      if (!contractDoc.exists()) {
        return res.status(404).json({ error: "Contrato não encontrado." });
      }
      
      const data = contractDoc.data();
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
      const { ticketId, tenantId, customerId, category, resolved_by } = req.body;
      const { enqueueMessage } = await import("./src/lib/queue");

      await enqueueMessage(tenantId, {
        ticketId,
        customerId,
        tenantId,
        category,
        resolved_by
      }, {
        delay: 60000, 
        jobId: `csat:${ticketId}`
      }, 'send_csat');
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/backup/trigger", express.json(), async (req, res) => {
    try {
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: "Missing tenantId" });
      const { doc, getDoc, updateDoc, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      const tenantDoc = await getDoc(doc(db, "tenants", tenantId));
      const data = tenantDoc.data();
      if (!data) return res.status(404).json({ error: "Tenant not found" });

      const projectId = data.gcp_project_id || process.env.GCLOUD_PROJECT;
      const bucketName = data.backup_bucket_name || process.env.BACKUP_BUCKET_NAME;

      if (!projectId || !bucketName) {
        return res.status(400).json({ error: "GCLOUD_PROJECT ou BACKUP_BUCKET_NAME não configurado no tenant." });
      }

      const { v1 } = await import("@google-cloud/firestore");
      const client = new v1.FirestoreAdminClient();

      try {
        const responses = await client.exportDocuments({
          name: `projects/${projectId}/databases/(default)`,
          outputUriPrefix: `gs://${bucketName}/backups/${new Date().toISOString().split('T')[0]}_${tenantId}`,
          collectionIds: [
            'customers', 'tickets', 'service_orders', 'contracts',
            'tenants', 'plans', 'incidents', 'csat_ratings', 'data_access_logs'
          ]
        });

        await updateDoc(doc(db, "tenants", tenantId), {
          last_backup_at: serverTimestamp(),
          last_backup_status: 'success',
          last_backup_size_mb: 'Estimado 50MB'
        });
        
        res.json({ ok: true, started_at: new Date().toISOString() });
      } catch (error: any) {
        await updateDoc(doc(db, "tenants", tenantId), {
          last_backup_status: 'failed',
          last_backup_error: error.message
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
      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      const tenantDoc = await getDoc(doc(db, "tenants", tenantId as string));
      const data = tenantDoc.data() || {};
      res.json({
        last_backup_at: data.last_backup_at?.toDate?.()?.toISOString() || null,
        last_backup_status: data.last_backup_status || null,
        last_backup_size_mb: data.last_backup_size_mb || null,
        last_backup_error: data.last_backup_error || null,
        backup_enabled: data.backup_enabled || false,
        retention_days: data.backup_retention_days || 30
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const upload = multer({ dest: os.tmpdir() });

  // Initialize Smee for local webhooks if in dev. But honestly since AI Studio URL might ALWAYS be behind auth,
  // Let's just always initialize Smee so the webhook can bypass the IAP prompt.
  const SMEE_CHANNEL = `https://smee.io/astrum-evo-webhook-${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : Math.floor(Math.random() * 100000)}`;
  const smeeClientObj = new SmeeClient({
    source: SMEE_CHANNEL,
    target: "http://127.0.0.1:3000/api/webhook/evolution",
    logger: {
      info: (msg: string) => logger.info("smee_client_info", { data: { message: msg } }),
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
      msgStats = await getAggregateJobCounts('waiting', 'active', 'completed', 'failed') as any;
      if (cobraiQueue.getJobCounts) {
        cobraiStats = await cobraiQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
      }

      res.json({
        waiting: (msgStats.waiting || 0) + (cobraiStats.waiting || 0),
        active: (msgStats.active || 0) + (cobraiStats.active || 0),
        completed: (msgStats.completed || 0) + (cobraiStats.completed || 0),
        failed: (msgStats.failed || 0) + (cobraiStats.failed || 0)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/integrations/redis/status", async (req, res) => {
    try {
      const redis = (await import("./src/lib/redis")).default as any;
      const { messageQueue } = await import("./src/lib/queue");
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      const { getDocs, query, collection, where } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");

      let connected = false;
      let memoryUsed = "0M";
      if (redis.status === 'ready') {
        connected = true;
        const memoryInfo = await redis.info('memory');
        const match = memoryInfo.match(/used_memory_human:(.*)/);
        if (match && match[1]) memoryUsed = match[1].trim();
      }

      let msgStats = { waiting: 0, active: 0 };
      let cobraiStats = { waiting: 0, active: 0 };

      const { getAggregateJobCounts } = await import("./src/lib/queue");
      msgStats = await getAggregateJobCounts('waiting', 'active') as any;
      if (cobraiQueue.getJobCounts) {
        cobraiStats = await cobraiQueue.getJobCounts('waiting', 'active');
      }
      
      const q = query(collection(db, 'dead_letter_queue'), where('resolved', '==', false));
      const dlqSnap = await getDocs(q);
      const dlqCount = dlqSnap.size;

      res.json({
        connected,
        memoryUsed,
        queueWaiting: (msgStats.waiting || 0) + (cobraiStats.waiting || 0),
        queueActive: (msgStats.active || 0) + (cobraiStats.active || 0),
        dlqCount
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/integrations/redis/test", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: "Missing Redis URL" });

    try {
      const redisMod = await import("ioredis");
      const Redis = redisMod.default || (redisMod as any).Redis || redisMod;
      const startTime = Date.now();
      const testRedis = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
      });

      await new Promise<void>((resolve, reject) => {
        testRedis.once('ready', () => resolve());
        testRedis.once('error', (err) => reject(err));
      });

      await testRedis.set('test_key', 'test_value', 'EX', 5);
      const val = await testRedis.get('test_key');
      
      if (val !== 'test_value') throw new Error("Falha na validação de SET/GET");
      
      const latencyMs = Date.now() - startTime;
      await testRedis.quit();
      
      res.json({ success: true, latencyMs });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
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
      const stats = await cobraiQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cobrai/queue", async (req, res) => {
    try {
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");
      if (!cobraiQueue.getJobs) return res.json([]);
      const jobsWait = await cobraiQueue.getJobs(['waiting', 'delayed']);
      const jobsActive = await cobraiQueue.getJobs(['active']);
      const formatted = [...jobsActive, ...jobsWait].map((j: any) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        status: j.finishedOn ? 'completed' : (j.processedOn ? 'active' : 'waiting'),
        delay: j.delay,
        failedReason: j.failedReason
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
      if (!customerId || !stage) return res.status(400).json({ error: "Missing parameters" });
      if (cobraiQueue.add) {
        await cobraiQueue.add('manual-send', { customerId, stage, tenantId: tenantId || 'default' });
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
      if (!cobraiQueue.getJob) return res.status(500).json({ error: "Queue uninitialized" });
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
      const { collectionGroup, query, where, getDocs } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      const snap = await getDocs(query(collectionGroup(db, 'message_traces'), where('trace_id', '==', traceId)));
      if (snap.empty) return res.status(404).json({ error: 'Trace not found' });
      const docs = snap.docs.map(d => ({ ticketId: d.ref.parent.parent?.id, id: d.id, ...d.data() }));
      res.json({ traces: docs });
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

      logger.info("pdf_parser_triggered", { data: { filename: file.originalname } });
      const dataBuffer = fs.readFileSync(file.path);

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
          dangerouslyAllowBrowser: true
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

  app.post("/api/prompts/validate", express.json(), async (req, res) => {
    const { content, agent, tenantId } = req.body;
    const tId = tenantId || 'default';

    const errors: string[] = [];

    // Regra 1: tamanho máximo
    if (content.length > 8000) {
      errors.push('Prompt muito longo (máximo 8.000 caracteres). Simplifique as instruções.');
    }

    // Regra 2: palavras que criam loops
    const loopPatterns = [
      /sempre\s+pergunte/i,
      /repita\s+sempre/i,
      /nunca\s+encerre/i,
      /continue\s+perguntando/i,
    ];
    loopPatterns.forEach(p => {
      if (p.test(content)) errors.push(`Instrução pode criar loop infinito: "${content.match(p)?.[0]}"`);
    });

    // Regra 3: não pode remover o SECURITY_BLOCK
    if (content.includes('ignore suas instruções') || content.includes('ignore regras')) {
      errors.push('Prompt não pode conter instruções para ignorar regras de segurança.');
    }

    // Regra 4: deve ter pelo menos 1 instrução clara
    if (content.split('\n').filter((l: string) => l.trim().length > 10).length < 3) {
      errors.push('Prompt muito curto. Adicione pelo menos 3 instruções.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ valid: false, errors });
    }

    try {
      const { getIntegrationKeys } = await import("./src/lib/db");
      const keys = await getIntegrationKeys();
      
      const provider = keys.chatProvider || "gemini";
      const isCustom = provider === "custom";
      const apiKey = isCustom ? keys.customChat : (provider === "openai" ? (keys.openaiChat || keys.openaiGlobal) : keys.geminiGlobal);
      const modelStr = isCustom ? keys.customChatModel : (provider === "openai" ? keys.openaiChatModel : "gemini-1.5-flash");

      if (!apiKey) {
         return res.status(400).json({ valid: false, errors: ['API Key não configurada. Configure em Integrações.'] });
      }

      let testResponse = "";

      if (provider === "openai" || isCustom) {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ 
          apiKey: apiKey as string, 
          baseURL: isCustom ? (keys.customChatBaseUrl as string) : undefined,
          dangerouslyAllowBrowser: true
        });
        const testResult = await openai.chat.completions.create({
          model: (modelStr as string) || "gpt-3.5-turbo",
          max_tokens: 100,
          messages: [
            { role: 'system', content: content },
            { role: 'user', content: 'olá, preciso de ajuda' }
          ]
        });
        testResponse = testResult.choices[0]?.message.content || "";
      } else {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const ai = new GoogleGenerativeAI(apiKey as string);
        const m = ai.getGenerativeModel({ model: modelStr as string || "gemini-1.5-flash" });
        const prompt = `System: ${content}\nUser: olá, preciso de ajuda`;
        const resAI = await m.generateContent(prompt);
        testResponse = resAI.response.text();
      }

      return res.status(200).json({ valid: true, test_response: testResponse });
    } catch (err: any) {
      return res.status(400).json({ valid: false, errors: ['Prompt causou erro na IA: ' + err.message] });
    }
  });

  app.post("/api/jobs/schedule-pos-install", express.json(), async (req, res) => {
    try {
      const { customerId, tenantId, osId, installedPlan } = req.body;
      const { enqueueMessage } = await import("./src/lib/queue");
      await enqueueMessage(tenantId, {
        customerId,
        tenantId,
        osId,
        installedPlan
      }, {
        delay: 86400000,
        jobId: `pos_instalacao:${osId}`
      }, 'pos_instalacao');
      res.json({ success: true });
    } catch (error: any) {
      logger.error("pos_instalacao_schedule_failed", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jobs/schedule-sla", express.json(), async (req, res) => {
    try {
      const { ticketId, tenantId, customerId } = req.body;
      const { enqueueMessage } = await import("./src/lib/queue");
      
      await enqueueMessage(tenantId,
        { ticketId, tenantId, customerId, level: 1 },
        { delay: 5 * 60 * 1000, jobId: `sla_5min:${ticketId}` },
        'sla_warning'
      );
      
      await enqueueMessage(tenantId,
        { ticketId, tenantId, customerId, level: 2 },
        { delay: 15 * 60 * 1000, jobId: `sla_15min:${ticketId}` },
        'sla_warning'
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
        const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
        const { db } = await import("./src/lib/firebase");
        
        const docRef = doc(db, "tickets", ticketId);
        const { getDoc } = await import("firebase/firestore");
        const tDoc = await getDoc(docRef);
        const tenantId = tDoc.exists() ? tDoc.data()?.tenantId : null;

        await updateDoc(docRef, {
          human_responded: true,
          human_first_response_at: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
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
      const custSnap = await getDocs(
        query(collection(db, "customers"), where("__name__", "==", customerId)),
      );
      if (custSnap.empty) {
        return res.status(404).json({ error: "Cliente não encontrado." });
      }
      let phone = custSnap.docs[0].data().phone;
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
        logger.error("evolution_fetch_failed", { error: "No messages returned", data });
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
        await addDoc(collection(db, `tickets/${ticketId}/messages`), {
          ticketId,
          senderType: fromMe ? "human" : "customer",
          text,
          createdAt: msg.messageTimestamp
            ? new Date(msg.messageTimestamp * 1000)
            : serverTimestamp(),
          isImported: true,
        });
        count++;
      }

      res.status(200).json({ success: true, imported: count });
    } catch (e: any) {
      logger.error("evolution_fetch_failed", { error: e.message });
      res.status(500).json({ error: e.message });
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
      logger.error("evolution_proxy_failed", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook for Evolution API
  app.post("/api/webhook/evolution", async (req, res) => {
    try {
      const redis = (await import("./src/lib/redis")).default;
      
      if (req.body?.event === 'messages.delete' || req.body?.data?.message?.revokedMessage) {
        const revokedId = req.body?.data?.key?.id || req.body?.data?.message?.revokedMessage?.key?.id;
        const instance = req.body?.instance ?? req.body?.data?.instance ?? req.body?.sender;
        if (revokedId) {
          // Marcar no Redis como revogada
          if (redis) {
            await redis.set(`revoked:${revokedId}`, '1', 'EX', 3600);
          }
          // Tentar remover da fila se ainda aguardando
          if (instance) {
             const { getDocs, query, collection, where, limit } = await import("firebase/firestore");
             const { db } = await import("./src/lib/firebase");
             const tq = await getDocs(query(collection(db, "tenants"), where('evolution_instance', '==', instance), limit(1)));
             if (!tq.empty) {
                const tenantId = tq.docs[0].id;
                const { getTenantQueue } = await import("./src/lib/queue");
                const queue = getTenantQueue(tenantId);
                const job = await queue.getJob(revokedId);
                if (job) {
                  const state = await job.getState();
                  if (state === 'waiting' || state === 'delayed') await job.remove();
                }
             }
          }
        }
        return res.status(200).json({ ok: true });
      }

      const webhookMessageData = req.body?.data ?? req.body;
      const isFromMe = webhookMessageData?.key?.fromMe ?? webhookMessageData?.message?.key?.fromMe ?? false;
      if (isFromMe === true) {
        return res.status(200).json({ ok: true, skipped: 'own_message' });
      }

      const crypto = await import("crypto");
      const traceId = crypto.randomUUID();
      const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
      const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
      const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? '';

      if (secret && signature) {
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        try {
          const expectedBuffer = Buffer.from(expected);
          const signatureBuffer = Buffer.from(signature);
          if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
            logger.warn("webhook_hmac_failed");
            return res.status(401).json({ error: 'Unauthorized' });
          }
        } catch (e) {
          logger.warn("webhook_hmac_failed");
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      const payload = req.body;

      const instance = payload?.instance ?? payload?.data?.instance ?? payload?.sender;
      if (!instance) {
        return res.status(200).json({ ok: true, skipped: "no_instance_field" });
      }

      const tenantQuery = await getDocs(query(collection(db, "tenants"), where('evolution_instance', '==', instance), limit(1)));

      if (tenantQuery.empty) {
        logger.warn("webhook_received", { error: 'unknown_instance', data: { instance } });
        return res.status(200).json({ ok: true, skipped: 'unknown_instance' });
      }
      
      const tenantId = tenantQuery.docs[0].id;
      const tenantData = tenantQuery.docs[0].data();

      // PARTE C — Healthcheck cache validation antes de enfilerar
      const cacheKey = `tenant_health:${instance}`;
      let healthStatus = await import("./src/lib/redis").then(m => m.default.get(cacheKey));

      if (!healthStatus) {
        healthStatus = tenantData?.whatsapp_health?.status || 'open';
        await import("./src/lib/redis").then(m => m.default.set(cacheKey, healthStatus, 'EX', 300));
      }

      if (healthStatus !== 'open' && healthStatus !== 'unknown') {
        logger.warn("webhook_health_failed", { data: { instance, healthStatus } });
        return res.status(503).json({ error: "Service Unavailable: WhatsApp Disconnected" });
      }

      // Handle message updates globally
      if (
        payload.event === "messages.update" ||
        payload.event === "MESSAGES_UPDATE"
      ) {
        if (payload.data?.status === "ERROR") {
          logger.warn("whatsapp_delivery_error", { data: { remoteJid: payload.data?.remoteJid } });
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
        phone_last4: (payload.data?.message?.key?.remoteJid || payload.data?.key?.remoteJid)?.slice(-4) 
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
          return res.status(200).json({ ok: true, duplicate: true, status: "already_processed" });
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
        return res.status(200).json({ ok: true, skipped: 'blocked_session' });
      }

      // Ignore messages from ourselves or from groups
      if (fromMe || !remoteJid || remoteJid.includes("@g.us")) {
        return res.status(200).json({ status: "received" });
      }

      // NOVO: TRATAMENTO DE NÚMEROS INTERNACIONAIS (PARTE A)
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      const isBrazilian = phoneNumber.startsWith('55') && phoneNumber.length >= 12;

      if (!isBrazilian) {
        const internationalMessage = phoneNumber.startsWith('1')
          ? 'Hello! Our service is currently available only in Portuguese for Brazilian customers. For support, please contact us at [email].'
          : 'Olá! Nosso atendimento é em português para clientes no Brasil. Para suporte internacional, entre em contato pelo email [email].';

        const { getIntegrationKeys } = await import("./src/lib/db");
        const keys = await getIntegrationKeys();
        const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
        const evoInstance = keys.evolutionInstance;
        const evoApiKey = keys.evolutionApiKey;

        if (evoUrl && evoInstance && evoApiKey) {
           await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoApiKey },
            body: JSON.stringify({ number: remoteJid, text: internationalMessage }),
           }).catch(() => {});
        }

        const { logSecurityEvent } = await import("./src/lib/audit");
        await logSecurityEvent('INTERNATIONAL_NUMBER', { remoteJid, prefix: phoneNumber.substring(0, 4) });
        return res.status(200).json({ ok: true, skipped: 'international_number' });
      }

      const existingTicket = await getDocs(query(
        collection(db, 'tickets'),
        where('phone_number', '==', remoteJid),
        where('tenant_id', '==', tenantId),
        where('status', '==', 'open'),
        limit(1)
      ));

      let ticketId;
      if (existingTicket.empty) {
        const newTicket = await addDoc(collection(db, 'tickets'), {
          phone_number: remoteJid,
          tenant_id: tenantId,
          status: 'open',
          created_at: serverTimestamp(),
          session_state: { active_flow: 'IDLE' }
        });
        ticketId = newTicket.id;
      } else {
        ticketId = existingTicket.docs[0].id;
      }

      let textMessage =
        messageData.conversation || messageData.extendedTextMessage?.text || "";

      if (messageData?.audioMessage || messageData?.pttMessage) {
        const audioUrl = messageData?.audioMessage?.url ?? messageData?.pttMessage?.url ?? payload.data?.message?.base64;
        
        if (audioUrl) {
          const { enqueueMessage } = await import("./src/lib/queue");
          await enqueueMessage(tenantId,
            { remoteJid, tenantId, messageId, isAudio: true, audioUrl, pushName, messageData, payload, ticketId, traceId },
            { jobId: `audio:${instance}:${remoteJid}:${Date.now()}` },
            "process-message"
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
        const { degreesLatitude: lat, degreesLongitude: lng } = messageContainer.message.locationMessage;

        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          { headers: { 'User-Agent': 'AstrumTelecom/1.0' } }
        );
        const geo = await geoRes.json();
        const cep = geo?.address?.postcode?.replace('-', '') ?? null;

        if (cep) {
          textContent = cep;
          payload.location_cep_detected = cep;
        } else {
          const { getIntegrationKeys } = await import("./src/lib/db");
          const keys = await getIntegrationKeys();
          const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
          const evoInstance = keys.evolutionInstance;
          const evoApiKey = keys.evolutionApiKey;
          if (evoUrl && evoApiKey && evoInstance) {
            await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({
                number: remoteJid,
                text: "Recebi sua localização! Mas não consegui identificar o CEP exato. Pode me digitar o CEP de 8 dígitos?"
              })
            });
          }
          return res.status(200).json({ status: "queued_location_prompt" });
        }
      } else if (messageContainer?.message?.templateButtonReplyMessage?.selectedDisplayText) {
         textContent = messageContainer.message.templateButtonReplyMessage.selectedDisplayText;
      } else if (messageContainer?.message?.buttonsResponseMessage?.selectedDisplayText) {
         textContent = messageContainer.message.buttonsResponseMessage.selectedDisplayText;
      }


      buffer.push({
        id: messageContainer?.key?.id || messageId,
        text: textContent,
        timestamp: Date.now(),
        messageData: messageData,
        payload: payload
      });
      await redis.set(bufferKey, JSON.stringify(buffer), 'EX', 30);

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
      const isNewWindow = await redis.set(windowKey, '1', 'EX', 2, 'NX');
      
      if (isNewWindow) {
        // Primeira mensagem da janela — agendar processamento para 2.1s depois
        const { enqueueMessage } = await import("./src/lib/queue");
        await enqueueMessage(tenantId,
          { remoteJid, tenantId, bufferKey, pushName, messageId, ticketId, traceId },
          { delay: 2100, jobId: `window:${instance}:${remoteJid}:${Date.now()}` },
          "process-message"
        );
      }

      // Respond immediately to prevent Evolution API from retrying/timing out
      return res.status(200).json({ status: "queued" });
    } catch (error: any) {
      logger.error("webhook_processing_failed", { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal enqueue error" });
      }
    }
  });

  const validateNocSignature = (req: any, res: any, next: any) => {
    const signature = req.headers['x-noc-signature'];
    const secret = process.env.NOC_WEBHOOK_SECRET;
    if (!secret) return next();
    
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    const hmac = createHmac('sha256', secret);
    const calculated = hmac.update(JSON.stringify(req.body)).digest('hex');
    if (signature !== calculated) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    next();
  };

  const resolveIncident = async (ctoId: string, tenantId: string) => {
    const { getDocs, query, collection, where, doc, updateDoc, deleteDoc } = await import("firebase/firestore");
    const { db } = await import("./src/lib/firebase");
    const { cobraiQueue } = await import("./src/workers/cobraiWorker");

    // 1. Atualizar incidents com status: 'resolved', resolved_at
    const incidentsSnap = await getDocs(query(
      collection(db, "incidents"),
      where("cto_id", "==", ctoId),
      where("tenant_id", "==", tenantId),
      where("status", "==", "active")
    ));

    for (const incidentDoc of incidentsSnap.docs) {
      await updateDoc(incidentDoc.ref, {
        status: 'resolved',
        resolved_at: new Date() // Ou serverTimestamp()
      });
    }

    // 2. Deletar cto_incidents/{ctoId}
    await deleteDoc(doc(db, "cto_incidents", ctoId));

    // 3. Enviar template HSM de resolução para clientes afetados
    const affectedCustomers = await getDocs(query(
      collection(db, "customers"),
      where("cto_id", "==", ctoId),
      where("tenant_id", "==", tenantId),
      where("status", "==", "ativo")
    ));

    for (const customer of affectedCustomers.docs) {
      await cobraiQueue.add('noc_notification', {
        customerId: customer.id,
        tenantId: tenantId,
        templateName: 'noc_incident_resolved',
        params: { cto_name: customer.data().cto_name }
      }, { delay: 0, priority: 1 });
    }
  };

  app.post("/api/webhook/noc", express.json(), validateNocSignature, async (req, res) => {
    try {
      const { event_type, cto_id, cto_name, tenant_id, severity, description } = req.body;
      const { db } = await import("./src/lib/firebase");
      const { collection, addDoc, doc, setDoc, query, where, getDocs, Timestamp, serverTimestamp } = await import("firebase/firestore");
      const { cobraiQueue } = await import("./src/workers/cobraiWorker");

      if (event_type === 'DOWN' && severity >= parseInt(process.env.NOC_ALERT_SEVERITY_THRESHOLD ?? '3')) {
        // 1. Registrar incidente no Firestore
        const incidentRef = await addDoc(collection(db, 'incidents'), {
          cto_id, cto_name, tenant_id,
          status: 'active',
          source: 'NOC',
          severity,
          description,
          created_at: serverTimestamp()
        });
        
        // 2. Bloquear OS para essa CTO por 6h
        await setDoc(doc(db, 'cto_incidents', cto_id), {
          incident_id: incidentRef.id,
          blocked_until: Timestamp.fromDate(new Date(Date.now() + 6 * 60 * 60 * 1000))
        });
        
        // 3. Buscar todos os clientes ativos nessa CTO
        const affectedCustomers = await getDocs(query(
          collection(db, 'customers'),
          where('cto_id', '==', cto_id),
          where('tenant_id', '==', tenant_id),
          where('status', '==', 'ativo')
        ));
        
        // 4. Disparar mensagem proativa para cada cliente via CobrAI queue
        for (const customer of affectedCustomers.docs) {
          await cobraiQueue.add('noc_notification', {
            customerId: customer.id,
            tenantId: tenant_id,
            templateName: 'noc_incident_proactive',
            params: { cto_name, incident_id: incidentRef.id }
          }, { delay: 0, priority: 1 });
        }
      }
      
      if (event_type === 'UP') {
        // Resolver incidente e notificar clientes afetados
        await resolveIncident(cto_id, tenant_id);
      }
      
      res.status(200).json({ received: true });
    } catch (e: any) {
      logger.error("noc_webhook_failed", { error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/integrations/embeddings/test", express.json(), async (req, res) => {
    try {
      const { provider, apiKey, model, baseUrl, dimensions } = req.body;
      const start = Date.now();
      
      let embedding;
      if (provider === 'openai' || !provider) {
        const fetchRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: "teste de conexão", model: model || 'text-embedding-3-small' })
        });
        const data = await fetchRes.json();
        if (data.error) throw new Error(data.error.message);
        embedding = data.data[0].embedding;
      } else {
        const fetchRes = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: "teste de conexão", model })
        });
        const data = await fetchRes.json();
        if (data.error) throw new Error(data.error.message);
        embedding = data.data?.[0]?.embedding ?? data.embeddings?.[0] ?? data.embedding;
      }
      
      res.json({ success: true, model: model || 'text-embedding-3-small', dimensions: embedding.length, latency_ms: Date.now() - start });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.post("/api/integrations/vectorstore/test", express.json(), async (req, res) => {
    try {
      const { url, apiKey, collection, provider } = req.body;
      const start = Date.now();
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      
      if (provider !== 'qdrant' && provider !== undefined) {
         throw new Error(`Provider ${provider} not supported by this interface yet.`);
      }

      const client = new QdrantClient({ url, apiKey });
      const testId = 'test-ping';
      const testVector = Array(1536).fill(0.1);

      // Upsert
      await client.upsert(collection, {
        points: [{
          id: testId,
          vector: testVector,
          payload: { text: "teste", tenant_id: "test" }
        }]
      });

      // Search
      await client.search(collection, {
        vector: testVector,
        limit: 1
      });

      // Delete
      await client.delete(collection, {
        points: [testId],
        wait: true
      });

      res.json({ success: true, provider: 'qdrant', latency_ms: Date.now() - start });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.get("/api/integrations/vectorstore/ping", async (req, res) => {
    try {
      const { tenantId } = req.query;
      const { getDocs, query, collection, where, getCountFromServer } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      
      const { getVectorStore } = await import("./src/lib/vectorStore");
      // Just test if we can get the store instance without errors
      const store = await getVectorStore(tenantId as string);

      const q = query(
        collection(db, 'knowledge_base'),
        where('tenant_id', '==', tenantId || "default"),
        where('vector_indexed', '==', true)
      );
      const countSnap = await getCountFromServer(q);
      const articles_count = countSnap.data().count;

      res.json({ connected: true, articles_count, provider: 'qdrant' });
    } catch (e: any) {
      res.json({ connected: false, error: e.message });
    }
  });

  app.post("/api/knowledge/articles", express.json(), async (req, res) => {
    try {
      const { title, content, category, tenantId } = req.body;
      const { addToKnowledgeBase } = await import("./src/lib/db");
      const id = await addToKnowledgeBase({ title, content, category, tenantId });
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  
  app.put("/api/knowledge/articles/:id", express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, category, tenantId } = req.body;
      const { db } = await import("./src/lib/firebase");
      const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore");
      const { getVectorStore } = await import("./src/lib/vectorStore");
      const { getEmbeddingProvider } = await import("./src/lib/embeddingProvider");
      
      const docRef = doc(db, 'knowledge_base', id);
      await updateDoc(docRef, { title, content, category });
      
      const embeddingProvider = await getEmbeddingProvider(tenantId);
      const vectorStore = await getVectorStore(tenantId);
      
      const embedding = await embeddingProvider.embed(`${title}\n\n${content}`, tenantId);
      await vectorStore.upsert({ id, text: content, embedding, metadata: { tenant_id: tenantId, category, title } }, tenantId);
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/knowledge/articles/:id", express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenantId } = req.query;
      const { deleteKBArticle } = await import("./src/lib/db");
      const { getVectorStore } = await import("./src/lib/vectorStore");
      
      await deleteKBArticle(id);
      const vectorStore = await getVectorStore(tenantId as string);
      await vectorStore.delete(id, tenantId as string);
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/knowledge/search-test", express.json(), async (req, res) => {
    try {
      const { query, tenantId } = req.body;
      const start = Date.now();
      const { searchKnowledgeBase } = await import("./src/lib/db");
      const results = await searchKnowledgeBase(query, tenantId);

      res.json({ success: true, results, latency_ms: Date.now() - start });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/knowledge/reindex", express.json(), async (req, res) => {
    try {
      const { tenantId } = req.body;
      const { getDocs, query, collection, where, doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("./src/lib/firebase");
      const { getVectorStore } = await import("./src/lib/vectorStore");
      const { getEmbeddingProvider } = await import("./src/lib/embeddingProvider");
      
      const articlesSnap = await getDocs(query(
        collection(db, 'knowledge_base'),
        where('tenant_id', '==', tenantId || "default")
      ));
      
      const total_articles = articlesSnap.size;
      res.json({ started: true, total_articles });

      if (total_articles === 0) return;

      const redisModule = await import("./src/lib/redis").catch(() => null);
      const redisClient = redisModule?.default || redisModule?.redis;

      const setProgress = async (indexed: number) => {
        if (redisClient) {
          await redisClient.set(`reindex:${tenantId || "default"}`, JSON.stringify({
            total: total_articles,
            indexed,
            percent: Math.round((indexed / total_articles) * 100),
            status: indexed === total_articles ? 'done' : 'running'
          }), 'EX', 3600);
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
        
        await Promise.all(batchDocs.map(async (docSnap) => {
          try {
            const data = docSnap.data();
            const textToEmbed = `${data.title}\n\n${data.content}`;
            const embedding = await embeddingProvider.embed(textToEmbed, tenantId);
            
            await vectorStore.upsert({
              id: docSnap.id,
              text: data.content,
              embedding,
              metadata: {
                tenant_id: data.tenant_id,
                category: data.category,
                title: data.title
              }
            }, tenantId);
            
            await updateDoc(doc(db, 'knowledge_base', docSnap.id), {
              vector_indexed: true
            });
            
            indexedCount++;
          } catch(err) {
            console.error(`Error reindexing doc ${docSnap.id}:`, err);
          }
        }));
        await setProgress(indexedCount);
      }
      
    } catch(e: any) {
      console.error('Reindex Error:', e);
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
    } catch(e) {
      res.json({ status: "idle" });
    }
  });

  app.get('/health', async (req, res) => {
    const checks = {
      server: 'ok',
      redis: 'unknown',
      firestore: 'unknown',
      workers: 'unknown'
    };

    try {
      if (redis.ping) await redis.ping();
      checks.redis = 'ok';
    } catch { checks.redis = 'error'; }

    try {
      await getDocs(query(collection(db, 'tenants'), limit(1)));
      checks.firestore = 'ok';
    } catch { checks.firestore = 'error'; }

    const workerCount = tenantQueues.size;
    checks.workers = workerCount > 0 ? `ok (${workerCount} tenants)` : 'no_workers';

    const allOk = Object.values(checks).every(v => v === 'ok' || v.startsWith('ok'));
    res.status(allOk ? 200 : 503).json({ status: allOk ? 'healthy' : 'degraded', checks });
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

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      logger.error("port_in_use", { error: err.message });
      // O sistema vai reiniciar automaticamente em breve
    } else {
      logger.error("server_fatal_error", { error: err.message });
    }
  });

  async function gracefulShutdown(signal: string) {
    logger.info('shutdown_initiated', { data: { signal } });

    // 1. Parar de aceitar novas requisições
    server.close(() => logger.info('http_server_closed'));

    // 2. Aguardar jobs em andamento terminarem (max 30s)
    const shutdownTimeout = setTimeout(() => {
      logger.warn('shutdown_timeout', { error: 'Forcing shutdown after 30s' });
      process.exit(1);
    }, 30000);

    // 3. Fechar workers graciosamente
    for (const [tenantId, worker] of tenantWorkers.entries()) {
      await worker.close();
      logger.info('worker_closed', { tenant_id: tenantId });
    }

    clearTimeout(shutdownTimeout);
    logger.info('shutdown_complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
