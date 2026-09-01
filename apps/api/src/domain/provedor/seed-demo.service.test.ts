import { describe, it, expect } from 'vitest';
import {
  buildCustomers, buildCtos, buildServiceOrders, buildInvoices,
  buildDemoDataset, RIO_NEIGHBORHOODS,
} from './seed-demo.service';

const TENANT = '11111111-1111-1111-1111-111111111111';

// Rio + jitter (±0.006): todos os bairros caem folgados nestes limites.
const inRioLat = (v: number) => v > -23.01 && v < -22.88;
const inRioLng = (v: number) => v > -43.30 && v < -43.16;

describe('buildCustomers', () => {
  it('gera N clientes com tenant_id, DDD 21 e mrr_cents do plano', () => {
    const rows = buildCustomers(TENANT, 50);
    expect(rows).toHaveLength(50);
    expect(rows.every((c) => c.tenant_id === TENANT)).toBe(true);
    expect(rows.every((c) => c.phone.startsWith('5521'))).toBe(true);
    expect(rows.every((c) => [6299, 8299, 9999, 11999].includes(c.mrr_cents))).toBe(true);
    expect(rows.every((c) => c.address.includes('Rio de Janeiro/RJ'))).toBe(true);
    // ids únicos (referenciáveis pelas dependências)
    expect(new Set(rows.map((c) => c.id)).size).toBe(50);
    // NÃO usa colunas mortas do seed legado
    rows.forEach((c) => {
      expect(c).not.toHaveProperty('plan');
      expect(c).not.toHaveProperty('mrr');
    });
  });
});

describe('buildCtos', () => {
  it('gera CTOs com geo do Rio e portas consistentes', () => {
    const ctos = buildCtos(TENANT);
    expect(ctos).toHaveLength(10);
    ctos.forEach((c) => {
      expect(c.tenant_id).toBe(TENANT);
      expect(inRioLat(c.latitude)).toBe(true);
      expect(inRioLng(c.longitude)).toBe(true);
      expect(c.used_ports).toBeLessThanOrEqual(c.total_ports);
      expect(c.status).toBe(c.used_ports === c.total_ports ? 'full' : 'active');
    });
  });
});

describe('buildServiceOrders', () => {
  it('gera OS com lat/lng no Rio referenciando os clientes', () => {
    const customers = buildCustomers(TENANT, 20);
    const custRef = customers.map((c) => ({ id: c.id, name: c.name }));
    const ids = new Set(custRef.map((c) => c.id));
    const oss = buildServiceOrders(TENANT, custRef, 100);
    expect(oss).toHaveLength(100);
    oss.forEach((os) => {
      expect(os.tenant_id).toBe(TENANT);
      // geo obrigatória — a AUSÊNCIA disso era a raiz do bug do mapa (#7)
      expect(os.latitude).toBeTypeOf('number');
      expect(os.longitude).toBeTypeOf('number');
      expect(inRioLat(os.latitude)).toBe(true);
      expect(inRioLng(os.longitude)).toBe(true);
      expect(ids.has(os.customer_id)).toBe(true);
      expect(os.customer_name).toBeTruthy();
      // schema real: scheduled_for (timestamptz), NÃO scheduled_date/scheduled_time
      expect(os).toHaveProperty('scheduled_for');
      expect(os).not.toHaveProperty('scheduled_date');
    });
  });
});

describe('buildInvoices', () => {
  it('gera 3 faturas/cliente com amount_cents do plano e paid_at coerente', () => {
    const custRef = [
      { id: 'a', mrr_cents: 9999 },
      { id: 'b', mrr_cents: 6299 },
    ];
    const inv = buildInvoices(TENANT, custRef);
    expect(inv).toHaveLength(6); // 2 clientes × 3 meses
    inv.forEach((r) => {
      expect(r.tenant_id).toBe(TENANT);
      expect([9999, 6299]).toContain(r.amount_cents);
      expect(['paid', 'pending', 'overdue']).toContain(r.status);
      // paid ⇒ tem paid_at; não-paid ⇒ paid_at null (feed do /valor.getRecoveredCents)
      if (r.status === 'paid') expect(r.paid_at).toBeTruthy();
      else expect(r.paid_at).toBeNull();
      // schema real: amount_cents, não `amount`
      expect(r).not.toHaveProperty('amount');
    });
    // amount alinhado ao mrr do cliente
    expect(inv.filter((r) => r.customer_id === 'a').every((r) => r.amount_cents === 9999)).toBe(true);
  });
});

describe('buildDemoDataset', () => {
  it('amarra dependentes aos clientes gerados', () => {
    const ds = buildDemoDataset(TENANT, { customers: 30 });
    expect(ds.customers).toHaveLength(30);
    const custIds = new Set(ds.customers.map((c) => c.id));
    expect(ds.invoices).toHaveLength(90); // 30 × 3
    expect(ds.service_orders.every((os) => custIds.has(os.customer_id))).toBe(true);
    expect(ds.tickets.every((t) => custIds.has(t.customer_id))).toBe(true);
    expect(ds.invoices.every((iv) => custIds.has(iv.customer_id))).toBe(true);
    // 8 bairros do Rio disponíveis
    expect(RIO_NEIGHBORHOODS).toHaveLength(8);
  });
});
