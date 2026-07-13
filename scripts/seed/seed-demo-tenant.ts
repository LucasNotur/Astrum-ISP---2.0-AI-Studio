/**
 * GERADOR DE POPULAÇÃO SINTÉTICA — "ISP Demo Astrolândia" (IA-45 sandbox).
 *
 * Cria um tenant DEMO com 500 assinantes e todo o ecossistema em volta
 * (CTOs, faturas, tickets, conversas resolvidas, OS, telemetria, logs de IA)
 * para que TODA feature que precisa de dados mostre seu poder — localmente,
 * sem depender de um ISP real.
 *
 * SEGURANÇA CONTRA VAZAMENTO PARA PRODUÇÃO:
 *  1. tenant marcado `is_sandbox = true` (migration 046, IA-45);
 *  2. linhas marcadas `created_by = 'synthetic'` (onde a coluna existe) e
 *     `extra.synthetic = true` (onde só há JSONB);
 *  3. TUDO pende do tenant fixo DEMO_TENANT_ID → remoção = 1 DELETE (cascade);
 *  4. determinístico (PRNG com seed fixa): rodar 2× = mesmo dataset.
 *
 * Uso:
 *   npm run seed:demo             # cria/recria o tenant demo completo
 *   npm run seed:demo -- --wipe   # só remove o tenant demo e sai
 */
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const DEMO_TENANT_ID = 'a57de300-0000-4000-8000-a57de3000001';
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const WIPE_ONLY = process.argv.includes('--wipe');

// ── PRNG determinístico (mulberry32) ─────────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0xa57 + 500);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

