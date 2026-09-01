/**
 * F1-03 — Seed de demonstração (Rio de Janeiro) via apps/api.
 *
 * Substitui o `src/lib/seedAstrum.ts` legado, que estava MORTO no arquiteto atual:
 * rodava pelo client anônimo (sem grant de INSERT desde a migration 092), não setava
 * `tenant_id`, e inseria colunas inexistentes (`amount`, `plan`, `mrr`, `subject`,
 * `scheduled_date`, `price`). Aqui as linhas batem com o schema real do Supabase e são
 * escritas via `supabaseAdmin` (service role) escopadas por `tenant_id` do JWT.
 *
 * Builders são PUROS (sem DB) — geram `id` client-side (sem FK enforced nessas tabelas),
 * o que torna as dependências (OS/faturas/tickets → cliente) determinísticas e testáveis.
 */
import { randomUUID } from 'crypto';

export const RIO_NEIGHBORHOODS = [
  { name: 'Centro',      lat: -22.9068, lng: -43.1789 },
  { name: 'Flamengo',    lat: -22.9324, lng: -43.1755 },
  { name: 'Botafogo',    lat: -22.9519, lng: -43.1808 },
  { name: 'Copacabana',  lat: -22.9711, lng: -43.1822 },
  { name: 'Ipanema',     lat: -22.9838, lng: -43.2096 },
  { name: 'Tijuca',      lat: -22.9249, lng: -43.2277 },
  { name: 'Vila Isabel', lat: -22.9146, lng: -43.2470 },
  { name: 'Méier',       lat: -22.9026, lng: -43.2795 },
] as const;

const RIO_STREETS = [
  'Rua Barata Ribeiro', 'Av. N. S. de Copacabana', 'Rua Voluntários da Pátria',
  'Rua Conde de Bonfim', 'Av. Maracanã', 'Rua Uruguai', 'Rua Dias da Cruz',
  'Av. Atlântica', 'Rua Visconde de Pirajá', 'Rua do Catete',
];

const FIRST_NAMES = ['Lucas', 'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gisele', 'Hugo', 'Iris', 'Joao', 'Kelly', 'Luis', 'Mara', 'Nuno', 'Olivia', 'Paulo', 'Quiteria', 'Raul', 'Sonia', 'Mario', 'Juliana', 'Marcos', 'Fernanda', 'Felipe', 'Aline', 'Ricardo', 'Camila', 'Henrique', 'Patricia'];
const LAST_NAMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'];

const PLANS: Array<{ label: string; mrrCents: number }> = [
  { label: '100 Mega', mrrCents: 6299 },
  { label: '300 Mega', mrrCents: 8299 },
  { label: '600 Mega', mrrCents: 9999 },
  { label: '1 Giga',   mrrCents: 11999 },
];

// Utilitários (Math.random é aceitável aqui — código de serviço Node, não Workflow).
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: readonly T[]): T => arr[rnd(arr.length)]!;
const jitter = (base: number) => base + (Math.random() * 0.012 - 0.006);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export interface DemoCustomer {
  id: string; tenant_id: string; name: string; email: string; phone: string;
  address: string; plan_id: string; mrr_cents: number; status: string; created_at: string;
}

