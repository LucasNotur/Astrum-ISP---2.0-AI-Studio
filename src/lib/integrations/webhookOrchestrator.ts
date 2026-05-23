export type NormalizedEventType = 
  | "PAYMENT_CONFIRMED"
  | "CUSTOMER_BLOCKED"
  | "CUSTOMER_UNBLOCKED"
  | "PLAN_CHANGED"
  | "CONNECTION_DOWN"
  | "UNKNOWN";

export interface NormalizedEvent {
  event_id: string;
  type: NormalizedEventType;
  tenant_id: string;
  customer_cpf: string | null;
  timestamp: string;
  raw_payload: any;
}

export function parseIXCEvent(tenantId: string, payload: any): NormalizedEvent {
  let type: NormalizedEventType = "UNKNOWN";
  
  // Exemplo fictício de regra para IXC
  if (payload.event === "invoice.paid") type = "PAYMENT_CONFIRMED";
  if (payload.event === "client.blocked") type = "CUSTOMER_BLOCKED";
  if (payload.event === "client.unblocked") type = "CUSTOMER_UNBLOCKED";

  return {
    event_id: payload.id || `ixc-${Date.now()}`,
    type,
    tenant_id: tenantId,
    customer_cpf: payload.cpf_cnpj || payload.client?.cpf || null,
    timestamp: new Date().toISOString(),
    raw_payload: payload
  };
}

export function parseMKAuthEvent(tenantId: string, payload: any): NormalizedEvent {
  let type: NormalizedEventType = "UNKNOWN";
  
  // Exemplo fictício de regra para MKAuth
  if (payload.action === "pgto_confirmado") type = "PAYMENT_CONFIRMED";
  if (payload.action === "cliente_bloqueado") type = "CUSTOMER_BLOCKED";

  return {
    event_id: payload.uuid || `mkauth-${Date.now()}`,
    type,
    tenant_id: tenantId,
    customer_cpf: payload.cpf || null,
    timestamp: new Date().toISOString(),
    raw_payload: payload
  };
}

export function parseVoalleEvent(tenantId: string, payload: any): NormalizedEvent {
  let type: NormalizedEventType = "UNKNOWN";
  
  // Exemplo fictício de regra para Voalle
  if (payload.EventType === "Financial.Receipt") type = "PAYMENT_CONFIRMED";
  if (payload.EventType === "Service.Suspended") type = "CUSTOMER_BLOCKED";

  return {
    event_id: payload.EventId || `voalle-${Date.now()}`,
    type,
    tenant_id: tenantId,
    customer_cpf: payload.Document || null,
    timestamp: new Date().toISOString(),
    raw_payload: payload
  };
}
