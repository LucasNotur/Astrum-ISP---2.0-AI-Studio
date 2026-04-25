import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment,
  limit,
  setDoc,
  deleteDoc,
  arrayUnion
} from 'firebase/firestore';
import { db, auth } from './firebase';

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationType = typeof OperationType[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || '',
      email: auth.currentUser?.email || '',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || '',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Customers
export const getCustomers = (callback: (customers: any[]) => void) => {
  const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(150));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));
};

export const updateCustomer = async (customerId: string, data: any) => {
  try {
    await updateDoc(doc(db, 'customers', customerId), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `customers/${customerId}`);
  }
};

export const createCustomer = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, 'customers'), {
      ...data,
      openTicketsCount: 0,
      overdueInvoicesCount: 0,
      riskScore: 0,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'customers');
  }
};

export const createInvoice = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, 'invoices'), {
      ...data,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'invoices');
  }
};

export const getTickets = (callback: (tickets: any[]) => void) => {
  const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'tickets'));
};

export const createTicket = async (customerId: string, subject: string) => {
  try {
    return await addDoc(collection(db, 'tickets'), {
      customerId,
      subject,
      status: 'open',
      priority: 'medium',
      aiHandled: true,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'tickets');
  }
};

export const updateCustomerStats = async (customerId: string) => {
  try {
    const tq = query(collection(db, 'tickets'), where('customerId', '==', customerId), where('status', '!=', 'resolved'));
    const tSnap = await getDocs(tq);
    const openTicketsCount = tSnap.size;

    const iq = query(collection(db, 'billing_invoices'), where('customerId', '==', customerId), where('status', '==', 'overdue'));
    const iSnap = await getDocs(iq);
    const overdueInvoicesCount = iSnap.size;

    const riskScore = (openTicketsCount * 20) + (overdueInvoicesCount * 40);

    await updateDoc(doc(db, 'customers', customerId), {
      openTicketsCount,
      overdueInvoicesCount,
      riskScore
    });
  } catch (err) {
    console.error("Failed to update customer stats:", err);
  }
};

export const updateTicketStatus = async (ticketId: string, status: string) => {
  try {
    const ticketSnap = await getDoc(doc(db, 'tickets', ticketId));
    
    const updateData: any = { status };
    if (status === 'resolved') {
      updateData.resolvedAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'tickets', ticketId), updateData);

    if (ticketSnap.exists() && ticketSnap.data().customerId) {
        await updateCustomerStats(ticketSnap.data().customerId);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const toggleTicketAI = async (ticketId: string, enabled: boolean) => {
  try {
    await updateDoc(doc(db, 'tickets', ticketId), { aiEnabled: enabled });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const incrementAiAttempts = async (ticketId: string) => {
  try {
    await updateDoc(doc(db, 'tickets', ticketId), { 
      aiAttempts: increment(1) 
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

// Messages
export const getMessages = (ticketId: string, callback: (messages: any[]) => void) => {
  const q = query(collection(db, `tickets/${ticketId}/messages`), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, `tickets/${ticketId}/messages`));
};

export const sendMessage = async (
  ticketId: string, 
  text: string, 
  senderType: 'customer' | 'ai' | 'human' | 'system', 
  category?: string,
  attachment?: { url: string, type: string, base64?: string }
) => {
  try {
    await addDoc(collection(db, `tickets/${ticketId}/messages`), {
      ticketId,
      senderId: auth.currentUser?.uid || 'anonymous',
      senderType,
      text,
      category: category || null,
      attachment: attachment || null,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `tickets/${ticketId}/messages`);
  }
};

// Billing
export const getInvoices = (callback: (invoices: any[]) => void) => {
  const q = query(collection(db, 'billing_invoices'), orderBy('createdAt', 'desc'), limit(300));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'billing_invoices'));
};

// Network
export const getNetworkCTOs = (callback: (ctos: any[]) => void) => {
  const q = collection(db, 'network_ctos');
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'network_ctos'));
};

// Audit Logs
export const logAudit = async (action: string, details: any) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      details,
      user: auth.currentUser?.email || 'system',
      timestamp: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
};

export const getAuditLogs = (callback: (logs: any[]) => void) => {
  const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs'));
};

// --- Technicians ---
export const getTechnicians = (callback: (techs: any[]) => void) => {
  const q = query(collection(db, 'technicians'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'technicians');
  });
};

export const createTechnician = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, 'technicians'), {
      ...data,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'technicians');
    throw error;
  }
};

export const updateTechnician = async (id: string, data: any) => {
  try {
    const docRef = doc(db, 'technicians', id);
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `technicians/${id}`);
    throw error;
  }
};

