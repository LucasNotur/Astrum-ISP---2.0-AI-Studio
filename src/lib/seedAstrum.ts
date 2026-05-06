import { collection, writeBatch, doc, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export const seedPopularAstrum = async (onProgress: (msg: string) => void) => {
  const plans = ['100 Mega', '300 Mega', '600 Mega', '1 Giga'];
  const firstNames = ['Lucas', 'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gisele', 'Hugo', 'Iris', 'Joao', 'Kelly', 'Luis', 'Mara', 'Nuno', 'Olivia', 'Paulo', 'Quiteria', 'Raul', 'Sonia', 'Mario', 'Juliana', 'Marcos', 'Fernanda', 'Felipe', 'Aline', 'Ricardo', 'Camila', 'Henrique', 'Patricia'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Cavalcante', 'Melo', 'Mendes', 'Cardoso', 'Teixeira'];

  onProgress("Inicializando batch writes...");

  let batch = writeBatch(db);
  let opCount = 0;
  
  const commitBatch = async (batchName: string) => {
    if (opCount > 0) {
      try {
        await batch.commit();
      } catch (err) {
        console.error(`Error committing batch ${batchName}:`, err);
        throw err;
      }
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  const checkLimit = async (batchName: string) => {
    if (opCount >= 490) { // Keep under 500 max writes per batch
      await commitBatch(batchName);
    }
  };

  const allCustomerIds: string[] = [];

  onProgress("Gerando 1500 clientes...");
  
  // Create 1500 customers
  for (let i = 0; i < 1500; i++) {
    const custRef = doc(collection(db, 'customers'));
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]} ${i}`;
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const mrr = plan === '100 Mega' ? 62.99 : plan === '300 Mega' ? 82.99 : plan === '600 Mega' ? 99.99 : 119.99;
    
    // Created over the last 30 days
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 30));

    batch.set(custRef, {
      name,
      email: `usr${i}@example.com`,
      phone: `55119${Math.floor(10000000 + Math.random() * 90000000)}`,
      address: `Rua Exemplo, ${Math.floor(Math.random() * 1000)}`,
      plan,
      mrr,
      status: Math.random() > 0.05 ? 'active' : 'inactive',
      createdAt: createdDate
    });
    
    allCustomerIds.push(custRef.id);
    opCount++;
    await checkLimit('customers');
  }

  onProgress("Gerando tickets e histórico dos últimos 30 dias (pode levar alguns segundos)...");
  
  // Create 2000 tickets representing 30 days of standard operations for 1500 customers
  for (let i = 0; i < 2000; i++) {
    const tRef = doc(collection(db, 'tickets'));
    const cxId = allCustomerIds[Math.floor(Math.random() * allCustomerIds.length)];
    
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 30));
    const isResolved = Math.random() > 0.1; // 90% resolved

    batch.set(tRef, {
      customerId: cxId,
      subject: `Atendimento Auto #${i}`,
      status: isResolved ? 'resolved' : 'open',
      priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
      aiHandled: Math.random() > 0.2, // 80% AI resolved/handled initially
      createdAt: createdDate
    });
    opCount++;
    await checkLimit('tickets');

    // Audit Log for created
    const logRef = doc(collection(db, 'audit_logs'));
    batch.set(logRef, {
      action: 'TICKET_CREATED',
      metadata: { ticketId: tRef.id, customerId: cxId },
      timestamp: createdDate
    });
    opCount++;
    await checkLimit('audit_logs_created');
    
    if (isResolved) {
      const logResRef = doc(collection(db, 'audit_logs'));
      const resolvedDate = new Date(createdDate.getTime() + (Math.random() * 86400000)); // Within 24 hours of creation
      batch.set(logResRef, {
        action: 'TICKET_RESOLVED',
        metadata: {
            ticketId: tRef.id, 
            sentiment: ['POSITIVO', 'NEUTRO', 'NEGATIVO'][Math.floor(Math.random() * 3)],
            category: ['SUPORTE_TECNICO', 'FATURA', 'RETENCAO'][Math.floor(Math.random() * 3)],
            responseTime: Math.floor(Math.random() * 120) + 10 // mins
        },
        timestamp: resolvedDate
      });
      opCount++;
      await checkLimit('audit_logs_resolved');
    }
  }

  onProgress("Gerando CTOs, Técnicos, Estoque, Base de Conhecimento, Membros da Equipe...");
  
  // Create 10 CTOs
  const ctoIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ctoRef = doc(collection(db, 'network_ctos'));
    const totalPorts = [8, 16][Math.floor(Math.random() * 2)];
    const usedPorts = Math.floor(Math.random() * (totalPorts + 1));
    batch.set(ctoRef, {
      name: `CTO-${String(i+1).padStart(2, '0')}`,
      latitude: -23.5505 + (Math.random() * 0.05 - 0.025),
      longitude: -46.6333 + (Math.random() * 0.05 - 0.025),
      totalPorts,
      usedPorts,
      status: usedPorts === totalPorts ? 'full' : 'active',
      createdAt: new Date()
    });
    ctoIds.push(ctoRef.id);
    opCount++;
    await checkLimit('ctos');
  }

  // Create 10 Technicians
  const techIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const techRef = doc(collection(db, 'technicians'));
    batch.set(techRef, {
      name: `Técnico ${firstNames[i]}`,
      phone: `551198${Math.floor(1000000 + Math.random() * 8999999)}`,
      status: ['available', 'break', 'offline'][Math.floor(Math.random() * 3)],
      currentTask: null
    });
    techIds.push(techRef.id);
    opCount++;
    await checkLimit('technicians');
  }

  // Create 20 Inventory items
  const inventoryItems = [
    { name: 'ONU Huawei HG8245H', category: 'ONU', unit: 'un', price: 180 },
    { name: 'Roteador TP-Link Archer C6', category: 'Roteador', unit: 'un', price: 220 },
    { name: 'Cabo Drop Flat 1km', category: 'Cabo', unit: 'un', price: 450 },
    { name: 'Conector Fast SC/APC', category: 'Acessório', unit: 'un', price: 1.5 },
  ];
  for (let i = 0; i < 20; i++) {
    const invRef = doc(collection(db, 'inventory'));
    const baseItem = inventoryItems[i % inventoryItems.length];
    batch.set(invRef, {
      name: `${baseItem.name} V${Math.floor(i/4) + 1}`,
      category: baseItem.category,
      stock: Math.floor(Math.random() * 100) + 10,
      minStock: 15,
      unit: baseItem.unit,
      price: baseItem.price,
      createdAt: new Date()
    });
    opCount++;
    await checkLimit('inventory');
  }

  // Create Knowledge Base
  for (let i = 0; i < 10; i++) {
    const kbRef = doc(collection(db, 'knowledge_base'));
    batch.set(kbRef, {
      title: `Artigo Suporte ${i+1}: Configuração Básica`,
      content: `Passo 1: Verifique a conexão.\nPasso 2: Reinicie os equipamentos.\nPasso 3: Teste o cabo.`,
      category: ['Suporte', 'Vendas', 'Financeiro'][Math.floor(Math.random() * 3)],
      tags: ['roteador', 'configuração', 'dica'],
      createdAt: new Date()
    });
    opCount++;
    await checkLimit('knowledge_base');
  }

  // Create Team Members
  for (let i = 0; i < 5; i++) {
    const tmRef = doc(collection(db, 'team_members'));
    batch.set(tmRef, {
      name: `${firstNames[i + 15]} ${lastNames[i]}`,
      email: `equipe${i}@example.com`,
      role: ['admin', 'support', 'billing', 'sales'][Math.floor(Math.random() * 4)],
      status: 'active',
      createdAt: new Date()
    });
    opCount++;
    await checkLimit('team_members');
  }

  onProgress("Gerando 300 ordens de serviço...");
  for (let i = 0; i < 300; i++) {
    const soRef = doc(collection(db, 'service_orders'));
    // Spread evenly across the last 30 days and the next 15 days
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() + (Math.floor(Math.random() * 45) - 30));
    const isPast = createdDate < new Date();
    const isToday = createdDate.toDateString() === new Date().toDateString();
    
    // Choose status based on date
    let status = 'pendente';
    if (isPast && !isToday) {
       status = Math.random() > 0.1 ? 'concluida' : 'pendente';
    } else if (isToday) {
       status = ['pendente', 'em_deslocamento', 'em_andamento'][Math.floor(Math.random() * 3)];
    }

    // Working hours logic (8, 9, 10, 11, 13, 14, 15, 16, 17)
    const validHours = [8, 9, 10, 11, 13, 14, 15, 16, 17];
    const hour = validHours[Math.floor(Math.random() * validHours.length)];
    const minute = ['00', '30'][Math.floor(Math.random() * 2)];
    
    // Convert to required strings
    const scheduledDateStr = createdDate.toISOString().split('T')[0];
    const scheduledTimeStr = `${hour.toString().padStart(2, '0')}:${minute}`;

    batch.set(soRef, {
      customerId: allCustomerIds[Math.floor(Math.random() * allCustomerIds.length)],
      status: status,
      type: ['instalacao', 'reparo', 'manutencao'][Math.floor(Math.random() * 3)],
      description: `Ordem Automática Estudada #${i}`,
      scheduledDate: scheduledDateStr,
      scheduledTime: scheduledTimeStr,
      scheduledFor: createdDate, // For legacy sorting just in case
      assignedTo: Math.random() > 0.2 ? ['Técnico Alpha', 'Técnico Bravo', 'Técnico Charlie', 'Técnico Delta'][Math.floor(Math.random() * 4)] : 'A Definir',
      createdAt: createdDate
    });
    opCount++;
    await checkLimit('service_orders');
  }

  onProgress("Gerando 1500 faturas (histórico financeiro)...");
  for (let i = 0; i < 1500; i++) {
    const cxId = allCustomerIds[i]; // 1 per customer
    const invRef = doc(collection(db, 'billing_invoices'));
    const createdDate = new Date();
    createdDate.setDate(1); // 1st of month
    const dueDate = new Date(createdDate);
    dueDate.setDate(10); // Due 10th
    
    batch.set(invRef, {
      customerId: cxId,
      amount: [62.99, 82.99, 99.99, 119.99][Math.floor(Math.random() * 4)],
      status: Math.random() > 0.2 ? 'paid' : 'pending',
      dueDate: dueDate,
      createdAt: createdDate
    });
    opCount++;
    await checkLimit('billing_invoices');
  }

  onProgress("Finalizando...");
  await commitBatch('final');
  onProgress("Popular Astrum concluído com sucesso!");
};

export const wipeSystemData = async (onProgress: (msg: string) => void) => {
  const collections = [
    'customers',
    'tickets',
    'billing_invoices',
    'invoices',
    'network_ctos',
    'technicians',
    'inventory',
    'knowledge_base',
    'team_members',
    'service_orders',
    'audit_logs',
    'notifications',
    'ai_usage'
  ];

  for (const collName of collections) {
    onProgress(`Limpando coleção: ${collName}...`);
    try {
      const querySnapshot = await getDocs(collection(db, collName));
      let batch = writeBatch(db);
      let opCount = 0;
      
      for (const docSnap of querySnapshot.docs) {
        if (collName === 'tickets') {
          const msgs = await getDocs(collection(db, `tickets/${docSnap.id}/messages`));
          for (const msgSnap of msgs.docs) {
            batch.delete(msgSnap.ref);
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
        }
        batch.delete(docSnap.ref);
        opCount++;
        
        if (opCount >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      }
      if (opCount > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.error(`Erro ao limpar ${collName}:`, err);
    }
  }

  onProgress("Sistema resetado com sucesso!");
};
