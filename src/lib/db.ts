/**
 * FZ-4 — Camada de dados do frontend legado, 100% SUPABASE.
 * Este módulo mantém o NOME e as ASSINATURAS históricas (era Firestore client SDK)
 * para que App.tsx e as páginas continuem importando de "./lib/db" sem mudanças.
 * As leituras real-time vivem em ./supabaseDb.ts (re-exportadas aqui).
 * Plano: .astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md (FZ-4).
 */
import forge from "node-forge";
import { supabase } from "./supabase.ts";
import {
  getCustomers,
  updateCustomer,
  createCustomer,
  deleteCustomer,
  createInvoice,
  getTickets,
  toggleTicketAI,
  deleteTicket,
  getMessages,
  sendMessage,
  getInvoices,
  getNetworkCTOs,
  logAudit,
  getAuditLogs,
  getTechnicians,
  createTechnician,
  getServiceOrders,
  createServiceOrder,
  getInventory,
  updateTechnician as sbUpdateTechnician,
  updateServiceOrder as sbUpdateServiceOrder,
} from "./supabaseDb.ts";

// ─── Re-exports (assinaturas idênticas) ──────────────────────────────────────
export {
  getCustomers,
  updateCustomer,
  createCustomer,
  deleteCustomer,
  createInvoice,
  getTickets,
  toggleTicketAI,
  deleteTicket,
  getMessages,
  sendMessage,
  getInvoices,
  getNetworkCTOs,
  logAudit,
  getAuditLogs,
  getTechnicians,
  createTechnician,
  getServiceOrders,
  createServiceOrder,
  getInventory,
};

// Assinaturas legadas aceitavam um 3º parâmetro tenantId (ignorado no Supabase — RLS resolve)
export const updateTechnician = async (id: string, data: any, _tenantId: string = "default") =>
  sbUpdateTechnician(id, data);

export const updateServiceOrder = async (id: string, data: any) =>
  sbUpdateServiceOrder(id, data);

// ─── Criptografia de CPF (pura — sem banco) ──────────────────────────────────

export const encryptCpf = (cpf: string): string => {
  if (!cpf) return cpf;
  const keyHex =
    ((typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.VITE_CPF_ENCRYPTION_KEY) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CPF_ENCRYPTION_KEY)) ||
    "0000000000000000000000000000000000000000000000000000000000000000";
  try {
    const key = forge.util.hexToBytes(keyHex);
    if (key.length !== 32) return cpf;
    const iv = forge.random.getBytesSync(12);
    const cipher = forge.cipher.createCipher("AES-GCM", key);
    cipher.start({ iv: iv });
    cipher.update(forge.util.createBuffer(cpf, "utf8"));
    cipher.finish();
    const encrypted = cipher.output.getBytes();
    const tag = cipher.mode.tag.getBytes();
    return (
      forge.util.encode64(iv) +
      ":" +
      forge.util.encode64(tag) +
      ":" +
      forge.util.encode64(encrypted)
    );
  } catch (err) {
    return cpf;
  }
};

export const decryptCpf = (encryptedCpf: string): string => {
  if (!encryptedCpf || typeof encryptedCpf !== "string" || !encryptedCpf.includes(":"))
    return encryptedCpf;
  const keyHex =
    ((typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.VITE_CPF_ENCRYPTION_KEY) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CPF_ENCRYPTION_KEY)) ||
    "0000000000000000000000000000000000000000000000000000000000000000";
  try {
    const key = forge.util.hexToBytes(keyHex);
    if (key.length !== 32) return encryptedCpf;
    const parts = encryptedCpf.split(":");
    if (parts.length !== 3) return encryptedCpf;
    const iv = forge.util.decode64(parts[0]);
    const tag = forge.util.decode64(parts[1]);
    const encrypted = forge.util.decode64(parts[2]);
    const decipher = forge.cipher.createDecipher("AES-GCM", key);
    decipher.start({ iv: iv, tag: forge.util.createBuffer(tag) });
    decipher.update(forge.util.createBuffer(encrypted));
    const pass = decipher.finish();
    if (pass) return decipher.output.toString();
    return encryptedCpf;
  } catch (err) {
    return encryptedCpf;
  }
};

export const maskCpfForLog = (cpf?: string): string => {
  if (!cpf) return "";
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 5) return "***";
  return cleanCpf.slice(0, 3) + "***" + cleanCpf.slice(-2);
};

export const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write",
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

