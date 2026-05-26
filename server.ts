import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import superAdminRouter from "./src/routes/superAdmin.ts";
import apiV1Router from "./src/routes/api-v1.ts";
import { cobraiRouter } from "./src/routes/cobrai.ts";
import { queuesRouter } from "./src/routes/queues.ts";
import { dlqRouter } from "./src/routes/dlq.ts";
import { osRoutingRouter } from "./src/routes/osRouting.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/super-admin", superAdminRouter);
  app.use("/api/v1", apiV1Router);
  app.use("/api/cobrai", cobraiRouter);
  app.use("/api/queues", queuesRouter);
  app.use("/api/dlq", dlqRouter);
  app.use("/api/os", osRoutingRouter);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist/client');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
