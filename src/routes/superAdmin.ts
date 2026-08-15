import express from "express";
import { verifySupabaseToken } from "../lib/authVerify.ts";

// FASE 2-A.2 (2026-08-15): os handlers HTTP de super-admin (ai-circuit, tenants,
// custom-domains, suspend, reactivate, metrics) foram REMOVIDOS. A SuperAdminPage e a
// AIObservabilityPage agora resolvem tudo no frontend/v2:
//   - metrics  → computado client-side pela Escada Astrum (plans.ts); o legado lia
//                saas_metrics/subscription.monthly_price/canceled_at — tabela/colunas INEXISTENTES.
//   - suspend/reactivate → toggle de tenants.active direto no Supabase (RLS super_admin_all_tenants).
//   - ai-circuit → GET /api/v2/ia/providers/status (Fastify).
// Este arquivo mantém APENAS o guard `verifySuperAdmin`, ainda usado pelos mounts Express
// legados que faltam portar na Fase 2 (cobrai, queues, dlq, jobs).

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