function logDbError(err: unknown, op: OperationType, path: string | null) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[db] ${op} ${path ?? ""}: ${msg}`);
}

// ─── Helpers de sessão/tenant ────────────────────────────────────────────────

async function currentTenantId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    const metaTenant = (session!.user!.user_metadata as any)?.tenant_id
      ?? (session!.user!.app_metadata as any)?.tenant_id;
    if (metaTenant) return metaTenant;
    const { data } = await supabase.from("users").select("tenant_id").eq("id", uid).maybeSingle();
    return data?.tenant_id ?? null;
  } catch {
    return null;
  }
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export const createTicket = async (customerId: string, subject: string) => {
  try {
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        customer_id: customerId,
        subject,
        status: "open",
        priority: "medium",
        ai_enabled: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    logDbError(err, OperationType.CREATE, "tickets");
    throw err;
  }
};

export const updateTicketSessionState = async (ticketId: string, newSessionState: any) => {
  try {
    const { data } = await supabase
      .from("tickets").select("session_state").eq("id", ticketId).maybeSingle();
    const current = data?.session_state ?? { active_flow: "IDLE" };
    const merged = { ...current };
    for (const k of ["active_flow", "step", "agent", "lead_stage"]) {
      if (newSessionState[k] !== undefined) merged[k] = newSessionState[k];
    }
    await supabase.from("tickets").update({ session_state: merged }).eq("id", ticketId);
  } catch (err) {
    logDbError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const updateCustomerStats = async (customerId: string) => {
  try {
    const [tRes, iRes] = await Promise.all([
      supabase.from("tickets").select("*", { count: "exact", head: true })
        .eq("customer_id", customerId).neq("status", "resolved"),
      supabase.from("invoices").select("*", { count: "exact", head: true })
        .eq("customer_id", customerId).eq("status", "overdue"),
    ]);
    const openTicketsCount = tRes.count ?? 0;
    const overdueInvoicesCount = iRes.count ?? 0;
    const riskScore = openTicketsCount * 20 + overdueInvoicesCount * 40;
    await supabase.from("customers").update({
      open_tickets_count: openTicketsCount,
      overdue_invoices_count: overdueInvoicesCount,
      risk_score: riskScore,
    }).eq("id", customerId);
  } catch (err) {
    console.error("Failed to update customer stats:", err);
  }
};

export const updateTicketStatus = async (ticketId: string, status: string) => {
  try {
    const { data: tData } = await supabase
      .from("tickets").select("*").eq("id", ticketId).maybeSingle();

    const updateData: any = { status };
    if (status === "resolved") {
      updateData.resolved_at = new Date().toISOString();
      if (tData?.customer_id) {
        fetch("/api/jobs/schedule-csat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId,
            tenantId: tData.tenant_id || "default",
            customerId: tData.customer_id,
            category: tData.session_state?.agent || "SAC_GERAL",
            resolved_by: tData.human_responded ? "human" : "bot",
          }),
        }).catch(e => console.error("Falha ao agendar CSAT:", e));
      }
    }
    await supabase.from("tickets").update(updateData).eq("id", ticketId);

    if (tData?.customer_id) {
      await updateCustomerStats(tData.customer_id);
    }
  } catch (err) {
    logDbError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const incrementAiAttempts = async (ticketId: string) => {
  try {
    const { data } = await supabase
      .from("tickets").select("ai_attempts").eq("id", ticketId).maybeSingle();
    await supabase.from("tickets")
      .update({ ai_attempts: (data?.ai_attempts ?? 0) + 1 })
      .eq("id", ticketId);
  } catch (err) {
    logDbError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const createContract = async (immutableContract: any) => {
  try {
    const { data, error } = await supabase
      .from("contracts").insert(immutableContract).select().single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    logDbError(err, OperationType.CREATE, "contracts");
    return null;
  }
};

// ─── Integrações / Prompts (armazenados na linha do tenant) ─────────────────

export const getIntegrationKeys = async (): Promise<any> => {
  try {
    const tenantId = await currentTenantId();
    if (!tenantId) return {};
    const { data } = await supabase
      .from("tenants").select("integration_keys").eq("id", tenantId).maybeSingle();
    const keys = (data?.integration_keys as Record<string, string>) ?? {};
    if (keys.evolutionUrl && keys.evolutionUrl.includes("trycloudflare")) {
      keys.evolutionUrl = "";
    }
    return keys;
  } catch (err) {
    console.error("Error fetching integration keys:", err);
    return {};
  }
};

export const saveIntegrationKeys = async (keys: Record<string, string>) => {
  try {
    const tenantId = await currentTenantId();
    if (!tenantId) throw new Error("Sem tenant na sessão");
    const { data } = await supabase
      .from("tenants").select("integration_keys").eq("id", tenantId).maybeSingle();
    const merged = { ...((data?.integration_keys as Record<string, string>) ?? {}), ...keys };
    const { error } = await supabase
      .from("tenants").update({ integration_keys: merged }).eq("id", tenantId);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.WRITE, "tenants.integration_keys");
    throw err;
  }
};

export const getSystemPrompts = async (tenantId: string = "default") => {
  try {
    const tid = tenantId !== "default" ? tenantId : await currentTenantId();
    if (!tid) return null;
    const { data } = await supabase
      .from("tenants").select("extra").eq("id", tid).maybeSingle();
    return (data?.extra as any)?.system_prompts ?? null;
  } catch (err) {
    console.error("Error fetching system prompts:", err);
    return null;
  }
};

export const saveSystemPrompts = async (prompts: Record<string, string>, tenantId: string = "default") => {
  try {
    const tid = tenantId !== "default" ? tenantId : await currentTenantId();
    if (!tid) throw new Error("Sem tenant na sessão");
    const { data } = await supabase
      .from("tenants").select("extra").eq("id", tid).maybeSingle();
    const extra = { ...((data?.extra as any) ?? {}) };
    extra.system_prompts = { ...(extra.system_prompts ?? {}), ...prompts };
    extra.system_prompts_updated_at = new Date().toISOString();
    const { error } = await supabase.from("tenants").update({ extra }).eq("id", tid);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.WRITE, "tenants.extra.system_prompts");
    throw err;
  }
};

// Contadores (eram shards para contornar limite de writes do Firestore — Postgres não precisa)
export async function incrementShardedCounter(metricName: string, tenantId: string) {
  try {
    const { data } = await supabase
      .from("tenants").select("extra").eq("id", tenantId).maybeSingle();
    const extra = { ...((data?.extra as any) ?? {}) };
    const metrics = { ...(extra.metrics ?? {}) };
    metrics[metricName] = (metrics[metricName] ?? 0) + 1;
    extra.metrics = metrics;
    await supabase.from("tenants").update({ extra }).eq("id", tenantId);
  } catch (err: any) {
    console.error("Error incrementing counter:", err.message);
  }
}

export async function getShardedCount(metricName: string, tenantId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from("tenants").select("extra").eq("id", tenantId).maybeSingle();
    return ((data?.extra as any)?.metrics?.[metricName] as number) ?? 0;
  } catch {
    return 0;
  }
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

export const createKBArticle = async (article: any) => {
  try {
    const { error } = await supabase.from("knowledge_articles").insert(article);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.CREATE, "knowledge_articles");
    throw err;
  }
};

export const updateKBArticle = async (id: string, article: any) => {
  try {
    const { error } = await supabase.from("knowledge_articles").update(article).eq("id", id);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.UPDATE, `knowledge_articles/${id}`);
    throw err;
  }
};

export const deleteKBArticle = async (id: string) => {
  try {
    const { error } = await supabase.from("knowledge_articles").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.DELETE, `knowledge_articles/${id}`);
    throw err;
  }
};

// ─── Ferramentas "reais" da IA ───────────────────────────────────────────────

export const checkCoverageReal = async (cep: string) => {
  try {
    const keys = await getIntegrationKeys();
    if (!keys.googleMapsKey) {
      return {
        status: "manual_check_required",
        message:
          "A consulta de viabilidade técnica integrada (CTOs) está desativada ou restrita pela empresa mãe. Por favor, verifique a viabilidade manualmente nos mapas de rede internos da sua região.",
      };
    }
    const { data } = await supabase.from("network_ctos").select("*").eq("cep", cep);
    const ctos = data ?? [];
    const available = ctos.some((cto: any) => (cto.used_ports ?? cto.usedPorts ?? 0) < (cto.total_ports ?? cto.totalPorts ?? 0));
    return {
      status: available ? "available" : "unavailable",
      message: available
        ? `Viabilidade confirmada para o CEP ${cep}. Temos portas disponíveis na região.`
        : `Infelizmente não temos portas disponíveis para o CEP ${cep} no momento.`,
    };
  } catch (err) {
    return { status: "error", message: "Erro ao consultar viabilidade." };
  }
};

export const getBillingStatusReal = async (cpf: string) => {
  try {
    const keys = await getIntegrationKeys();
    if (!keys.billingApi) {
      return {
        status: "manual_check_required",
        message:
          "O sistema de consulta financeira automática não está integrado no momento (Operação White-label). Por favor, informe ao cliente que você irá consultar manualmente os registros de faturamento da central e peça um momento.",
      };
    }
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.startsWith("123")) {
      return {
        status: "pending",
        message:
          "Encontramos 1 fatura pendente no valor de R$ 99,90 com vencimento para 10/04/2026.",
        invoiceDetails: {
          value: 99.9,
          dueDate: "2026-04-10",
          pixCopyPaste:
            "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426655440000520400005303986540599.905802BR5913ASTRUM LTDA6009SAO PAULO62070503***63041A2B",
          pdfLink: "https://fatura.astrum.com.br/12345.pdf",
        },
      };
    }
    return {
      status: "up_to_date",
      message: "Não encontramos faturas pendentes para este CPF. Tudo em dia!",
    };
  } catch (err) {
    console.error("Erro ao consultar financeiro:", err);
    return { status: "error", message: "Erro de comunicação com a API do Banco." };
  }
};

export const runDiagnosticsReal = async (_customerId: string) => {
  return {
    status: "locked",
    message:
      "Sistema de diagnóstico de OLT temporariamente indisponível por falta de permissão de acesso. Por favor, informe ao cliente que estamos sem acesso temporário à OLT para verificar o sinal.",
  };
};

// ─── Notificações ────────────────────────────────────────────────────────────

export const notifyTeam = async (
  type: "SLA_BREACH" | "CRITICAL_ESCALATION" | "SYSTEM_ERROR",
  message: string,
  ticketId?: string,
) => {
  try {
    await supabase.from("notifications").insert({
      type,
      message,
      ticket_id: ticketId || null,
    });
    console.log(`[Notification] ${type}: ${message}`);
  } catch (err) {
    console.error("Notification Error:", err);
  }
};

// ─── Reativação de cliente ───────────────────────────────────────────────────

export async function handleCustomerReactivation(customerId: string, tenantId: string) {
  await supabase.from("customers").update({
    status: "ativo",
    financial_status: "em_dia",
    reactivated_at: new Date().toISOString(),
    retention_discount_used_at: null,
    retention_discount_value: null,
    churn_risk: false,
  }).eq("id", customerId);

  await logAudit("CUSTOMER_REACTIVATED", {
    customer_id: customerId,
    previous_status: "cancelado",
  }, tenantId);
}

// ─── Seeds (dev/demo) ────────────────────────────────────────────────────────

export const seedServiceOrdersAndTechnicians = async () => {
  const techs = [
    { name: "Técnico Alpha", phone: "5511999999991", status: "offline", coverage_regions: ["Sul", "Leste"], active: true },
    { name: "Técnico Bravo", phone: "5511999999992", status: "offline", coverage_regions: ["Norte", "Oeste"], active: true },
    { name: "Técnico Charlie", phone: "5511999999993", status: "offline", coverage_regions: ["Sul", "Centro"], active: true },
    { name: "Técnico Delta", phone: "5511999999994", status: "offline", coverage_regions: ["Norte", "Leste"], active: true },
  ];
  await supabase.from("technicians").insert(techs);

  await supabase.from("service_orders").insert({
    customer_name: "João Silva",
    address: "Rua das Flores, 123 - Centro",
    lat: -23.5505,
    lng: -46.6333,
    status: "pendente",
    type: "manutencao",
    description:
      "Cabo rompido na rua, sinal -40dBm. Necessário verificar roteador e possível troca de drop.",
    cto: "CTO-01",
    port: 4,
    materials: ["100m Cabo Drop", "1 ONU Nova", "Conectores APC"],
    ai_summary:
      "Resumo da IA: Cliente relatou falta de internet há 2 horas. Diagnóstico remoto indica atenuação severa (-40dBm). Reinicialização não surtiu efeito. Provável rompimento físico.",
  });
};

export const updateInventoryItem = async (id: string, data: any) => {
  try {
    const { error } = await supabase.from("inventory").update(data).eq("id", id);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.UPDATE, `inventory/${id}`);
    throw err;
  }
};

export const createInventoryItem = async (data: any) => {
  try {
    const { data: row, error } = await supabase.from("inventory").insert(data).select().single();
    if (error) throw error;
    return row.id;
  } catch (err) {
    logDbError(err, OperationType.CREATE, "inventory");
    return undefined;
  }
};

export const deleteInventoryItem = async (id: string) => {
  try {
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) throw error;
  } catch (err) {
    logDbError(err, OperationType.DELETE, `inventory/${id}`);
    throw err;
  }
};

export const seedKnowledgeBase = async () => {
  const articles = [
    {
      title: "Como reiniciar o roteador",
      content:
        "Desligue o roteador da tomada, aguarde 30 segundos e ligue novamente. Isso resolve 90% dos problemas de conexão.",
      tags: ["roteador", "reiniciar", "conexão", "lento"],
      category: "Suporte",
    },
    {
      title: "Configuração de Wi-Fi",
      content:
        "Mantenha o roteador em local alto e centralizado. Evite obstáculos como paredes grossas e espelhos.",
      tags: ["wi-fi", "sinal", "cobertura"],
      category: "Suporte",
    },
    {
      title: "Planos de Fibra 2026",
      content:
        "100 Mega: R$62,99. 300 Mega: R$82,99. 600 Mega: R$99,99. 1 Giga: R$119,99. Promocionais pagando no vencimento. Instalação grátis para contratos de 12 meses.",
      tags: ["planos", "preço", "vendas", "fibra"],
      category: "Vendas",
    },
  ];
  await supabase.from("knowledge_articles").insert(articles);
};

export const seedInventory = async () => {
  const items = [
    { name: "ONU Huawei HG8245H", category: "ONU", stock: 45, min_stock: 10, unit: "un", price: 180 },
    { name: "Roteador TP-Link Archer C6", category: "Roteador", stock: 12, min_stock: 15, unit: "un", price: 220 },
    { name: "Cabo Drop Flat (km)", category: "Cabo", stock: 4.5, min_stock: 2, unit: "km", price: 450 },
    { name: "Conector Fast SC/APC", category: "Acessório", stock: 500, min_stock: 100, unit: "un", price: 1.5 },
  ];
  await supabase.from("inventory").insert(items);
};

export const seedSystem = async () => {
  const plans = ["100 Mega", "300 Mega", "600 Mega", "1 Giga"];
  const statuses = ["active", "active", "active", "inactive"];
  const firstNames = ["Lucas", "Ana", "Bruno", "Carla", "Diego", "Elena", "Fabio", "Gisele", "Hugo", "Iris", "Joao", "Kelly", "Luis", "Mara", "Nuno", "Olivia", "Paulo", "Quiteria", "Raul", "Sonia"];
  const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa"];

  console.log("Starting massive seed...");

  for (let i = 0; i < 100; i++) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]} ${i}`;
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const mrr = plan === "100 Mega" ? 62.99 : plan === "300 Mega" ? 82.99 : plan === "600 Mega" ? 99.99 : 119.99;

    const { data: customer, error } = await supabase.from("customers").insert({
      name,
      email: `user${i}@example.com`,
      phone: `(11) 9${Math.floor(10000000 + Math.random() * 90000000)}`,
      address: `Rua das Flores, ${Math.floor(Math.random() * 1000)}, São Paulo - SP`,
      plan,
      mrr,
      status: statuses[Math.floor(Math.random() * statuses.length)],
    }).select().single();
    if (error || !customer) continue;

    const numInvoices = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < numInvoices; j++) {
      const isOverdue = Math.random() > 0.8;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - j * 30 + (isOverdue ? -5 : 5));
      await supabase.from("invoices").insert({
        customer_id: customer.id,
        amount: mrr,
        status: isOverdue ? "overdue" : "paid",
        due_date: dueDate.toISOString(),
      });
    }

    if (Math.random() > 0.5) {
      const numTickets = Math.floor(Math.random() * 2) + 1;
      for (let k = 0; k < numTickets; k++) {
        const status = Math.random() > 0.7 ? "resolved" : "open";
        const { data: ticket } = await supabase.from("tickets").insert({
          customer_id: customer.id,
          subject: k === 0 ? "Sem conexão com a internet" : "Lentidão no Wi-Fi",
          status,
          priority: Math.random() > 0.8 ? "high" : "medium",
          resolved_at: status === "resolved" ? new Date().toISOString() : null,
        }).select().single();
        if (!ticket) continue;

        const numMessages = Math.floor(Math.random() * 3) + 1;
        for (let m = 0; m < numMessages; m++) {
          await supabase.from("messages").insert({
            ticket_id: ticket.id,
            sender_type: m % 2 === 0 ? "customer" : "ai",
            body: m === 0 ? "Olá, estou sem internet." : "Olá! Vou verificar seu sinal agora mesmo.",
          });
        }
      }
    }
  }

  for (let i = 0; i < 10; i++) {
    const totalPorts = 16;
    const usedPorts = Math.floor(Math.random() * 17);
    await supabase.from("network_ctos").insert({
      name: `CTO-SP-${i.toString().padStart(3, "0")}`,
      latitude: -23.5505 + (Math.random() - 0.5) * 0.1,
      longitude: -46.6333 + (Math.random() - 0.5) * 0.1,
      total_ports: totalPorts,
      used_ports: usedPorts,
      status: usedPorts === totalPorts ? "full" : "active",
    });
  }

  console.log("Massive seed completed!");
};