// --- Service Orders ---
export const getServiceOrders = (callback: (orders: any[]) => void) => {
  const q = query(collection(db, 'service_orders'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'service_orders');
  });
};

export const createServiceOrder = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, 'service_orders'), {
      ...data,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'service_orders');
    throw error;
  }
};

export const updateServiceOrder = async (id: string, data: any) => {
  try {
    const docRef = doc(db, 'service_orders', id);
    let updatePayload = { ...data };
    
    // Auto-record status history if status is being updated
    if (data.status) {
      updatePayload.statusHistory = arrayUnion({
        status: data.status,
        timestamp: new Date().toISOString(),
        technician: data.updaterName || data.assignedTo || 'Sistema'
      });
      delete updatePayload.updaterName;
    }

    await updateDoc(docRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `service_orders/${id}`);
    throw error;
  }
};

export const seedServiceOrdersAndTechnicians = async () => {
  const techs = [
    { name: 'Técnico Alpha', phone: '5511999999991', status: 'offline', currentTask: null },
    { name: 'Técnico Bravo', phone: '5511999999992', status: 'offline', currentTask: null },
    { name: 'Técnico Charlie', phone: '5511999999993', status: 'offline', currentTask: null },
  ];

  for (const tech of techs) {
    await addDoc(collection(db, 'technicians'), { ...tech, createdAt: serverTimestamp() });
  }

  const os = {
    customerId: 'CUST-001',
    customerName: 'João Silva',
    address: 'Rua das Flores, 123 - Centro',
    lat: -23.5505,
    lng: -46.6333,
    status: 'pendente',
    type: 'manutencao',
    description: 'Cabo rompido na rua, sinal -40dBm. Necessário verificar roteador e possível troca de drop.',
    cto: 'CTO-01',
    port: 4,
    materials: ['100m Cabo Drop', '1 ONU Nova', 'Conectores APC'],
    assignedTo: null,
    aiSummary: 'Resumo da IA: Cliente relatou falta de internet há 2 horas. Diagnóstico remoto indica atenuação severa (-40dBm). Reinicialização não surtiu efeito. Provável rompimento físico.'
  };

  await addDoc(collection(db, 'service_orders'), { ...os, createdAt: serverTimestamp() });
};

// Inventory
export const getInventory = (callback: (inventory: any[]) => void) => {
  const q = collection(db, 'inventory');
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'));
};

export const updateInventoryItem = async (id: string, data: any) => {
  try {
    await updateDoc(doc(db, 'inventory', id), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `inventory/${id}`);
  }
};

export const createInventoryItem = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, 'inventory'), data);
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'inventory');
  }
};

