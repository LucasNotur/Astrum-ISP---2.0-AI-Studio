import { supabaseAdmin } from "./supabaseAdmin";
import { getIntegrationKeys } from "./dbAdmin";

export class TemplateNotApprovedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateNotApprovedError";
  }
}

export async function sendHSMTemplate(
  tenantId: string,
  templateName: string,
  recipientPhone: string,
  variables: Record<string, string>
) {
  // 1. Fetch the template — Fase 3: agora tabela nativa `hsm_templates`
  // (era subcoleção Firestore/legacy_docs; a linha nunca existia de verdade
  // porque o CRUD que a criava nunca esteve montado em server.ts).
  const { data: template } = await supabaseAdmin
    .from("hsm_templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("name", templateName)
    .eq("status", "APPROVED")
    .limit(1)
    .maybeSingle();

  if (!template) {
    throw new TemplateNotApprovedError("TEMPLATE_NOT_APPROVED");
  }

  // 3. Substituir no body localmente para log e checar variaveis:
  let bodyText = template.body as string;
  
  // Extrair variaveis esperadas do corpo (e.g. {{1}}, {{2}})
  const expectedVars = [...bodyText.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(m => m[1]);
  
  for (const expectedVar of expectedVars) {
      if (!variables || !(expectedVar in variables)) {
          throw new Error("MISSING_TEMPLATE_VARIABLE");
      }
  }

  for (const [key, value] of Object.entries(variables || {})) {
    bodyText = bodyText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  // 4. Send via Evolution API
  const keys = await getIntegrationKeys(tenantId);
  const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
  const evoInstance = keys.evolutionInstance;
  const evoApiKey = keys.evolutionApiKey;

  if (!evoUrl || !evoInstance || !evoApiKey) {
    throw new Error("Evolution API credentials not configured.");
  }

  // Montando request para SendTemplate
  const response = await fetch(`${evoUrl}/message/sendTemplate/${evoInstance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evoApiKey,
    },
    body: JSON.stringify({
      number: recipientPhone,
      name: templateName,
      language: template.language || "pt_BR",
      variables: Object.values(variables || {}).map(v => ({ text: v }))
    }),
  });

  const resData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to send HSM Template via Evolution: ${JSON.stringify(resData)}`);
  }

  // 5. Registrar o envio
  await supabaseAdmin.from("hsm_send_logs").insert({
    tenant_id: tenantId,
    template_id: template.id,
    template_name: templateName,
    recipient: recipientPhone,
    variables: variables ?? {},
  });

  return resData;
}