export function buildCustomers(tenantId: string, n = 1500): DemoCustomer[] {
  return Array.from({ length: n }, (_, i) => {
    const plan = pick(PLANS);
    const nb = pick(RIO_NEIGHBORHOODS);
    return {
      id: randomUUID(),
      tenant_id: tenantId,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${i}`,
      email: `demo${i}.${randomUUID().slice(0, 6)}@exemplo-demo.astrum`,
      phone: `55219${String(10000000 + rnd(90000000))}`,
      address: `${pick(RIO_STREETS)}, ${rnd(2000) + 1} - ${nb.name}, Rio de Janeiro/RJ`,
      plan_id: plan.label,
      mrr_cents: plan.mrrCents,
      status: Math.random() > 0.05 ? 'active' : 'inactive',
      created_at: daysAgoISO(rnd(30)),
    };
  });
}

export function buildCtos(tenantId: string, count = 10): any[] {
  return Array.from({ length: count }, (_, i) => {
    const totalPorts = pick([8, 16]);
    const usedPorts = rnd(totalPorts + 1);
    const nb = RIO_NEIGHBORHOODS[i % RIO_NEIGHBORHOODS.length]!;
    return {
      id: randomUUID(),
      tenant_id: tenantId,
      name: `CTO-${String(i + 1).padStart(2, '0')}-${nb.name}`,
      latitude: jitter(nb.lat),
      longitude: jitter(nb.lng),
      total_ports: totalPorts,
      used_ports: usedPorts,
      status: usedPorts === totalPorts ? 'full' : 'active',
    };
  });
}

export function buildTechnicians(tenantId: string, count = 10): any[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    tenant_id: tenantId,
    name: `Técnico ${FIRST_NAMES[i % FIRST_NAMES.length]!}`,
    phone: `552198${String(1000000 + rnd(8999999))}`,
    status: pick(['available', 'break', 'offline']),
  }));
}

export function buildInventory(tenantId: string, count = 20): any[] {
  const base = [
    { name: 'ONU Huawei HG8245H', category: 'ONU', unit: 'un', priceCents: 18000 },
    { name: 'Roteador TP-Link Archer C6', category: 'Roteador', unit: 'un', priceCents: 22000 },
    { name: 'Cabo Drop Flat 1km', category: 'Cabo', unit: 'un', priceCents: 45000 },
    { name: 'Conector Fast SC/APC', category: 'Acessório', unit: 'un', priceCents: 150 },
  ];
  return Array.from({ length: count }, (_, i) => {
    const b = base[i % base.length]!;
    return {
      tenant_id: tenantId,
      name: `${b.name} V${Math.floor(i / base.length) + 1}`,
      category: b.category,
      stock: rnd(100) + 10,
      min_stock: 15,
      unit: b.unit,
      price_cents: b.priceCents,
    };
  });
}

export function buildKnowledge(tenantId: string, count = 10): any[] {
  return Array.from({ length: count }, (_, i) => ({
    tenant_id: tenantId,
    title: `Artigo Suporte ${i + 1}: Configuração Básica`,
    content: 'Passo 1: Verifique a conexão.\nPasso 2: Reinicie os equipamentos.\nPasso 3: Teste o cabo.',
    category: pick(['Suporte', 'Vendas', 'Financeiro']),
    tags: ['roteador', 'configuração', 'dica'],
  }));
}

export function buildTeam(tenantId: string, count = 5): any[] {
  return Array.from({ length: count }, (_, i) => ({
    tenant_id: tenantId,
    name: `${FIRST_NAMES[(i + 15) % FIRST_NAMES.length]!} ${LAST_NAMES[i % LAST_NAMES.length]!}`,
    email: `equipe${i}.${randomUUID().slice(0, 6)}@exemplo-demo.astrum`,
    role: pick(['admin', 'support', 'billing', 'sales']),
    status: 'active',
  }));
}

export function buildTickets(tenantId: string, customerIds: string[], n = 2000): any[] {
  return Array.from({ length: n }, (_, i) => {
    const resolved = Math.random() > 0.1;
    return {
      tenant_id: tenantId,
      customer_id: pick(customerIds),
      title: `Atendimento #${i}`,
      status: resolved ? 'resolved' : 'open',
      priority: pick(['low', 'medium', 'high']),
      resolved_by_ai: resolved && Math.random() > 0.4,
      created_at: daysAgoISO(rnd(30)),
    };
  });
}

const VALID_HOURS = [8, 9, 10, 11, 13, 14, 15, 16, 17];