export const deleteInventoryItem = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'inventory', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`);
  }
};

// Settings & Integrations
export const getIntegrationKeys = async () => {
  try {
    const docRef = doc(db, 'settings', 'integrations');
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data();
    }
    return {};
  } catch (err) {
    console.error("Error fetching integration keys:", err);
    return {};
  }
};

export const saveIntegrationKeys = async (keys: Record<string, string>) => {
  try {
    const docRef = doc(db, 'settings', 'integrations');
    await setDoc(docRef, keys, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/integrations');
  }
};

// System Prompts
export const getSystemPrompts = async () => {
  try {
    const docRef = doc(db, 'settings', 'prompts');
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data();
    }
    return null;
  } catch (err) {
    console.error("Error fetching system prompts:", err);
    return null;
  }
};

export const saveSystemPrompts = async (prompts: Record<string, string>) => {
  try {
    const docRef = doc(db, 'settings', 'prompts');
    await setDoc(docRef, prompts, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/prompts');
  }
};

// Knowledge Base (RAG)
export const createKBArticle = async (article: any) => {
  try {
    await addDoc(collection(db, 'knowledge_base'), {
      ...article,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'knowledge_base');
  }
};

export const updateKBArticle = async (id: string, article: any) => {
  try {
    await updateDoc(doc(db, 'knowledge_base', id), article);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `knowledge_base/${id}`);
  }
};

export const deleteKBArticle = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'knowledge_base', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `knowledge_base/${id}`);
  }
};

export const searchKnowledgeBase = async (searchTerm: string) => {
  try {
    const q = collection(db, 'knowledge_base');
    const snapshot = await getDocs(q);
    const articles = snapshot.docs.map(doc => doc.data());
    
    const term = searchTerm.toLowerCase();
    return articles.filter(a => 
      a.title?.toLowerCase().includes(term) || 
      a.content?.toLowerCase().includes(term) ||
      a.tags?.some((t: string) => t.toLowerCase().includes(term))
    );
  } catch (err) {
    console.error("RAG Error:", err);
    return [];
  }
};

// Real Tools Logic
export const checkCoverageReal = async (address: string) => {
  try {
    const keys = await getIntegrationKeys();
    const mapsKey = keys.googleMapsKey;

    if (!mapsKey) {
      return { 
        status: "manual_check_required", 
        message: "A consulta de viabilidade técnica integrada (CTOs) está desativada ou restrita pela empresa mãe. Por favor, verifique a viabilidade manualmente nos mapas de rede internos da sua região." 
      };
    }

    const q = collection(db, 'network_ctos');
    const snapshot = await getDocs(q);
    const ctos = snapshot.docs.map(doc => doc.data());
    
    // Simple logic: if any CTO has ports available, say yes
    const available = ctos.some(cto => cto.usedPorts < cto.totalPorts);
    return {
      status: available ? "available" : "unavailable",
      message: available ? `Viabilidade confirmada para ${address}. Temos portas disponíveis na região.` : `Infelizmente não temos portas disponíveis para ${address} no momento.`
    };
  } catch (err) {
    return { status: "error", message: "Erro ao consultar viabilidade." };
  }
};

export const getBillingStatusReal = async (cpf: string) => {
  try {
    const keys = await getIntegrationKeys();
    const billingKey = keys.billingApi;

    if (!billingKey) {
      return { 
        status: "manual_check_required", 
        message: "O sistema de consulta financeira automática não está integrado no momento (Operação White-label). Por favor, informe ao cliente que você irá consultar manualmente os registros de faturamento da central e peça um momento." 
      };
    }

    // Exemplo de integração real (comentado para referência)
    /*
    // Exemplo Asaas:
    const response = await fetch(`https://api.asaas.com/v3/customers?cpfCnpj=${cpf}`, {
      headers: { 'access_token': billingKey }
    });
    const customerData = await response.json();
    if (customerData.data.length > 0) {
      const customerId = customerData.data[0].id;
      const chargesResponse = await fetch(`https://api.asaas.com/v3/payments?customer=${customerId}&status=OVERDUE`, {
        headers: { 'access_token': billingKey }
      });
      const chargesData = await chargesResponse.json();
      // Retornar chargesData...
    }
    */

    // Simulação de resposta da API do Banco baseada no CPF
    // Na vida real, isso viria do fetch acima.
    const cleanCpf = cpf.replace(/\D/g, '');
    
    if (cleanCpf.startsWith('123')) {
      return {
        status: "pending",
        message: "Encontramos 1 fatura pendente no valor de R$ 99,90 com vencimento para 10/04/2026.",
        invoiceDetails: {
          value: 99.90,
          dueDate: "2026-04-10",
          pixCopyPaste: "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426655440000520400005303986540599.905802BR5913ASTRUM LTDA6009SAO PAULO62070503***63041A2B",
          pdfLink: "https://fatura.astrum.com.br/12345.pdf"
        }
      };
    }

    return {
      status: "up_to_date",
      message: "Não encontramos faturas pendentes para este CPF. Tudo em dia!"
    };

  } catch (err) {
    console.error("Erro ao consultar financeiro:", err);
    return { status: "error", message: "Erro de comunicação com a API do Banco." };
  }
};

export const runDiagnosticsReal = async (customerId: string) => {
  return {
    status: "locked",
    message: "Sistema de diagnóstico de OLT temporariamente indisponível por falta de permissão de acesso. Por favor, informe ao cliente que estamos sem acesso temporário à OLT para verificar o sinal."
  };
};

// Notifications (Telegram/Alerts)
export const notifyTeam = async (type: 'SLA_BREACH' | 'CRITICAL_ESCALATION' | 'SYSTEM_ERROR', message: string, ticketId?: string) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      type,
      message,
      ticketId: ticketId || null,
      timestamp: serverTimestamp()
    });
    console.log(`[Notification] ${type}: ${message}`);
  } catch (err) {
    console.error("Notification Error:", err);
  }
};

export const seedKnowledgeBase = async () => {
  const articles = [
    { title: "Como reiniciar o roteador", content: "Desligue o roteador da tomada, aguarde 30 segundos e ligue novamente. Isso resolve 90% dos problemas de conexão.", tags: ["roteador", "reiniciar", "conexão", "lento"], category: "Suporte" },
    { title: "Configuração de Wi-Fi", content: "Mantenha o roteador em local alto e centralizado. Evite obstáculos como paredes grossas e espelhos.", tags: ["wi-fi", "sinal", "cobertura"], category: "Suporte" },
    { title: "Planos de Fibra 2026", content: "200 Mega: R$99. 500 Mega: R$129. 1 Giga: R$199. Instalação grátis para contratos de 12 meses.", tags: ["planos", "preço", "vendas", "fibra"], category: "Vendas" }
  ];

  for (const article of articles) {
    await addDoc(collection(db, 'knowledge_base'), article);
  }
};

