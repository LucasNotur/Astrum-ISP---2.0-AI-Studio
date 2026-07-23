/**
 * D-04 Fase 2 — Correlação e supressão de tickets.
 *
 * Fecha o loop do NOC autônomo ("detecção → correlação → aviso proativo →
 * SUPRESSÃO DE TICKETS → confirmação"): quando um ticket chega de um cliente cuja
 * CTO tem um incidente ativo, ele é correlacionado ao incidente e suprimido — em
 * vez de virar mais um chamado sobre a mesma queda em massa.
 *
 * Lógica pura + ports injetáveis (sem Supabase nos testes).
 */

export interface ActiveIncident {
  id: string;
  ctoId: string | null;
  status: string; // 'confirmada' | 'comunicada'
}

/**
 * Casa um ticket (pela CTO do cliente) a um incidente ativo. Prioriza incidentes
 * já COMUNICADOS (o cliente já foi avisado) sobre apenas confirmados. Pura.
 */
export function matchTicketToIncident(
  customerCtoId: string | null,
  active: ActiveIncident[],
): ActiveIncident | null {
  if (!customerCtoId) return null;
  const onCto = active.filter((i) => i.ctoId === customerCtoId);
  return onCto.find((i) => i.status === 'comunicada')
    ?? onCto.find((i) => i.status === 'confirmada')
    ?? null;
}

export function buildSuppressionNote(incidentId: string): string {
  return `Correlacionado ao incidente de rede ${incidentId}: instabilidade em massa já detectada e em tratamento. `
    + 'O cliente será avisado automaticamente na normalização.';
}

export function buildNormalizationMessage(): string {
  return 'Boa notícia! A instabilidade na sua região foi normalizada. '
    + 'Se ainda estiver com problema, é só nos chamar que verificamos seu caso individualmente.';
}

export interface CorrelationPorts {
  /** CTO do cliente (customers.cto_id). Null se sem cliente/CTO. */
  getCustomerCto: (tenantId: string, customerId: string) => Promise<string | null>;
  /** Incidentes com status confirmada/comunicada. */
  listActiveIncidents: (tenantId: string) => Promise<ActiveIncident[]>;
  /** Marca o ticket como suprimido e o vincula ao incidente (não-destrutivo). */
  suppressTicket: (tenantId: string, ticketId: string, incidentId: string, note: string) => Promise<void>;
}

export interface CorrelationResult {
  suppressed: boolean;
  incidentId?: string;
}

/**
 * Tenta correlacionar um ticket recém-criado a um incidente ativo na CTO do
 * cliente. Se casar, suprime o ticket. Nunca lança por dado ruim.
 */
export async function correlateIncomingTicket(
  tenantId: string,
  ticket: { id: string; customerId: string | null },
  ports: CorrelationPorts,
): Promise<CorrelationResult> {
  if (!ticket.customerId) return { suppressed: false };

  const ctoId = await ports.getCustomerCto(tenantId, ticket.customerId);
  const active = await ports.listActiveIncidents(tenantId);
  const match = matchTicketToIncident(ctoId, active);
  if (!match) return { suppressed: false };

  await ports.suppressTicket(tenantId, ticket.id, match.id, buildSuppressionNote(match.id));
  return { suppressed: true, incidentId: match.id };
}