export function buildServiceOrders(
  tenantId: string,
  customers: Array<{ id: string; name: string }>,
  n = 300,
): any[] {
  return Array.from({ length: n }, (_, i) => {
    // janela de -30 a +15 dias (agenda passada + futura)
    const created = new Date(Date.now() + (rnd(45) - 30) * 86400000);
    const isPast = created < new Date();
    const isToday = created.toDateString() === new Date().toDateString();
    let status = 'pendente';
    if (isPast && !isToday) status = Math.random() > 0.1 ? 'concluida' : 'pendente';
    else if (isToday) status = pick(['pendente', 'em_deslocamento', 'em_andamento']);
    const nb = pick(RIO_NEIGHBORHOODS);
    const cx = pick(customers);
    const hour = pick(VALID_HOURS);
    const minute = pick([0, 30]);
    const scheduledFor = new Date(created);
    scheduledFor.setHours(hour, minute, 0, 0);
    return {
      tenant_id: tenantId,
      customer_id: cx.id,
      customer_name: cx.name,
      type: pick(['instalacao', 'reparo', 'manutencao']),
      status,
      description: `Ordem de serviço #${i}`,
      latitude: jitter(nb.lat),
      longitude: jitter(nb.lng),
      address: `${pick(RIO_STREETS)}, ${rnd(2000) + 1} - ${nb.name}, Rio de Janeiro/RJ`,
      scheduled_for: scheduledFor.toISOString(),
      created_at: created.toISOString(),
    };
  });
}

export function buildInvoices(
  tenantId: string,
  customers: Array<{ id: string; mrr_cents: number }>,
  months = 3,
): any[] {
  const rows: any[] = [];
  const now = new Date();
  for (const cx of customers) {
    for (let m = 0; m < months; m++) {
      const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const dueD = new Date(ref); dueD.setDate(10);
      let status: string;
      if (m === 0) {
        status = Math.random() > 0.35 ? 'paid' : 'pending';           // mês corrente
      } else {
        const r = Math.random();                                      // meses passados
        status = r > 0.15 ? 'paid' : r > 0.05 ? 'overdue' : 'pending';
      }
      const paidAt = status === 'paid'
        ? new Date(dueD.getTime() - rnd(8) * 86400000).toISOString()
        : null;
      rows.push({
        tenant_id: tenantId,
        customer_id: cx.id,
        amount_cents: cx.mrr_cents,
        status,
        due_date: dueD.toISOString().split('T')[0],
        paid_at: paidAt,
        created_at: ref.toISOString(),
      });
    }
  }
  return rows;
}

/** Tabelas que o seed popula — ordem de wipe respeita dependências lógicas. */
export const DEMO_TABLES = [
  'invoices', 'tickets', 'service_orders', 'network_ctos',
  'technicians', 'inventory', 'knowledge_articles', 'team_members', 'customers',
] as const;

export interface DemoDataset {
  customers: DemoCustomer[];
  network_ctos: any[];
  technicians: any[];
  inventory: any[];
  knowledge_articles: any[];
  team_members: any[];
  tickets: any[];
  service_orders: any[];
  invoices: any[];
}

/** Monta o dataset completo, com as dependências referenciando os clientes gerados. */
export function buildDemoDataset(tenantId: string, opts: { customers?: number } = {}): DemoDataset {
  const customers = buildCustomers(tenantId, opts.customers ?? 1500);
  return {
    customers,
    network_ctos: buildCtos(tenantId),
    technicians: buildTechnicians(tenantId),
    inventory: buildInventory(tenantId),
    knowledge_articles: buildKnowledge(tenantId),
    team_members: buildTeam(tenantId),
    tickets: buildTickets(tenantId, customers.map((c) => c.id)),
    service_orders: buildServiceOrders(tenantId, customers.map((c) => ({ id: c.id, name: c.name }))),
    invoices: buildInvoices(tenantId, customers.map((c) => ({ id: c.id, mrr_cents: c.mrr_cents }))),
  };
}
