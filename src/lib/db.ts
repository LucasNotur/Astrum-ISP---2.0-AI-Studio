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
  arrayUnion,
  deleteField,
  writeBatch,
  runTransaction,
} from "firebase/firestore";
import { db, auth } from "./firebase.ts";

import forge from "node-forge";

export const encryptCpf = (cpf: string): string => {
  if (!cpf) return cpf;
  const keyHex =
    ((typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.VITE_CPF_ENCRYPTION_KEY) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CPF_ENCRYPTION_KEY)) ||
    "0000000000000000000000000000000000000000000000000000000000000000";
  try {
    const key = forge.util.hexToBytes(keyHex);
    if (key.length !== 32) return cpf;
    const iv = forge.random.getBytesSync(12);
    const cipher = forge.cipher.createCipher("AES-GCM", key);
    cipher.start({ iv: iv });
    cipher.update(forge.util.createBuffer(cpf, "utf8"));
    cipher.finish();
    const encrypted = cipher.output.getBytes();
    const tag = cipher.mode.tag.getBytes();
    return (
      forge.util.encode64(iv) +
      ":" +
      forge.util.encode64(tag) +
      ":" +
      forge.util.encode64(encrypted)
    );
  } catch (err) {
    return cpf;
  }
};

export const decryptCpf = (encryptedCpf: string): string => {
  if (
    !encryptedCpf ||
    typeof encryptedCpf !== "string" ||
    !encryptedCpf.includes(":")
  )
    return encryptedCpf;
  const keyHex =
    ((typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.VITE_CPF_ENCRYPTION_KEY) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CPF_ENCRYPTION_KEY)) ||
    "0000000000000000000000000000000000000000000000000000000000000000";
  try {
    const key = forge.util.hexToBytes(keyHex);
    if (key.length !== 32) return encryptedCpf;
    const parts = encryptedCpf.split(":");
    if (parts.length !== 3) return encryptedCpf;
    const iv = forge.util.decode64(parts[0]);
    const tag = forge.util.decode64(parts[1]);
    const encrypted = forge.util.decode64(parts[2]);
    const decipher = forge.cipher.createDecipher("AES-GCM", key);
    decipher.start({
      iv: iv,
      tag: forge.util.createBuffer(tag),
    });
    decipher.update(forge.util.createBuffer(encrypted));
    const pass = decipher.finish();
    if (pass) {
      return decipher.output.toString();
    }
    return encryptedCpf;
  } catch (err) {
    return encryptedCpf;
  }
};

export const maskCpfForLog = (cpf?: string): string => {
  if (!cpf) return "";
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 5) return "***";
  return cleanCpf.slice(0, 3) + "***" + cleanCpf.slice(-2);
};

export const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write",
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || "",
      email: auth.currentUser?.email || "",
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || "",
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName || "",
          email: provider.email || "",
          photoUrl: provider.photoURL || "",
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Customers
export const getCustomers = (callback: (customers: any[]) => void) => {
  const q = query(
    collection(db, "customers"),
    orderBy("createdAt", "desc"),
    limit(150),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((doc) => {
          const data = doc.data();
          if (data.cpf) {
            data.cpf = decryptCpf(data.cpf);
          }
          return { id: doc.id, ...data };
        }),
      );
    },
    (err) => handleFirestoreError(err, OperationType.LIST, "customers"),
  );
};

export const updateCustomer = async (customerId: string, data: any) => {
  try {
    const payload = { ...data };
    if (payload.cpf) {
      payload.cpf = encryptCpf(payload.cpf);
    }
    
    // Check for status change to trigger reactivation flow
    if (payload.status === 'ativo') {
      const existingDoc = await getDoc(doc(db, "customers", customerId));
      if (existingDoc.exists() && existingDoc.data().status === 'cancelado') {
        const tenantId = existingDoc.data().tenant_id || 'default';
        await handleCustomerReactivation(customerId, tenantId);
        // Avoid overwriting the reactivation fields we just set.
        delete payload.status;
      }
    }
    
    if (Object.keys(payload).length > 0) {
      await updateDoc(doc(db, "customers", customerId), payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `customers/${customerId}`);
  }
};

export const createCustomer = async (data: any) => {
  try {
    const payload = { ...data };
    if (payload.cpf) {
      payload.cpf = encryptCpf(payload.cpf);
    }
    const docRef = await addDoc(collection(db, "customers"), {
      ...payload,
      openTicketsCount: 0,
      overdueInvoicesCount: 0,
      riskScore: 0,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "customers");
  }
};

export const deleteCustomer = async (id: string) => {
  try {
    await deleteDoc(doc(db, "customers", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `customers/${id}`);
  }
};

export const createInvoice = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, "invoices"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "invoices");
  }
};

