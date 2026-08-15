import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import http from "http";

import { cobraiRouter } from "./src/routes/cobrai.ts";
import { queuesRouter } from "./src/routes/queues.ts";
import { dlqRouter } from "./src/routes/dlq.ts";
import { evolutionRouter } from "./src/routes/evolution.ts";
import { facebookWebhookRouter } from "./src/routes/facebookWebhook.ts";
import { evolutionWebhookRouter } from "./src/routes/evolutionWebhook.ts";
import { jobsRouter } from "./src/routes/jobs.ts";
import { verifySuperAdmin } from "./src/routes/superAdmin.ts";
import { asaasWebhookHandler } from "./src/lib/billing.ts";

import { getLLMStatus } from "./apps/api/src/adapters/ai/llm.adapter.ts";
import { startFastifyServer } from "./apps/api/src/server.ts";

process.on("uncaughtException", err => console.error("UNCAUGHT EXCEPTION", err));
process.on("unhandledRejection", err => console.error("UNHANDLED REJECTION", err));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Lança o servidor Fastify em background
  startFastifyServer().catch(console.error);

  // Proxy /api/v2/* para o Fastify ANTES do express.json() para não consumir o body
  const FASTIFY_PORT = process.env.FASTIFY_PORT || 3001;
  app.use('/api/v2', (req, res) => {
    const targetPath = '/api/v2' + req.url;
    console.log(`[PROXY] ${req.method} ${req.originalUrl} -> 127.0.0.1:${FASTIFY_PORT}${targetPath}`);
    const headers = { ...req.headers, host: `127.0.0.1:${FASTIFY_PORT}` };
    delete headers['content-length'];
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: Number(FASTIFY_PORT),
      path: targetPath,
      method: req.method,
      headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      console.error('[PROXY] Error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'Fastify unavailable' });
    });
    if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(req.method)) {
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  });

  // APPSEC-05: captura os BYTES CRUS do corpo para verificação de HMAC de webhooks.
  // Providers (Facebook/Evolution) assinam o payload original; re-serializar com
  // JSON.stringify(req.body) muda os bytes e quebra/burla a checagem. `req.rawBody`
  // guarda o buffer exato recebido.
  app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'];
  app.use(cors({ origin: allowedOrigins, credentials: true }));

  // SEC-R2 / P0-D (auditoria 2026-08-10): hardening de headers na borda que serve o SPA.
  // CSP em REPORT-ONLY (não bloqueia — só reporta violações no console do browser). Depois de
  // observar os reports e ajustar as diretivas, trocar para 'Content-Security-Policy' (enforcing).
  // Os demais headers são seguros para aplicar já (não quebram o app).
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy-Report-Only",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.astrumlabs.online",
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join("; "),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(), camera=()");
    next();
  });

  app.get("/api/health", async (req, res) => {
    // Bug S68: expor o estado de boot do Fastify v2 (antes falhas eram invisíveis).
    let fastify = { booted: false, bootFailed: false, lastError: null as string | null };
    try {
      const { getBootState } = await import("./apps/api/src/infrastructure/observability/boot-state.ts");
      const s = getBootState();
      fastify = { booted: s.fastifyBooted, bootFailed: s.fastifyBootFailed, lastError: s.lastError };
    } catch { /* módulo pode não ter carregado */ }

    res.status(fastify.bootFailed ? 503 : 200).json({
      status: fastify.bootFailed ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      services: {
        openai_circuit: getLLMStatus().openai,
        llm_router: getLLMStatus().router,
        fastify_boot_failed: fastify.bootFailed,
        fastify_booted: fastify.booted,
        // fastify_boot_error (string crua) REMOVIDO da resposta pública (info-disclosure,
        // classe APPSEC-04). O detalhe segue disponível server-side via getBootState()/logs.
      }
    });
  });

  app.get("/api/health/whatsapp", (req, res) => {
    res.json({ status: "open", checked_at: new Date().toISOString() });
  });

  app.get("/api/system/webhook-url", (req, res) => {
    res.json({ webhookUrl: `${req.protocol}://${req.get("host")}/api/webhook/evolution` });
  });

  // FASE 2-A.2: mount /api/super-admin REMOVIDO (handlers portados p/ front/v2; ver superAdmin.ts).
  // AUTH-06 (2026-08-11): rota /api/v1 (X-API-Key) REMOVIDA. Era morta e insegura:
  // requireApiKey usava db.collectionGroup("api_keys"), inexistente no db-compat →
  // 500 em toda request (auth nunca sucedia, endpoints inalcançáveis, tráfego zero,
  // sem consumidor). Design também inseguro (API key em texto puro, sem hash/timing-safe).
  // R4 proíbe feature nova em /src; se uma API pública for necessária, nasce no apps/api
  // com key hasheada + comparação timing-safe. /api/v1/* agora cai no catch-all /api/* (404).
  app.use("/api/cobrai", verifySuperAdmin, cobraiRouter);
  app.use("/api/queues", verifySuperAdmin, queuesRouter);
  app.use("/api/dlq", verifySuperAdmin, dlqRouter);
  app.use("/api/evolution", evolutionRouter);
  app.use("/api/jobs", verifySuperAdmin, jobsRouter);
  app.use("/api/webhook/facebook", facebookWebhookRouter);
  app.use("/api/webhook/evolution", evolutionWebhookRouter);
  // BILL-02/BILL-03: webhook de pagamento Asaas — antes o handler existia mas NÃO era
  // montado, então PAYMENT_OVERDUE nunca chegava e o lockout de inadimplente (job
  // `lockout_tenant`) nunca disparava. Auth fail-closed + timing-safe no handler.
  app.post("/api/webhook/asaas", asaasWebhookHandler);

  // Catch-all for missing API routes to prevent Vite SPA HTML fallback
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  const distPath = path.join(process.cwd(), 'dist/client');
  app.use(express.static(distPath));

  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Libera o acesso via Cloudflare Tunnel (api.astrumlabs.online).
        // Sem isto o Vite 6 responde "Blocked request. This host is not allowed."
        allowedHosts: ['api.astrumlabs.online', '.astrumlabs.online', 'localhost'],
      },
      appType: "custom",
    });
    app.use(vite.middlewares);
  }

  app.use('*', async (req, res, next) => {
    try {
      if (vite) {
         let template = fs.readFileSync(path.resolve('index.html'), 'utf-8');
         template = await vite.transformIndexHtml(req.originalUrl, template);
         return res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      }
      
      const distIndex = path.join(process.cwd(), 'dist/client/index.html');
      const rootIndex = path.join(process.cwd(), 'index.html');

      let finalIndex = '';
      if (fs.existsSync(distIndex)) finalIndex = distIndex;
      else if (fs.existsSync(rootIndex)) finalIndex = rootIndex;
      else {
         return res.status(404).send("No index.html found anywhere.");
      }
      res.sendFile(finalIndex);
    } catch(e) {
      if (vite) vite.ssrFixStacktrace(e);
      console.error(e);
      res.status(500).send("Error");
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
