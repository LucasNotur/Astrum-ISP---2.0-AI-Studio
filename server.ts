import express from "express";
import path from "path";
import fs from "fs";

import superAdminRouter from "./src/routes/superAdmin.ts";
import apiV1Router from "./src/routes/api-v1.ts";
import { cobraiRouter } from "./src/routes/cobrai.ts";
import { queuesRouter } from "./src/routes/queues.ts";
import { dlqRouter } from "./src/routes/dlq.ts";
import { osRoutingRouter } from "./src/routes/osRouting.ts";
import { evolutionRouter } from "./src/routes/evolution.ts";
import { facebookWebhookRouter } from "./src/routes/facebookWebhook.ts";
import { evolutionWebhookRouter } from "./src/routes/evolutionWebhook.ts";
import { jobsRouter } from "./src/routes/jobs.ts";
import { verifySuperAdmin } from "./src/routes/superAdmin.ts";

import { getLLMStatus } from "./apps/api/src/adapters/ai/llm.adapter.ts";
import { startFastifyServer } from "./apps/api/src/server.ts";

process.on("uncaughtException", err => console.error("UNCAUGHT EXCEPTION", err));
process.on("unhandledRejection", err => console.error("UNHANDLED REJECTION", err));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Lança o servidor Fastify em background
  startFastifyServer().catch(console.error);

  app.use(express.json());

  app.get("/api/test", (req, res) => res.send("TEST SUCCESS"));

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        openai_circuit: getLLMStatus().openai,
        llm_router: getLLMStatus().router,
      }
    });
  });

  app.get("/api/health/whatsapp", (req, res) => {
    res.json({ status: "open", checked_at: new Date().toISOString() });
  });

  app.get("/api/system/webhook-url", (req, res) => {
    res.json({ webhookUrl: `${req.protocol}://${req.get("host")}/api/webhook/evolution` });
  });

  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/v1", apiV1Router);
  app.use("/api/cobrai", verifySuperAdmin, cobraiRouter);
  app.use("/api/queues", verifySuperAdmin, queuesRouter);
  app.use("/api/dlq", verifySuperAdmin, dlqRouter);
  app.use("/api/os", verifySuperAdmin, osRoutingRouter);
  app.use("/api/evolution", evolutionRouter);
  app.use("/api/jobs", verifySuperAdmin, jobsRouter);
  app.use("/api/webhook/facebook", facebookWebhookRouter);
  app.use("/api/webhook/evolution", evolutionWebhookRouter);

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
      server: { middlewareMode: true },
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