export const getTickets = (callback: (tickets: any[]) => void) => {
  const q = query(
    collection(db, "tickets"),
    orderBy("createdAt", "desc"),
    limit(200),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, "tickets"),
  );
};

export const createTicket = async (customerId: string, subject: string) => {
  try {
    return await addDoc(collection(db, "tickets"), {
      customerId,
      subject,
      status: "open",
      priority: "medium",
      aiHandled: true,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "tickets");
  }
};

export const createContract = async (immutableContract: any) => {
  try {
    const docRef = await addDoc(collection(db, "contracts"), immutableContract);
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "contracts");
  }
};

export const updateTicketSessionState = async (
  ticketId: string,
  newSessionState: any,
) => {
  try {
    await runTransaction(db, async (transaction) => {
      const ticketRef = doc(db, "tickets", ticketId);
      const ticketSnap = await transaction.get(ticketRef);
      const currentState = ticketSnap.data()?.session_state ?? {
        active_flow: "IDLE",
      };

      const updates: any = {};
      if (newSessionState.active_flow !== undefined)
        updates["session_state.active_flow"] = newSessionState.active_flow;
      if (newSessionState.step !== undefined)
        updates["session_state.step"] = newSessionState.step;
      if (newSessionState.agent !== undefined)
        updates["session_state.agent"] = newSessionState.agent;
      if (newSessionState.lead_stage !== undefined)
        updates["session_state.lead_stage"] = newSessionState.lead_stage;

      if (Object.keys(updates).length > 0) {
        transaction.update(ticketRef, updates);
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const deleteTicket = async (id: string) => {
  try {
    await deleteDoc(doc(db, "tickets", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `tickets/${id}`);
  }
};

export const updateCustomerStats = async (customerId: string) => {
  try {
    const tq = query(
      collection(db, "tickets"),
      where("customerId", "==", customerId),
      where("status", "!=", "resolved"),
    );
    const tSnap = await getDocs(tq);
    const openTicketsCount = tSnap.size;

    const iq = query(
      collection(db, "billing_invoices"),
      where("customerId", "==", customerId),
      where("status", "==", "overdue"),
    );
    const iSnap = await getDocs(iq);
    const overdueInvoicesCount = iSnap.size;

    const riskScore = openTicketsCount * 20 + overdueInvoicesCount * 40;

    await updateDoc(doc(db, "customers", customerId), {
      openTicketsCount,
      overdueInvoicesCount,
      riskScore,
    });
  } catch (err) {
    console.error("Failed to update customer stats:", err);
  }
};

export const updateTicketStatus = async (ticketId: string, status: string) => {
  try {
    const ticketSnap = await getDoc(doc(db, "tickets", ticketId));

    const updateData: any = { status };
    if (status === "resolved") {
      updateData.resolvedAt = serverTimestamp();
      const tData = ticketSnap.exists() ? ticketSnap.data() : null;
      if (tData && tData.customerId) {
        fetch("/api/jobs/schedule-csat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId,
            tenantId: tData.tenantId || 'default',
            customerId: tData.customerId,
            category: tData.session_state?.agent || 'SAC_GERAL',
            resolved_by: tData.human_responded ? 'human' : 'bot'
          })
        }).catch(e => console.error("Falha ao agendar CSAT:", e));
      }
    }
    await updateDoc(doc(db, "tickets", ticketId), updateData);

    if (ticketSnap.exists() && ticketSnap.data().customerId) {
      await updateCustomerStats(ticketSnap.data().customerId);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const toggleTicketAI = async (ticketId: string, enabled: boolean) => {
  try {
    await updateDoc(doc(db, "tickets", ticketId), { aiEnabled: enabled });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

export const incrementAiAttempts = async (ticketId: string) => {
  try {
    await updateDoc(doc(db, "tickets", ticketId), {
      aiAttempts: increment(1),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `tickets/${ticketId}`);
  }
};

// Messages
export const getMessages = (
  ticketId: string,
  callback: (messages: any[]) => void,
) => {
  const q = query(
    collection(db, `tickets/${ticketId}/messages`),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (err) =>
      handleFirestoreError(
        err,
        OperationType.LIST,
        `tickets/${ticketId}/messages`,
      ),
  );
};

export const sendMessage = async (
  ticketId: string,
  text: string,
  senderType: "customer" | "ai" | "human" | "system",
  category?: string,
  attachment?: { url: string; type: string; base64?: string },
) => {
  try {
    await addDoc(collection(db, `tickets/${ticketId}/messages`), {
      ticketId,
      senderId: auth.currentUser?.uid || "anonymous",
      senderType,
      text,
      category: category || null,
      attachment: attachment || null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `tickets/${ticketId}/messages`,
    );
  }
};

// Billing
export const getInvoices = (callback: (invoices: any[]) => void) => {
  const q = query(
    collection(db, "billing_invoices"),
    orderBy("createdAt", "desc"),
    limit(300),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, "billing_invoices"),
  );
};

// Network
export const getNetworkCTOs = (callback: (ctos: any[]) => void) => {
  const q = collection(db, "network_ctos");
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, "network_ctos"),
  );
};

// Audit Logs
export const logAudit = async (action: string, details: any) => {
  try {
    await addDoc(collection(db, "audit_logs"), {
      action,
      details,
      user: auth.currentUser?.email || "system",
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "audit_logs");
  }
};

export const getAuditLogs = (callback: (logs: any[]) => void) => {
  const q = query(
    collection(db, "audit_logs"),
    orderBy("timestamp", "desc"),
    limit(50),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, "audit_logs"),
  );
};

// --- Technicians ---
export const getTechnicians = (callback: (techs: any[]) => void, tenantId: string = 'default') => {
  const q = query(collection(db, `technicians/${tenantId}/list`));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `technicians/${tenantId}/list`);
    },
  );
};

export const createTechnician = async (data: any, tenantId: string = 'default') => {
  try {
    const docRef = await addDoc(collection(db, `technicians/${tenantId}/list`), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `technicians/${tenantId}/list`);
    throw error;
  }
};

export const updateTechnician = async (id: string, data: any, tenantId: string = 'default') => {
  try {
    const docRef = doc(db, `technicians/${tenantId}/list`, id);
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `technicians/${tenantId}/list/${id}`);
    throw error;
  }
};

// --- Service Orders ---
export const getServiceOrders = (callback: (orders: any[]) => void) => {
  const q = query(
    collection(db, "service_orders"),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, "service_orders");
    },
  );
};

export const createServiceOrder = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, "service_orders"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    if (data.tenantId || data.tenant_id) {
       await incrementShardedCounter('os_today', data.tenantId || data.tenant_id);
    }
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "service_orders");
    throw error;
  }
};