export const seedSystem = async () => {
  const plans = ['200 Mega', '500 Mega', '1 Giga'];
  const statuses = ['active', 'active', 'active', 'inactive']; // 75% active
  const firstNames = ['Lucas', 'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gisele', 'Hugo', 'Iris', 'Joao', 'Kelly', 'Luis', 'Mara', 'Nuno', 'Olivia', 'Paulo', 'Quiteria', 'Raul', 'Sonia'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'];

  console.log("Starting massive seed...");

  // 1. Seed 100 Customers
  for (let i = 0; i < 100; i++) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]} ${i}`;
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const mrr = plan === '200 Mega' ? 99 : plan === '500 Mega' ? 129 : 199;
    
    const customerRef = await addDoc(collection(db, 'customers'), {
      name,
      email: `user${i}@example.com`,
      phone: `(11) 9${Math.floor(10000000 + Math.random() * 90000000)}`,
      address: `Rua das Flores, ${Math.floor(Math.random() * 1000)}, São Paulo - SP`,
      plan,
      mrr,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      createdAt: serverTimestamp()
    });

    // 2. Seed 1-3 Invoices per customer
    const numInvoices = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < numInvoices; j++) {
      const isOverdue = Math.random() > 0.8;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - (j * 30) + (isOverdue ? -5 : 5));

      await addDoc(collection(db, 'billing_invoices'), {
        customerId: customerRef.id,
        amount: mrr,
        status: isOverdue ? 'overdue' : 'paid',
        dueDate: Timestamp.fromDate(dueDate),
        createdAt: serverTimestamp()
      });
    }

    // 3. Seed 1-2 Tickets per customer
    if (Math.random() > 0.5) {
      const numTickets = Math.floor(Math.random() * 2) + 1;
      for (let k = 0; k < numTickets; k++) {
        const status = Math.random() > 0.7 ? 'resolved' : 'open';
        const ticketRef = await addDoc(collection(db, 'tickets'), {
          customerId: customerRef.id,
          subject: k === 0 ? "Sem conexão com a internet" : "Lentidão no Wi-Fi",
          status,
          priority: Math.random() > 0.8 ? 'high' : 'medium',
          aiHandled: Math.random() > 0.3,
          createdAt: serverTimestamp(),
          resolvedAt: status === 'resolved' ? serverTimestamp() : null
        });

        // Add 1-3 messages per ticket
        const numMessages = Math.floor(Math.random() * 3) + 1;
        for (let m = 0; m < numMessages; m++) {
          await addDoc(collection(db, `tickets/${ticketRef.id}/messages`), {
            ticketId: ticketRef.id,
            senderId: m % 2 === 0 ? 'customer' : 'ai',
            senderType: m % 2 === 0 ? 'customer' : 'ai',
            text: m === 0 ? "Olá, estou sem internet." : "Olá! Vou verificar seu sinal agora mesmo.",
            createdAt: serverTimestamp()
          });
        }
      }
    }
  }

  // 4. Seed 10 CTOs
  for (let i = 0; i < 10; i++) {
    const totalPorts = 16;
    const usedPorts = Math.floor(Math.random() * 17);
    await addDoc(collection(db, 'network_ctos'), {
      name: `CTO-SP-${i.toString().padStart(3, '0')}`,
      latitude: -23.5505 + (Math.random() - 0.5) * 0.1,
      longitude: -46.6333 + (Math.random() - 0.5) * 0.1,
      totalPorts,
      usedPorts,
      status: usedPorts === totalPorts ? 'full' : 'active'
    });
  }

  console.log("Massive seed completed!");
};

export const seedInventory = async () => {
  const items = [
    { name: 'ONU Huawei HG8245H', category: 'ONU', stock: 45, minStock: 10, unit: 'un', price: 180 },
    { name: 'Roteador TP-Link Archer C6', category: 'Roteador', stock: 12, minStock: 15, unit: 'un', price: 220 },
    { name: 'Cabo Drop Flat (km)', category: 'Cabo', stock: 4.5, minStock: 2, unit: 'km', price: 450 },
    { name: 'Conector Fast SC/APC', category: 'Acessório', stock: 500, minStock: 100, unit: 'un', price: 1.5 },
  ];

  for (const item of items) {
    await addDoc(collection(db, 'inventory'), item);
  }
};


