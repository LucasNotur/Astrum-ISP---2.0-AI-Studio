import { logAuditEvent } from "./audit";
import { checkPermissionAdmin } from "../middleware/permissionMiddleware";

export function maskCPF(cpf: string): string {
  if (!cpf) return "";
  const clean = cpf.replace(/\D/g, "");
  if (clean.length === 11) {
    return `***.***.${clean.slice(6, 9)}-**`; // e.g. ***.***.123-**
  }
  return "***.***.XXX-**";
}

export function maskPhone(phone: string): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) {
    return `(**) *****-${clean.slice(-4)}`; // e.g. (**) *****-1234
  } else if (clean.length >= 4) {
    return `(XX) XXXXX-` + "*".repeat(4);
  }
  return "(XX) XXXXX-****";
}

export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "p***@dominio.com";
  const [name, domain] = email.split("@");
  if (name.length > 1) {
    return `${name.charAt(0)}***@${domain}`;
  }
  return `*@${domain}`;
}

export async function unmask(
  value: string,
  userId: string,
  reason: string,
  tenantId: string,
): Promise<string> {
  if (!userId || !tenantId) {
    throw new Error("userId and tenantId are required for unmasking");
  }

  // Verifica permissão view_sensitive_data
  // Checamos a action 'view' no resource 'sensitive_data', e também caso tenham cadastrado 'view_sensitive_data' literal
  const hasAccess1 = await checkPermissionAdmin(
    userId,
    "sensitive_data",
    "view",
    { tenantId },
  );
  const hasAccess2 = await checkPermissionAdmin(
    userId,
    "view_sensitive_data",
    "read",
    { tenantId },
  );
  const hasAccess3 = await checkPermissionAdmin(
    userId,
    "customers",
    "view_sensitive_data",
    { tenantId },
  );

  const isAllowed = hasAccess1 || hasAccess2 || hasAccess3;

  // Registra DATA_ACCESS no audit
  await logAuditEvent({
    event_type: "DATA_ACCESS",
    tenant_id: tenantId,
    user_id: userId,
    resource_id: "view_sensitive_data",
    new_value: {
      action: "unmask",
      reason,
      masked_preview: maskEmail(value), // Just to have some log info
    },
  });

  if (!isAllowed) {
    throw new Error(
      "Acesso Negado: Você não tem permissão (view_sensitive_data) para ver este dado.",
    );
  }

  // Retorna valor real
  return value;
}