export const updateServiceOrder = async (id: string, data: any) => {
  try {
    const docRef = doc(db, "service_orders", id);
    const existingSnap = await getDoc(docRef);
    const oldStatus = existingSnap.exists() ? existingSnap.data().status : null;

    let updatePayload = { ...data };

    // Auto-record status history if status is being updated
    if (data.status) {
      updatePayload.statusHistory = arrayUnion({
        status: data.status,
        timestamp: new Date().toISOString(),
        technician: data.updaterName || data.assignedTo || "Sistema",
      });
      delete updatePayload.updaterName;
    }

    await updateDoc(docRef, updatePayload);

    if (data.status === 'concluida' && oldStatus !== 'concluida') {
      const osData = existingSnap.data() || {};
      fetch("/api/jobs/schedule-pos-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: data.customer_id || data.customerId || osData.customer_id || osData.customerId,
          tenantId: data.tenant_id || data.tenantId || osData.tenant_id || osData.tenantId || "default",
          osId: id,
          installedPlan: data.plan_name || data.planName || osData.plan_name || osData.planName || "Convencional"
        })
      }).catch(console.error);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `service_orders/${id}`);
    throw error;
  }
};

export const seedServiceOrdersAndTechnicians = async () => {
  const techs = [
    {
      name: "Técnico Alpha",
      phone: "5511999999991",
      status: "offline",
      currentTask: null,
      coverage_regions: ["Sul", "Leste"],
      active: true,
    },
    {
      name: "Técnico Bravo",
      phone: "5511999999992",
      status: "offline",
      currentTask: null,
      coverage_regions: ["Norte", "Oeste"],
      active: true,
    },
    {
      name: "Técnico Charlie",
      phone: "5511999999993",
      status: "offline",
      currentTask: null,
      coverage_regions: ["Sul", "Centro"],
      active: true,
    },
    {
      name: "Técnico Delta",
      phone: "5511999999994",
      status: "offline",
      currentTask: null,
      coverage_regions: ["Norte", "Leste"],
      active: true,
    },
  ];

  for (const tech of techs) {
    await addDoc(collection(db, "technicians/default/list"), {
      ...tech,
      createdAt: serverTimestamp(),
    });
  }

  const os = {
    customerId: "CUST-001",
    customerName: "João Silva",
    address: "Rua das Flores, 123 - Centro",
    lat: -23.5505,
    lng: -46.6333,
    status: "pendente",
    type: "manutencao",
    description:
      "Cabo rompido na rua, sinal -40dBm. Necessário verificar roteador e possível troca de drop.",
    cto: "CTO-01",
    port: 4,
    materials: ["100m Cabo Drop", "1 ONU Nova", "Conectores APC"],
    assignedTo: null,
    aiSummary:
      "Resumo da IA: Cliente relatou falta de internet há 2 horas. Diagnóstico remoto indica atenuação severa (-40dBm). Reinicialização não surtiu efeito. Provável rompimento físico.",
  };

  await addDoc(collection(db, "service_orders"), {
    ...os,
    createdAt: serverTimestamp(),
  });
};

