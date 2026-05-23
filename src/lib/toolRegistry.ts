import { getPersona } from "./personaManager";
import { adminDb as db } from "./firebaseAdmin";

export interface ToolDefinition {
  id: string;
  name: string;
  required_plan: "basic" | "pro" | "enterprise";
  requires_erp_integration: boolean;
  risk_level: "low" | "medium" | "high";
}

export const toolsCatalog: ToolDefinition[] = [
  { id: "check_billing_status", name: "check_billing_status", required_plan: "basic", requires_erp_integration: true, risk_level: "low" },
  { id: "generate_second_copy", name: "generate_second_copy", required_plan: "basic", requires_erp_integration: true, risk_level: "low" },
  { id: "unlock_customer", name: "unlock_customer", required_plan: "pro", requires_erp_integration: true, risk_level: "high" },
  { id: "check_connection_status", name: "check_connection_status", required_plan: "basic", requires_erp_integration: true, risk_level: "low" },
  { id: "open_service_order", name: "open_service_order", required_plan: "pro", requires_erp_integration: true, risk_level: "medium" },
  { id: "schedule_technician", name: "schedule_technician", required_plan: "enterprise", requires_erp_integration: true, risk_level: "medium" },
  { id: "get_plans_info", name: "get_plans_info", required_plan: "basic", requires_erp_integration: false, risk_level: "low" },
  { id: "process_upsell", name: "process_upsell", required_plan: "pro", requires_erp_integration: true, risk_level: "medium" },
  { id: "send_nps", name: "send_nps", required_plan: "pro", requires_erp_integration: false, risk_level: "low" },
  { id: "check_cto_status", name: "check_cto_status", required_plan: "enterprise", requires_erp_integration: true, risk_level: "low" },
];

export const getAvailableTools = async (tenantId: string, personaId?: string): Promise<string[]> => {
  let tenantPlan = "basic";
  try {
    const tenantDoc = await db.collection("tenants").doc(tenantId).get();
    if (tenantDoc.exists) {
      tenantPlan = tenantDoc.data()?.plan || "basic";
    }
  } catch (e) {
    console.error("Error fetching tenant plan", e);
  }

  let personaTools: string[] | null = null;
  if (personaId) {
    try {
      const persona = await getPersona(personaId);
      if (persona) {
        personaTools = persona.active_tools || [];
      }
    } catch (e) {
      console.error("Error fetching persona", e);
    }
  }

  const activeToolIds = toolsCatalog.filter((tool) => {
    // Check plan requirements
    if (tool.required_plan === "enterprise" && tenantPlan !== "enterprise") return false;
    if (tool.required_plan === "pro" && !["pro", "enterprise"].includes(tenantPlan)) return false;

    // Filter by persona toggles if available
    if (personaTools !== null && !personaTools.includes(tool.id)) {
      return false;
    }

    return true;
  }).map(t => t.id);

  // Map the catalog IDs to the actual OpenAI function names used in gemini.server.ts
  const functionNames: string[] = [];
  
  if (activeToolIds.includes("check_billing_status")) functionNames.push("check_billing_status");
  if (activeToolIds.includes("generate_second_copy")) functionNames.push("generate_second_copy");
  if (activeToolIds.includes("unlock_customer")) functionNames.push("unlock_customer");
  
  if (activeToolIds.includes("check_connection_status")) {
    functionNames.push("check_connection_status");
    functionNames.push("check_coverage");
  }
  
  // Abertura de OS & Agendamento
  if (activeToolIds.includes("schedule_technician") || activeToolIds.includes("open_service_order")) {
    functionNames.push("schedule_technical_visit");
  }

  // search_knowledge_base always mapped to rag_kb in the previous iteration, we can add it here if active...
  // wait, rag_kb isn't in toolsCatalog! Let's just always push it or we can add it. 
  // Actually, we'll just allow search_knowledge_base explicitly if needed.
  functionNames.push("search_knowledge_base");
  functionNames.push("check_upgrade_eligibility");

  return functionNames;
};