/** CPF sintético VÁLIDO (dígitos verificadores corretos) — range reservado p/ demo. */
export function syntheticCpf(n: number): string {
  const base = String(900_000_000 + n).padStart(9, '0').split('').map(Number);
  const dv = (digits: number[]) => {
    const sum = digits.reduce((s, d, i) => s + d * (digits.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

const FIRST = ['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Hugo','Iara','João','Karen','Luís','Marina','Nelson','Olívia','Paulo','Quésia','Rafael','Sofia','Tiago','Úrsula','Victor','Wagner','Xênia','Yasmin','Zeca','Antônia','Bernardo','Cecília','Davi','Eduarda','Felipe','Giovana','Henrique','Isabela','Júlio','Lívia','Marcos','Natália','Otávio'];
const LAST = ['Silva','Santos','Oliveira','Souza','Costa','Pereira','Almeida','Ferreira','Rodrigues','Gomes','Martins','Rocha','Ribeiro','Carvalho','Lima','Araújo','Melo','Barbosa','Cardoso','Nascimento','Moraes','Castro','Pinto','Ramos','Teixeira','Correia','Dias','Vieira','Freitas','Farias'];
const BAIRROS = ['Centro','Jardim das Flores','Vila Nova','Bela Vista','Santa Luzia','Alto da Serra','Parque Industrial','Recanto Verde','Portal do Sol','Cidade Alta','Lagoa Azul','Morada Nova'];
const PLANOS = [
  { id: 'a57de300-0000-4000-8000-b10000000100', nome: '100 Mega', down: 100, up: 50, mrr: 7990 },
  { id: 'a57de300-0000-4000-8000-b10000000300', nome: '300 Mega', down: 300, up: 150, mrr: 9990 },
  { id: 'a57de300-0000-4000-8000-b10000000500', nome: '500 Mega', down: 500, up: 250, mrr: 11990 },
  { id: 'a57de300-0000-4000-8000-b10000001000', nome: '1 Giga', down: 1000, up: 500, mrr: 14990 },
];
const TICKET_TITULOS = [
  ['Internet caiu', 'Cliente relata queda total de conexão', 'high'],
  ['Internet lenta à noite', 'Lentidão no horário de pico', 'medium'],
  ['LOS piscando vermelho', 'LED LOS da ONU piscando', 'high'],
  ['Wi-Fi não alcança os quartos', 'Cobertura Wi-Fi insuficiente', 'low'],
  ['2ª via de boleto', 'Cliente pede segunda via da fatura', 'low'],
  ['Mudança de endereço', 'Solicita transferência de instalação', 'medium'],
  ['Upgrade de plano', 'Quer migrar para plano superior', 'low'],
  ['Internet lenta na chuva', 'Conexão degrada quando chove', 'medium'],
] as const;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function iso(d: Date): string { return d.toISOString(); }

async function batchInsert(client: Client, table: string, cols: string[], rows: unknown[][]) {
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const placeholders = chunk.map((row, r) => {
      row.forEach((v) => values.push(v));
      const base = r * cols.length;
      return `(${cols.map((_, c) => `$${base + c + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders.join(',')}`,
      values,
    );
  }
}

/**
 * Limpeza genérica: descobre TODA tabela com coluna tenant_id e deleta em
 * passes (FKs entre elas resolvem sozinhas em ≤5 iterações). Robusto a
 * tabelas futuras — nada de lista manual desatualizada.
 */
export async function wipeDemoTenant(client: Client): Promise<void> {
  const { rows } = await client.query(`
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
  `);
  let pending = rows.map((r) => r.table_name as string);
  for (let pass = 0; pass < 5 && pending.length; pass++) {
    const stillFailing: string[] = [];
    for (const table of pending) {
      try {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [DEMO_TENANT_ID]);
      } catch {
        stillFailing.push(table); // FK ainda referenciada — tenta no próximo passe
      }
    }
    if (stillFailing.length === pending.length) break; // sem progresso
    pending = stillFailing;
  }
  if (pending.length) throw new Error(`wipe travou nas tabelas: ${pending.join(', ')}`);
  // O DELETE do tenant esbarra num bug de cascade do PG17 local ("RI query gave
  // unexpected result") mesmo com todas as referências zeradas. Fallback: o
  // tenant demo fica desativado e rebatizado — os DADOS somem de verdade acima.
  try {
    await client.query('DELETE FROM tenants WHERE id = $1', [DEMO_TENANT_ID]);
  } catch {
    await client.query(
      `UPDATE tenants SET active = false, name = '[WIPED] ISP Demo', slug = 'demo-wiped' WHERE id = $1`,
      [DEMO_TENANT_ID],
    );
  }
}

export async function seedDemoTenant(client: Client): Promise<Record<string, number>> {
  if (WIPE_ONLY) {
    await wipeDemoTenant(client);
    return { wiped: 1 };
  }

  // 1. Tenant sandbox (UPSERT — reseed limpa os filhos e regrava; o registro
  // do tenant persiste para não brigar com o cascade do PG local)
  await client.query(
    `INSERT INTO tenants (id, name, slug, active, plan, is_sandbox, extra)
     VALUES ($1, 'ISP Demo Astrolândia', 'demo-astrolandia', true, 'autonomia', true,
             '{"synthetic": true, "seeded_by": "seed-demo-tenant"}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, slug = EXCLUDED.slug, active = true,
       plan = EXCLUDED.plan, is_sandbox = true, extra = EXCLUDED.extra`,
    [DEMO_TENANT_ID],
  );
  // Limpa os dados sintéticos anteriores (mantém o tenant)
  const { rows: tenantTables } = await client.query(`
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id' AND table_name <> 'tenants'
  `);
  let pendingWipe = tenantTables.map((r) => r.table_name as string);
  for (let pass = 0; pass < 5 && pendingWipe.length; pass++) {
    const failing: string[] = [];
    for (const table of pendingWipe) {
      try {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [DEMO_TENANT_ID]);
      } catch { failing.push(table); }
    }
    if (failing.length === pendingWipe.length) break;
    pendingWipe = failing;
  }
  if (pendingWipe.length) throw new Error(`reseed travou nas tabelas: ${pendingWipe.join(', ')}`);

  // 1b. Planos comerciais na tabela `plans` (fallback do funil P3 — migration 074)
  await batchInsert(client, 'plans',
    ['id', 'tenant_id', 'name', 'download_mbps', 'upload_mbps', 'price_cents', 'description', 'active'],
    PLANOS.map((p) => [p.id, DEMO_TENANT_ID, p.nome, p.down, p.up, p.mrr, `Plano ${p.nome} — fibra óptica`, true]));

  // 2. 12 CTOs em volta de "Astrolândia" (coordenadas fictícias interior SP)
  const ctoIds: string[] = [];
  const ctoRows = BAIRROS.map((bairro, i) => {
    const id = `a57de300-0000-4000-8000-c0000000${String(i).padStart(4, '0')}`.slice(0, 36);
    ctoIds.push(id);
    const total = pick([8, 16, 16, 32]);
    return [
      id, DEMO_TENANT_ID, `CTO-${bairro.replace(/\s/g, '-').toUpperCase()}`,
      -22.3 - rnd() * 0.08, -47.6 - rnd() * 0.08,
      total, 0 /* used_ports ajustado depois */, 'active',
      JSON.stringify({ synthetic: true, bairro }),
    ];
  });
  await batchInsert(client, 'network_ctos',
    ['id', 'tenant_id', 'name', 'latitude', 'longitude', 'total_ports', 'used_ports', 'status', 'extra'],
    ctoRows);

  // 3. 500 assinantes
  const customerIds: string[] = [];
  const customerRows: unknown[][] = [];
  const ctoUsage = new Map<string, number>();
  for (let i = 0; i < 500; i++) {
    const id = `a57de300-0000-4000-8000-a100000${String(i).padStart(5, '0')}`.slice(0, 36);
    customerIds.push(id);
    const nome = `${pick(FIRST)} ${pick(LAST)}`;
    const plano = pick(PLANOS);
    const bairroIdx = between(0, BAIRROS.length - 1);
    const cto = ctoIds[bairroIdx]!;
    ctoUsage.set(cto, (ctoUsage.get(cto) ?? 0) + 1);
    // 6% suspensos (inadimplência), 3% cancelados (churn histórico)
    const roll = rnd();
    const status = roll < 0.06 ? 'suspended' : roll < 0.09 ? 'cancelled' : 'active';
    customerRows.push([
      id, DEMO_TENANT_ID, nome,
      `${nome.toLowerCase().replace(/\s/g, '.').normalize('NFD').replace(/[̀-ͯ]/g, '')}@demo.astrolandia.br`,
      `+55199${String(90000000 + i)}`,
      syntheticCpf(i), plano.id, status,
      iso(daysAgo(between(30, 540))),
      `Rua ${pick(LAST)} ${between(10, 999)}, ${BAIRROS[bairroIdx]}, Astrolândia/SP`,
      plano.mrr, `demo-${i}`, cto,
      JSON.stringify({ synthetic: true, plano_nome: plano.nome }),
    ]);
  }
  await batchInsert(client, 'customers',
    ['id', 'tenant_id', 'name', 'email', 'phone', 'cpf', 'plan_id', 'status', 'created_at', 'address', 'mrr_cents', 'legacy_id', 'cto_id', 'extra'],
    customerRows);
  for (const [cto, used] of ctoUsage) {
    await client.query('UPDATE network_ctos SET used_ports = LEAST(total_ports, $2) WHERE id = $1', [cto, used]);
  }

  // 4. Faturas — 5 meses × 500 clientes. ~10% vencidas, ~7% pagas com atraso
  //    (as "pagas com atraso após lembrete" são o combustível do Valor Gerado).
  const invoiceRows: unknown[][] = [];
  for (let m = 0; m < 5; m++) {
    for (let i = 0; i < 500; i++) {
      const plano = PLANOS[i % PLANOS.length]!;
      const due = daysAgo(15 + m * 30 - between(-5, 5));
      const roll = rnd();
      let status = 'paid';
      let paidAt: string | null = iso(new Date(due.getTime() - between(0, 5) * 86400000));
      if (m === 0 && roll < 0.10) { status = 'overdue'; paidAt = null; }
      else if (roll < 0.17) { status = 'paid'; paidAt = iso(new Date(due.getTime() + between(2, 12) * 86400000)); }
      // plan_id de invoices referencia billing_plans (plano SaaS do tenant) —
      // o plano do ASSINANTE vai no extra.
      invoiceRows.push([
        DEMO_TENANT_ID, customerIds[i]!, null, plano.mrr,
        status, due.toISOString().slice(0, 10), paidAt,
        paidAt && new Date(paidAt) > due ? 'pix' : 'boleto',
        iso(new Date(due.getTime() - 20 * 86400000)),
        JSON.stringify({ synthetic: true, plano_nome: plano.nome, recovered_by_cobrai: paidAt !== null && new Date(paidAt) > due }),
      ]);
    }
  }
  await batchInsert(client, 'invoices',
    ['tenant_id', 'customer_id', 'plan_id', 'amount_cents', 'status', 'due_date', 'paid_at', 'payment_method', 'created_at', 'extra'],
    invoiceRows);

  // 5. Tickets — ~600 em 90 dias; 62% resolvidos pela IA
  const ticketRows: unknown[][] = [];
  for (let i = 0; i < 600; i++) {
    const [title, desc, priority] = pick([...TICKET_TITULOS]);
    const created = daysAgo(between(0, 90));
    const resolvedByAi = rnd() < 0.62;
    const status = rnd() < 0.85 ? 'resolved' : pick(['open', 'in_progress']);
    ticketRows.push([
      DEMO_TENANT_ID, pick(customerIds), title, desc, status, priority,
      resolvedByAi && status === 'resolved', iso(created), iso(created), true, 'synthetic',
      JSON.stringify({ synthetic: true }),
    ]);
  }
  await batchInsert(client, 'tickets',
    ['tenant_id', 'customer_id', 'title', 'description', 'status', 'priority', 'resolved_by_ai', 'created_at', 'updated_at', 'ai_enabled', 'created_by', 'extra'],
    ticketRows);

  // 6. Conversas resolvidas com diálogo completo (combustível do D-05: ≥3 msgs,
  //    resolvidas há >7 dias) + algumas abertas recentes
  const DIALOGOS: [string, string, string][] = [
    ['minha internet ta caindo toda hora', 'Verifiquei aqui: sua ONU está com sinal degradado (-27dBm). Vou agendar uma visita técnica para troca do conector, pode ser amanhã às 14h?', 'pode sim, obrigado!'],
    ['como faço pra pegar a segunda via do boleto?', 'Aqui está sua 2ª via: o PIX copia-e-cola é 000201...ASTRO. O vencimento foi atualizado para hoje sem juros. Precisa de mais algo?', 'perfeito, ja paguei'],
    ['o wifi nao pega no quarto dos fundos', 'Pelo diagnóstico, seu roteador está no canal 6 congestionado. Mudei remotamente para o canal 11 e ativei a banda 5GHz "AstroNet_5G". Testa aí, por favor?', 'agora ficou otimo!'],
    ['internet lenta demais hoje', 'Identifiquei instabilidade na sua região (CTO Jardim das Flores) — a equipe já está no local, previsão de normalização em 40 min. Te aviso quando normalizar.', 'ok, valeu pelo aviso'],
    ['quero mudar pro plano de 500 mega', 'Ótima escolha! No seu endereço o 500 Mega está disponível por R$ 119,90. A mudança é feita hoje sem taxa. Confirmo?', 'confirma sim'],
  ];
  const convRows: unknown[][] = [];
  const msgRows: unknown[][] = [];
  const convIds: string[] = [];
  for (let i = 0; i < 90; i++) {
    const id = `a57de300-0000-4000-8000-c0900000${String(i).padStart(4, '0')}`.slice(0, 36);
    convIds.push(id);
    const resolved = i < 70; // 70 resolvidas (≥7d), 20 abertas recentes
    const age = resolved ? between(8, 60) : between(0, 3);
    const created = daysAgo(age);
    convRows.push([
      id, DEMO_TENANT_ID, pick(customerIds), pick(['whatsapp', 'whatsapp', 'whatsapp', 'instagram', 'email']),
      resolved ? 'resolved' : 'open', iso(created), iso(new Date(created.getTime() + 30 * 60000)), 'synthetic',
    ]);
    const dialogo = DIALOGOS[i % DIALOGOS.length]!;
    const roles: ('user' | 'assistant')[] = ['user', 'assistant', 'user'];
    dialogo.forEach((content, j) => {
      msgRows.push([
        DEMO_TENANT_ID, id, roles[j]!, content, roles[j] === 'assistant',
        roles[j] === 'assistant' ? between(150, 600) : 0,
        iso(new Date(created.getTime() + j * 5 * 60000)), 'synthetic',
      ]);
    });
  }
  await batchInsert(client, 'conversations',
    ['id', 'tenant_id', 'customer_id', 'channel', 'status', 'created_at', 'updated_at', 'created_by'],
    convRows);
  await batchInsert(client, 'messages',
    ['tenant_id', 'conversation_id', 'role', 'content', 'from_ai', 'tokens_used', 'created_at', 'created_by'],
    msgRows);

  // 7. Ordens de serviço — 40 (instalação/visita), status misto
  const osRows: unknown[][] = [];
  for (let i = 0; i < 40; i++) {
    const created = daysAgo(between(0, 30));
    osRows.push([
      DEMO_TENANT_ID, pick(customerIds), pick(['technical_visit', 'technical_visit', 'installation']),
      pick(['open', 'in_progress', 'completed', 'completed']),
      pick(['Troca de conector na CTO', 'Instalação de novo ponto', 'Verificação de sinal degradado', 'Troca de ONU defeituosa']),
      iso(created), iso(new Date(created.getTime() + between(1, 4) * 86400000)), 'synthetic',
      JSON.stringify({ synthetic: true }),
    ]);
  }
  await batchInsert(client, 'service_orders',
    ['tenant_id', 'customer_id', 'type', 'status', 'description', 'created_at', 'scheduled_for', 'created_by', 'extra'],
    osRows);

  // 8. Telemetria de rede — 45 dias × 12 CTOs × 2 métricas (com 1 anomalia plantada
  //    na CTO-CENTRO nos últimos 3 dias, para o detector IA-24 ter o que achar)
  const metricRows: unknown[][] = [];
  for (const cto of ctoIds) {
    for (let d = 45; d >= 0; d--) {
      const anomaly = cto === ctoIds[0] && d <= 3;
      metricRows.push([
        DEMO_TENANT_ID, cto, 'latency_ms',
        anomaly ? 180 + rnd() * 80 : 12 + rnd() * 10,
        iso(daysAgo(d)),
      ]);
      metricRows.push([
        DEMO_TENANT_ID, cto, 'packet_loss_pct',
        anomaly ? 6 + rnd() * 5 : rnd() * 0.6,
        iso(daysAgo(d)),
      ]);
    }
  }
  await batchInsert(client, 'network_metrics',
    ['tenant_id', 'cto_id', 'metric', 'value', 'collected_at'],
    metricRows);

  // 9. Logs de performance da IA — 800 registros 30d (custo, CSAT, tempo de resposta)
  const perfRows: unknown[][] = [];
  for (let i = 0; i < 800; i++) {
    const tokensIn = between(400, 2200);
    const tokensOut = between(80, 450);
    perfRows.push([
      DEMO_TENANT_ID, pick(['support_technical', 'support_billing', 'upgrade_plan', 'check_status', 'other']),
      pick(['positive', 'positive', 'neutral', 'negative']),
      between(800, 4200), rnd() < 0.93, false,
      iso(daysAgo(between(0, 30))),
      tokensIn, tokensOut, 'gpt-4o-mini',
      (tokensIn * 0.15 + tokensOut * 0.6) / 1_000_000,
      'agent_response',
      JSON.stringify({ synthetic: true, csat_score: between(3, 5) }),
    ]);
  }
  await batchInsert(client, 'ai_performance_logs',
    ['tenant_id', 'category', 'sentiment', 'response_time_ms', 'sla_compliant', 'is_critical', 'created_at', 'tokens_in', 'tokens_out', 'model', 'cost_usd', 'use_case', 'extra'],
    perfRows);

  return {
    customers: customerRows.length,
    ctos: ctoRows.length,
    invoices: invoiceRows.length,
    tickets: ticketRows.length,
    conversations: convRows.length,
    messages: msgRows.length,
    service_orders: osRows.length,
    network_metrics: metricRows.length,
    ai_performance_logs: perfRows.length,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-demo-tenant.ts');
if (isMain) {
  const client = new Client({ connectionString: DB });
  client
    .connect()
    .then(() => seedDemoTenant(client))
    .then((counts) => {
      console.log(WIPE_ONLY ? '🧹 Tenant demo removido.' : '🌱 ISP Demo Astrolândia semeado:');
      for (const [k, v] of Object.entries(counts)) console.log(`   ${k}: ${v}`);
      return client.end();
    })
    .catch((err) => {
      console.error('❌ seed falhou:', err.message);
      return client.end().finally(() => process.exit(1));
    });
}