// Inventory
export const getInventory = (callback: (inventory: any[]) => void) => {
  const q = collection(db, "inventory");
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, "inventory"),
  );
};

export const updateInventoryItem = async (id: string, data: any) => {
  try {
    await updateDoc(doc(db, "inventory", id), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `inventory/${id}`);
  }
};

export const createInventoryItem = async (data: any) => {
  try {
    const docRef = await addDoc(collection(db, "inventory"), data);
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "inventory");
  }
};

export const deleteInventoryItem = async (id: string) => {
  try {
    await deleteDoc(doc(db, "inventory", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `inventory/${id}`);
  }
};

// Settings & Integrations
export const getIntegrationKeys = async () => {
  try {
    const { safeFirestoreGet } = await import("./dbSafe");
    const { data: snapshot, degraded } = await safeFirestoreGet(
      () => getDoc(doc(db, "settings", "integrations")),
      { exists: () => false, data: () => ({}) } as any,
      'integration_keys'
    );
    if (snapshot.exists()) {
      return snapshot.data();
    }
    return {};
  } catch (err: any) {
    if (
      err.code === "permission-denied" ||
      (err.message &&
        err.message.includes("Missing or insufficient permissions"))
    ) {
      console.warn(
        "Aviso: Sem permissão para ler integration keys (provável Webhook sem auth anônima).",
      );
    } else {
      console.error("Error fetching integration keys:", err);
    }
    return {};
  }
};

export const saveIntegrationKeys = async (keys: Record<string, string>) => {
  try {
    const docRef = doc(db, "settings", "integrations");
    await setDoc(docRef, keys, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "settings/integrations");
  }
};

// System Prompts
export const getSystemPrompts = async (tenantId: string = 'default') => {
  try {
    const versionsRef = collection(db, 'prompts', tenantId, 'versions');
    const snapshot = await getDocs(query(versionsRef, where('active', '==', true)));
    
    if (!snapshot.empty) {
      const prompts: Record<string, string> = {};
      snapshot.docs.forEach(d => {
        prompts[d.data().agent] = d.data().content;
      });
      return prompts;
    }
    
    // Fallback to legacy path if no versions found (for backward compatibility during migration)
    const legacyDocRef = doc(db, 'prompts', tenantId);
    const legacySnapshot = await getDoc(legacyDocRef);
    if (legacySnapshot.exists()) {
      return legacySnapshot.data();
    }
    return null;
  } catch (err: any) {
    if (
      err.code === "permission-denied" ||
      (err.message &&
        err.message.includes("Missing or insufficient permissions"))
    ) {
      console.warn("Aviso: Sem permissão para ler system prompts.");
    } else {
      console.error("Error fetching system prompts:", err);
    }
    return null;
  }
};

export const saveSystemPrompts = async (prompts: Record<string, string>, tenantId: string = 'default') => {
  try {
    const batch = writeBatch(db);
    const versionsRef = collection(db, 'prompts', tenantId, 'versions');
    const author = auth.currentUser?.email || 'system';

    for (const [agentName, content] of Object.entries(prompts)) {
      if (!content) continue;
      
      // Desativar versão atual
      const current = await getDocs(query(versionsRef, where('agent', '==', agentName), where('active', '==', true)));
      current.docs.forEach(d => batch.update(d.ref, { active: false }));

      // Criar nova versão
      const newVersion = doc(versionsRef);
      batch.set(newVersion, {
        agent: agentName,
        content,
        active: true,
        version: Date.now(),
        created_at: serverTimestamp(),
        created_by: author,
        tenant_id: tenantId
      });
    }

    await batch.commit();

    try {
      const redisModule = await import("./redis");
      const redisClient = redisModule.default;
      if (redisClient) {
        await redisClient.del(`prompts:${tenantId}`);
      }
    } catch(e) {}
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `prompts/${tenantId}/versions`);
  }
};

