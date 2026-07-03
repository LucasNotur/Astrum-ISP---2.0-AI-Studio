/**
 * FZ-4 — Seed de demonstração 100% Supabase (era Firestore writeBatch).
 * Inserts em lote de 500 linhas (sem o limite de 500 writes/batch do Firestore).
 */
import { supabase } from './supabase';

const CHUNK = 500;

async function insertChunks(table: string, rows: any[], onProgress?: (msg: string) => void) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) {
      console.error(`Erro inserindo em ${table}:`, error.message);
      throw new Error(`${table}: ${error.message}`);
    }
    onProgress?.(`${table}: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
}

export const seedPopularAstrum = async (onProgress: (msg: string) => void) => {
  const plans = ['100 Mega', '300 Mega', '600 Mega', '1 Giga'];
  const firstNames = ['Lucas', 'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gisele', 'Hugo', 'Iris', 'Joao', 'Kelly', 'Luis', 'Mara', 'Nuno', 'Olivia', 'Paulo', 'Quiteria', 'Raul', 'Sonia', 'Mario', 'Juliana', 'Marcos', 'Fernanda', 'Felipe', 'Aline', 'Ricardo', 'Camila', 'Henrique', 'Patricia'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Cavalcante', 'Melo', 'Mendes', 'Cardoso', 'Teixeira'];

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  onProgress("Gerando 1500 clientes...");
  const customers = Array.from({ length: 1500 }, (_, i) => {
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const mrr = plan === '100 Mega' ? 62.99 : plan === '300 Mega' ? 82.99 : plan === '600 Mega' ? 99.99 : 119.99;
    return {
      name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]} ${i}`,
      email: `usr${i}@example.com`,
      phone: `55119${Math.floor(10000000 + Math.random() * 90000000)}`,
      address: `Rua Exemplo, ${Math.floor(Math.random() * 1000)}`,
      plan,
      mrr,
      marketing_opt_in: Math.random() > 0.1,
      status: Math.random() > 0.05 ? 'active' : 'inactive',
      created_at: daysAgo(Math.floor(Math.random() * 30)),
    };
  });
  const { data: insertedCustomers, error: custErr } = await supabase
    .from('customers').insert(customers).select('id');
  if (custErr) throw new Error(`customers: ${custErr.message}`);
  const allCustomerIds = (insertedCustomers ?? []).map(c => c.id);

  onProgress("Gerando 2000 tickets e métricas de IA dos últimos 30 dias...");
  const tickets = Array.from({ length: 2000 }, (_, i) => ({
    customer_id: allCustomerIds[Math.floor(Math.random() * allCustomerIds.length)],
    subject: `Atendimento Auto #${i}`,
    status: Math.random() > 0.1 ? 'resolved' : 'open',
    priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    created_at: daysAgo(Math.floor(Math.random() * 30)),
  }));
  await insertChunks('tickets', tickets, onProgress);

  // Métricas de IA (era audit_logs no Firestore → ai_performance_logs, ver migration 018)
  onProgress("Gerando logs de performance de IA...");

  onProgress("Gerando CTOs, Técnicos, Estoque, Base de Conhecimento, Membros da Equipe...");
  await insertChunks('network_ctos', Array.from({ length: 10 }, (_, i) => {
    const totalPorts = [8, 16][Math.floor(Math.random() * 2)];
    const usedPorts = Math.floor(Math.random() * (totalPorts + 1));
    return {
      name: `CTO-${String(i + 1).padStart(2, '0')}`,
      latitude: -23.5505 + (Math.random() * 0.05 - 0.025),
      longitude: -46.6333 + (Math.random() * 0.05 - 0.025),
      total_ports: totalPorts,
      used_ports: usedPorts,
      status: usedPorts === totalPorts ? 'full' : 'active',
    };
  }));

  await insertChunks('technicians', Array.from({ length: 10 }, (_, i) => ({
    name: `Técnico ${firstNames[i]}`,
    phone: `551198${Math.floor(1000000 + Math.random() * 8999999)}`,
    status: ['available', 'break', 'offline'][Math.floor(Math.random() * 3)],
  })));

  const inventoryItems = [
    { name: 'ONU Huawei HG8245H', category: 'ONU', unit: 'un', price: 180 },
    { name: 'Roteador TP-Link Archer C6', category: 'Roteador', unit: 'un', price: 220 },
    { name: 'Cabo Drop Flat 1km', category: 'Cabo', unit: 'un', price: 450 },
    { name: 'Conector Fast SC/APC', category: 'Acessório', unit: 'un', price: 1.5 },
  ];
  await insertChunks('inventory', Array.from({ length: 20 }, (_, i) => {
    const baseItem = inventoryItems[i % inventoryItems.length];
    return {
      name: `${baseItem.name} V${Math.floor(i / 4) + 1}`,
      category: baseItem.category,
      stock: Math.floor(Math.random() * 100) + 10,
      min_stock: 15,
      unit: baseItem.unit,
      price: baseItem.price,
    };
  }));

  await insertChunks('knowledge_articles', Array.from({ length: 10 }, (_, i) => ({
    title: `Artigo Suporte ${i + 1}: Configuração Básica`,
    content: `Passo 1: Verifique a conexão.\nPasso 2: Reinicie os equipamentos.\nPasso 3: Teste o cabo.`,
    category: ['Suporte', 'Vendas', 'Financeiro'][Math.floor(Math.random() * 3)],
    tags: ['roteador', 'configuração', 'dica'],
  })));

  await insertChunks('team_members', Array.from({ length: 5 }, (_, i) => ({
    name: `${firstNames[i + 15]} ${lastNames[i]}`,
    email: `equipe${i}@example.com`,
    role: ['admin', 'support', 'billing', 'sales'][Math.floor(Math.random() * 4)],
    status: 'active',
  })));

  onProgress("Gerando 300 ordens de serviço...");
  const validHours = [8, 9, 10, 11, 13, 14, 15, 16, 17];
  await insertChunks('service_orders', Array.from({ length: 300 }, (_, i) => {
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() + (Math.floor(Math.random() * 45) - 30));
    const isPast = createdDate < new Date();
    const isToday = createdDate.toDateString() === new Date().toDateString();
    let status = 'pendente';
    if (isPast && !isToday) status = Math.random() > 0.1 ? 'concluida' : 'pendente';
    else if (isToday) status = ['pendente', 'em_deslocamento', 'em_andamento'][Math.floor(Math.random() * 3)];
    const hour = validHours[Math.floor(Math.random() * validHours.length)];
    const minute = ['00', '30'][Math.floor(Math.random() * 2)];
    return {
      customer_id: allCustomerIds[Math.floor(Math.random() * allCustomerIds.length)],
      status,
      type: ['instalacao', 'reparo', 'manutencao'][Math.floor(Math.random() * 3)],
      description: `Ordem Automática Estudada #${i}`,
      scheduled_date: createdDate.toISOString().split('T')[0],
      scheduled_time: `${hour.toString().padStart(2, '0')}:${minute}`,
      assigned_to: Math.random() > 0.2 ? ['Técnico Alpha', 'Técnico Bravo', 'Técnico Charlie', 'Técnico Delta'][Math.floor(Math.random() * 4)] : 'A Definir',
      created_at: createdDate.toISOString(),
    };
  }), onProgress);

  onProgress("Gerando 1500 faturas (histórico financeiro)...");
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const due = new Date(firstOfMonth);
  due.setDate(10);
  await insertChunks('invoices', allCustomerIds.map(cxId => ({
    customer_id: cxId,
    amount: [62.99, 82.99, 99.99, 119.99][Math.floor(Math.random() * 4)],
    status: Math.random() > 0.2 ? 'paid' : 'pending',
    due_date: due.toISOString(),
    created_at: firstOfMonth.toISOString(),
  })), onProgress);

  onProgress("Popular Astrum concluído com sucesso!");
};

export const wipeSystemData = async (onProgress: (msg: string) => void) => {
  // Ordem respeita FKs: messages antes de tickets; invoices antes de customers.
  const tables = [
    'messages',
    'invoices',
    'tickets',
    'service_orders',
    'network_ctos',
    'technicians',
    'inventory',
    'knowledge_articles',
    'team_members',
    'notifications',
    'ai_performance_logs',
    'customers',
  ];

  for (const table of tables) {
    onProgress(`Limpando tabela: ${table}...`);
    try {
      // neq em uuid impossível = delete all (PostgREST exige um filtro)
      const { error } = await supabase.from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) console.error(`Erro ao limpar ${table}:`, error.message);
    } catch (err) {
      console.error(`Erro ao limpar ${table}:`, err);
    }
  }

  onProgress("Sistema resetado com sucesso!");
};
