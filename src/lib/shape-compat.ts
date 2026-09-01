/**
 * F1-03 — Compat de shape entre o Supabase (snake_case, centavos, ISO) e as telas
 * legadas (Firestore-shape: `amount` em reais, `mrr`, `plan`, `subject`, datas `{seconds}`).
 *
 * ADICIONA aliases sem remover os campos reais — quem já lê snake_case (ex.: MapPage lê
 * `latitude`/`used_ports`) não é afetado. Aplicado na fronteira do store (`supabaseDb.fetchAndNotify`).
 */
export function toTs(iso?: string | null): { seconds: number } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : { seconds: Math.floor(ms / 1000) };
}

export function applyShapeCompat(table: string, rows: any[]): any[] {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const o: any = { ...r };
    if (o.createdAt === undefined && r.created_at) o.createdAt = toTs(r.created_at);
    if (o.updatedAt === undefined && r.updated_at) o.updatedAt = toTs(r.updated_at);
    switch (table) {
      case 'customers':
        if (o.mrr === undefined && r.mrr_cents != null) o.mrr = r.mrr_cents / 100;
        if (o.plan === undefined && r.plan_id != null) o.plan = r.plan_id;
        if (o.document === undefined && r.cpf != null) o.document = r.cpf;
        break;
      case 'invoices':
        if (o.amount === undefined && r.amount_cents != null) o.amount = r.amount_cents / 100;
        if (o.customerId === undefined) o.customerId = r.customer_id;
        if (o.dueDate === undefined) o.dueDate = toTs(r.due_date);
        if (o.paidAt === undefined) o.paidAt = toTs(r.paid_at);
        break;
      case 'tickets':
        if (o.subject === undefined && r.title != null) o.subject = r.title;
        if (o.customerId === undefined) o.customerId = r.customer_id;
        if (o.aiHandled === undefined) o.aiHandled = r.resolved_by_ai;
        break;
      case 'service_orders':
        if (o.lat === undefined) o.lat = r.latitude;
        if (o.lng === undefined) o.lng = r.longitude;
        if (o.assignedTo === undefined) o.assignedTo = r.assigned_to;
        if (o.customerName === undefined) o.customerName = r.customer_name;
        if (o.customerId === undefined) o.customerId = r.customer_id;
        break;
      case 'network_ctos':
        if (o.usedPorts === undefined && r.used_ports != null) o.usedPorts = r.used_ports;
        if (o.totalPorts === undefined && r.total_ports != null) o.totalPorts = r.total_ports;
        break;
    }
    return o;
  });
}