export async function incrementShardedCounter(metricName: string, tenantId: string) {
  try {
    const shardId = Math.floor(Math.random() * 10);
    const shardRef = doc(db, 'metrics_shards', `${tenantId}_${metricName}_${shardId}`);
    await setDoc(shardRef, { count: increment(1), tenant_id: tenantId, metric: metricName },
      { merge: true });
  } catch (err: any) {
    console.error("Error incrementing shard:", err.message);
  }
}

export async function getShardedCount(metricName: string, tenantId: string): Promise<number> {
  try {
    const shards = await getDocs(query(collection(db, 'metrics_shards'), where('tenant_id', '==', tenantId), where('metric', '==', metricName)));
    return shards.docs.reduce((sum, d) => sum + (d.data().count ?? 0), 0);
  } catch (err: any) {
    console.error("Error getting sharded count:", err.message);
    return 0;
  }
}

// Knowledge Base (RAG)
export const createKBArticle = async (article: any) => {
  try {
    await addDoc(collection(db, "knowledge_base"), {
      ...article,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "knowledge_base");
  }
};

export const updateKBArticle = async (id: string, article: any) => {
  try {
    await updateDoc(doc(db, "knowledge_base", id), article);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `knowledge_base/${id}`);
  }
};

export const deleteKBArticle = async (id: string) => {
  try {
    await deleteDoc(doc(db, "knowledge_base", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `knowledge_base/${id}`);
  }
};

// Real Tools Logic
export const checkCoverageReal = async (cep: string) => {
  try {
    const keys = await getIntegrationKeys();
    const mapsKey = keys.googleMapsKey;

    if (!mapsKey) {
      return {
        status: "manual_check_required",
        message:
          "A consulta de viabilidade técnica integrada (CTOs) está desativada ou restrita pela empresa mãe. Por favor, verifique a viabilidade manualmente nos mapas de rede internos da sua região.",
      };
    }

    const q = query(collection(db, "network_ctos"), where("cep", "==", cep));
    const snapshot = await getDocs(q);
    const ctos = snapshot.docs.map((doc) => doc.data());

    // Simple logic: if any CTO has ports available, say yes
    const available = ctos.some((cto) => cto.usedPorts < cto.totalPorts);
    return {
      status: available ? "available" : "unavailable",
      message: available
        ? `Viabilidade confirmada para o CEP ${cep}. Temos portas disponíveis na região.`
        : `Infelizmente não temos portas disponíveis para o CEP ${cep} no momento.`,
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
        message:
          "O sistema de consulta financeira automática não está integrado no momento (Operação White-label). Por favor, informe ao cliente que você irá consultar manualmente os registros de faturamento da central e peça um momento.",
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
    const cleanCpf = cpf.replace(/\D/g, "");

    if (cleanCpf.startsWith("123")) {
      return {
        status: "pending",
        message:
          "Encontramos 1 fatura pendente no valor de R$ 99,90 com vencimento para 10/04/2026.",
        invoiceDetails: {
          value: 99.9,
          dueDate: "2026-04-10",
          pixCopyPaste:
            "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426655440000520400005303986540599.905802BR5913ASTRUM LTDA6009SAO PAULO62070503***63041A2B",
          pdfLink: "https://fatura.astrum.com.br/12345.pdf",
        },
      };
    }

    return {
      status: "up_to_date",
      message: "Não encontramos faturas pendentes para este CPF. Tudo em dia!",
    };
  } catch (err) {
    console.error("Erro ao consultar financeiro:", err);
    return {
      status: "error",
      message: "Erro de comunicação com a API do Banco.",
    };
  }
};

export const runDiagnosticsReal = async (customerId: string) => {
  return {
    status: "locked",
    message:
      "Sistema de diagnóstico de OLT temporariamente indisponível por falta de permissão de acesso. Por favor, informe ao cliente que estamos sem acesso temporário à OLT para verificar o sinal.",
  };
};

// Notifications (Telegram/Alerts)
export const notifyTeam = async (
  type: "SLA_BREACH" | "CRITICAL_ESCALATION" | "SYSTEM_ERROR",
  message: string,
  ticketId?: string,
) => {
  try {
    await addDoc(collection(db, "notifications"), {
      type,
      message,
      ticketId: ticketId || null,
      timestamp: serverTimestamp(),
    });
    console.log(`[Notification] ${type}: ${message}`);
  } catch (err) {
    console.error("Notification Error:", err);
  }
};

export const seedKnowledgeBase = async () => {
  const articles = [
    {
      title: "Como reiniciar o roteador",
      content:
        "Desligue o roteador da tomada, aguarde 30 segundos e ligue novamente. Isso resolve 90% dos problemas de conexão.",
      tags: ["roteador", "reiniciar", "conexão", "lento"],
      category: "Suporte",
    },
    {
      title: "Configuração de Wi-Fi",
      content:
        "Mantenha o roteador em local alto e centralizado. Evite obstáculos como paredes grossas e espelhos.",
      tags: ["wi-fi", "sinal", "cobertura"],
      category: "Suporte",
    },
    {
      title: "Planos de Fibra 2026",
      content:
        "100 Mega: R$62,99. 300 Mega: R$82,99. 600 Mega: R$99,99. 1 Giga: R$119,99. Promocionais pagando no vencimento. Instalação grátis para contratos de 12 meses.",
      tags: ["planos", "preço", "vendas", "fibra"],
      category: "Vendas",
    },
  ];

  for (const article of articles) {
    await addDoc(collection(db, "knowledge_base"), article);
  }
};

export const seedSystem = async () => {
  const plans = ["100 Mega", "300 Mega", "600 Mega", "1 Giga"];
  const statuses = ["active", "active", "active", "inactive"]; // 75% active
  const firstNames = [
    "Lucas",
    "Ana",
    "Bruno",
    "Carla",
    "Diego",
    "Elena",
    "Fabio",
    "Gisele",
    "Hugo",
    "Iris",
    "Joao",
    "Kelly",
    "Luis",
    "Mara",
    "Nuno",
    "Olivia",
    "Paulo",
    "Quiteria",
    "Raul",
    "Sonia",
  ];
  const lastNames = [
    "Silva",
    "Santos",
    "Oliveira",
    "Souza",
    "Rodrigues",
    "Ferreira",
    "Alves",
    "Pereira",
    "Lima",
    "Gomes",
    "Costa",
    "Ribeiro",
    "Martins",
    "Carvalho",
    "Almeida",
    "Lopes",
    "Soares",
    "Fernandes",
    "Vieira",
    "Barbosa",
  ];

  console.log("Starting massive seed...");

  // 1. Seed 100 Customers
  for (let i = 0; i < 100; i++) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]} ${i}`;
    const plan = plans[Math.floor(Math.random() * plans.length)];
    const mrr =
      plan === "100 Mega"
        ? 62.99
        : plan === "300 Mega"
          ? 82.99
          : plan === "600 Mega"
            ? 99.99
            : 119.99;

    const customerRef = await addDoc(collection(db, "customers"), {
      name,
      email: `user${i}@example.com`,
      phone: `(11) 9${Math.floor(10000000 + Math.random() * 90000000)}`,
      address: `Rua das Flores, ${Math.floor(Math.random() * 1000)}, São Paulo - SP`,
      plan,
      mrr,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      createdAt: serverTimestamp(),
    });

    // 2. Seed 1-3 Invoices per customer
    const numInvoices = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < numInvoices; j++) {
      const isOverdue = Math.random() > 0.8;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - j * 30 + (isOverdue ? -5 : 5));

      await addDoc(collection(db, "billing_invoices"), {
        customerId: customerRef.id,
        amount: mrr,
        status: isOverdue ? "overdue" : "paid",
        dueDate: Timestamp.fromDate(dueDate),
        createdAt: serverTimestamp(),
      });
    }

    // 3. Seed 1-2 Tickets per customer
    if (Math.random() > 0.5) {
      const numTickets = Math.floor(Math.random() * 2) + 1;
      for (let k = 0; k < numTickets; k++) {
        const status = Math.random() > 0.7 ? "resolved" : "open";
        const ticketRef = await addDoc(collection(db, "tickets"), {
          customerId: customerRef.id,
          subject: k === 0 ? "Sem conexão com a internet" : "Lentidão no Wi-Fi",
          status,
          priority: Math.random() > 0.8 ? "high" : "medium",
          aiHandled: Math.random() > 0.3,
          createdAt: serverTimestamp(),
          resolvedAt: status === "resolved" ? serverTimestamp() : null,
        });

        // Add 1-3 messages per ticket
        const numMessages = Math.floor(Math.random() * 3) + 1;
        for (let m = 0; m < numMessages; m++) {
          await addDoc(collection(db, `tickets/${ticketRef.id}/messages`), {
            ticketId: ticketRef.id,
            senderId: m % 2 === 0 ? "customer" : "ai",
            senderType: m % 2 === 0 ? "customer" : "ai",
            text:
              m === 0
                ? "Olá, estou sem internet."
                : "Olá! Vou verificar seu sinal agora mesmo.",
            createdAt: serverTimestamp(),
          });
        }
      }
    }
  }

  // 4. Seed 10 CTOs
  for (let i = 0; i < 10; i++) {
    const totalPorts = 16;
    const usedPorts = Math.floor(Math.random() * 17);
    await addDoc(collection(db, "network_ctos"), {
      name: `CTO-SP-${i.toString().padStart(3, "0")}`,
      latitude: -23.5505 + (Math.random() - 0.5) * 0.1,
      longitude: -46.6333 + (Math.random() - 0.5) * 0.1,
      totalPorts,
      usedPorts,
      status: usedPorts === totalPorts ? "full" : "active",
    });
  }

  console.log("Massive seed completed!");
};

export const seedInventory = async () => {
  const items = [
    {
      name: "ONU Huawei HG8245H",
      category: "ONU",
      stock: 45,
      minStock: 10,
      unit: "un",
      price: 180,
    },
    {
      name: "Roteador TP-Link Archer C6",
      category: "Roteador",
      stock: 12,
      minStock: 15,
      unit: "un",
      price: 220,
    },
    {
      name: "Cabo Drop Flat (km)",
      category: "Cabo",
      stock: 4.5,
      minStock: 2,
      unit: "km",
      price: 450,
    },
    {
      name: "Conector Fast SC/APC",
      category: "Acessório",
      stock: 500,
      minStock: 100,
      unit: "un",
      price: 1.5,
    },
  ];

  for (const item of items) {
    await addDoc(collection(db, "inventory"), item);
  }
};

export async function handleCustomerReactivation(customerId: string, tenantId: string) {
  await updateDoc(doc(db, 'customers', customerId), {
    status: 'ativo',
    financial_status: 'em_dia',
    reactivated_at: serverTimestamp(),
    // Reset campos de retenção para cliente ser elegível novamente
    retention_discount_used_at: deleteField(),
    retention_discount_value: deleteField(),
    churn_risk: false,
    // Manter histórico em subcoleção
  });

  // Gravar histórico de reativação
  await addDoc(collection(doc(db, 'customers', customerId), 'status_history'), {
    event: 'REACTIVATED',
    previous_status: 'cancelado',
    timestamp: serverTimestamp()
  });
}

