import { adminDb as db, adminAuth as auth } from "./firebaseAdmin";
import admin from "./firebaseAdmin";
import { logger } from "./logger";
import forge from "node-forge";
import { getEmbeddingProvider } from './embeddingProvider';
import { getVectorStore } from './vectorStore';

export const getIntegrationKeys = async (tenantId: string = "default") => {
  try {
    // Try tenant-specific first
    if (tenantId && tenantId !== 'default') {
      const tenantDoc = await db.collection("tenants").doc(tenantId).collection("settings").doc("integrations").get();
      if (tenantDoc.exists) return tenantDoc.data();
    }
    
    // Fallback to global
    const doc = await db.collection("settings").doc("integrations").get();
    if (doc.exists) {
      return doc.data();
    }
    return {};
  } catch (err: any) {
    logger.error("error_fetching_integration_keys_admin", { error: err.message, tenant_id: tenantId });
    return {};
  }
};

export async function getGeminiKey(tenantId: string = 'default'): Promise<string> {
  try {
    const keys = await getIntegrationKeys(tenantId);
    if (keys?.gemini_api_key) return keys.gemini_api_key;
    if (keys?.geminiGlobal) return keys.geminiGlobal;
  } catch {}
  
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && !envKey.includes('placeholder')) {
    return envKey;
  }
  
  console.warn("getGeminiKey fallback failed - envKey type/val:", typeof envKey, envKey ? 'present (but rejected)' : 'missing');
  throw new Error(
    'Gemini API Key não configurada. ' +
    'Configure em Configurações → Provedores de IA no painel '
  );
}

export async function getOpenAIKey(tenantId: string = 'default'): Promise<string> {
  try {
    const keys = await getIntegrationKeys(tenantId);
    if (keys?.openai_api_key) return keys.openai_api_key;
    if (keys?.openaiChat) return keys.openaiChat;
    if (keys?.openaiGlobal) return keys.openaiGlobal;
  } catch {}
  
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && envKey.trim() !== '' && 
      !envKey.includes('placeholder') &&
      !envKey.includes('sua_chave')) {
    return envKey;
  }
  
  throw new Error(
    'OpenAI API Key não configurada. ' +
    'Configure em Configurações → Provedores de IA no painel.'
  );
}

export async function getAnthropicKey(tenantId: string = 'default'): Promise<string> {
  try {
    const keys = await getIntegrationKeys(tenantId);
    if (keys?.anthropic_api_key) return keys.anthropic_api_key;
    if (keys?.anthropicGlobal) return keys.anthropicGlobal;
  } catch {}
  
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.trim() !== '' &&
      !envKey.includes('placeholder')) {
    return envKey;
  }
  
  throw new Error(
    'Anthropic API Key não configurada. ' +
    'Configure em Configurações → Provedores de IA no painel.'
  );
}

export const getSystemPrompts = async (tenantId: string = 'default') => {
  try {
    const versionsRef = db.collection('prompts').doc(tenantId).collection('versions');
    const snapshot = await versionsRef.where('active', '==', true).get();
    
    if (!snapshot.empty) {
      const prompts: Record<string, string> = {};
      snapshot.forEach(d => {
        prompts[d.data().agent] = d.data().content;
      });
      return prompts;
    }
    
    const legacySnapshot = await db.collection('prompts').doc(tenantId).get();
    if (legacySnapshot.exists) {
      return legacySnapshot.data();
    }
    return null;
  } catch (err: any) {
    logger.error("error_fetching_system_prompts_admin", { error: err.message });
    return null;
  }
};

export const searchKnowledgeBase = async (
  searchTerm: string,
  tenantId: string = "default"
): Promise<{ text: string; title: string; score: number }[]> => {
  try {
    const embeddingProvider = await getEmbeddingProvider(tenantId);
    const vectorStore = await getVectorStore(tenantId);
    const queryEmbedding = await embeddingProvider.embed(searchTerm, tenantId);
    const results = await vectorStore.search(queryEmbedding, tenantId, 3);
    const MIN_SCORE = parseFloat(process.env.VECTOR_MIN_SCORE ?? '0.7');
    const relevant = results.filter((r: any) => r.score >= MIN_SCORE);

    if (relevant.length === 0) return [];

    return relevant.map((r: any) => ({
      text: r.text,
      title: r.metadata.title,
      score: r.score
    }));
  } catch (err: any) {
    logger.warn('vector_search_failed_fallback_admin', { error: err.message, tenant_id: tenantId });
    const snapshot = await db.collection('knowledge_base')
      .where('tenant_id', '==', tenantId)
      .limit(3)
      .get();
    return snapshot.docs.map(d => ({
      text: d.data().content,
      title: d.data().title,
      score: 0.5
    }));
  }
};

export const addToKnowledgeBase = async (
  article: { title: string; content: string; category: string; tenantId: string }
): Promise<string> => {
  const docRef = await db.collection('knowledge_base').add({
    title: article.title,
    content: article.content,
    category: article.category,
    tenant_id: article.tenantId,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    vector_indexed: false
  });

  try {
    const embeddingProvider = await getEmbeddingProvider(article.tenantId);
    const vectorStore = await getVectorStore(article.tenantId);
    const embedding = await embeddingProvider.embed(`${article.title}\n\n${article.content}`, article.tenantId);

    await vectorStore.upsert({
      id: docRef.id,
      text: article.content,
      embedding,
      metadata: {
        tenant_id: article.tenantId,
        category: article.category,
        title: article.title
      }
    }, article.tenantId);

    await docRef.update({ vector_indexed: true, vector_indexed_at: admin.firestore.FieldValue.serverTimestamp() });
  } catch (err) {
    logger.warn('Initial vector store indexing failed admin', { error: err });
  }

  return docRef.id;
};

export const deleteKBArticle = async (id: string) => {
  await db.collection("knowledge_base").doc(id).delete();
};

export const checkCoverageReal = async (cep: string) => {
  try {
    const keys = await getIntegrationKeys();
    const mapsKey = (keys as any).googleMapsKey;

    if (!mapsKey) {
      return {
        status: "manual_check_required",
        message: "A consulta de viabilidade técnica integrada (CTOs) está desativada ou restrita pela empresa mãe."
      };
    }

    const snapshot = await db.collection("network_ctos").where("cep", "==", cep).get();
    const ctos = snapshot.docs.map((doc) => doc.data());
    const available = ctos.some((cto) => (cto.usedPorts || 0) < (cto.totalPorts || 0));
    return {
      status: available ? "available" : "unavailable",
      ctos_found: ctos.length
    };
  } catch (err: any) {
    logger.error("error_checking_coverage_admin", { error: err.message });
    return { status: "manual_check_required" };
  }
};

export const getBillingStatusReal = async (cpf: string) => {
  try {
    const snapshot = await db.collection("invoices")
      .where("customer_cpf", "==", cpf)
      .where("status", "==", "pending")
      .get();
    
    if (snapshot.empty) return { status: "up_to_date" };
    
    const overdue = snapshot.docs.map(d => d.data());
    return {
      status: "overdue",
      count: overdue.length,
      total: overdue.reduce((sum, inv) => sum + (inv.amount || 0), 0),
      invoices: overdue
    };
  } catch (err: any) {
    logger.error("error_billing_status_admin", { error: err.message });
    return { status: "unknown" };
  }
};

export const runDiagnosticsReal = async (customerId: string) => {
  // Mock logic similar to db.ts
  const status = Math.random() > 0.3 ? "online" : "offline";
  const signal = status === "online" ? -18 - Math.floor(Math.random() * 15) : -99;
  
  return {
    status,
    signal_dbm: signal,
    last_reboot: new Date(Date.now() - 3600000 * 24).toISOString(),
    firmware: "v2.4.1-astrum"
  };
};

export const encryptCpf = (cpf: string): string => {
  if (!cpf) return cpf;
  const keyHex = process.env.VITE_CPF_ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";
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
  const keyHex = process.env.VITE_CPF_ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";
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

export const getIXCCredentials = async (tenantId: string = "default") => {
  const keys = await getIntegrationKeys(tenantId);
  return {
    url: keys?.ixcUrl || "",
    token: keys?.ixcToken ? decryptCpf(keys.ixcToken) : "",
    integrationKey: keys?.ixcIntegrationKey ? decryptCpf(keys.ixcIntegrationKey) : "",
  };
};

export const saveIXCCredentials = async (tenantId: string, credentials: { url: string; token: string; integrationKey: string }) => {
  const integrationRef = tenantId === 'default' 
    ? db.collection("settings").doc("integrations")
    : db.collection("tenants").doc(tenantId).collection("settings").doc("integrations");

  await integrationRef.set({
    ixcUrl: credentials.url,
    ixcToken: credentials.token ? encryptCpf(credentials.token) : "",
    ixcIntegrationKey: credentials.integrationKey ? encryptCpf(credentials.integrationKey) : ""
  }, { merge: true });
};

export const getVoalleCredentials = async (tenantId: string = "default") => {
  const keys = await getIntegrationKeys(tenantId);
  return {
    url: keys?.voalleUrl || "",
    clientId: keys?.voalleClientId ? decryptCpf(keys.voalleClientId) : "",
    clientSecret: keys?.voalleClientSecret ? decryptCpf(keys.voalleClientSecret) : "",
  };
};

export const saveVoalleCredentials = async (tenantId: string, credentials: { url: string; clientId: string; clientSecret: string }) => {
  const integrationRef = tenantId === 'default' 
    ? db.collection("settings").doc("integrations")
    : db.collection("tenants").doc(tenantId).collection("settings").doc("integrations");

  await integrationRef.set({
    voalleUrl: credentials.url,
    voalleClientId: credentials.clientId ? encryptCpf(credentials.clientId) : "",
    voalleClientSecret: credentials.clientSecret ? encryptCpf(credentials.clientSecret) : ""
  }, { merge: true });
};

export const getHubSoftCredentials = async (tenantId: string = "default") => {
  const keys = await getIntegrationKeys(tenantId);
  return {
    url: keys?.hubsoftUrl || "",
    token: keys?.hubsoftToken ? decryptCpf(keys.hubsoftToken) : "",
  };
};

export const saveHubSoftCredentials = async (tenantId: string, credentials: { url: string; token: string }) => {
  const integrationRef = tenantId === 'default' 
    ? db.collection("settings").doc("integrations")
    : db.collection("tenants").doc(tenantId).collection("settings").doc("integrations");

  await integrationRef.set({
    hubsoftUrl: credentials.url,
    hubsoftToken: credentials.token ? encryptCpf(credentials.token) : ""
  }, { merge: true });
};

export const getSGPCredentials = async (tenantId: string = "default") => {
  const keys = await getIntegrationKeys(tenantId);
  return {
    url: keys?.sgpUrl || "",
    token: keys?.sgpToken ? decryptCpf(keys.sgpToken) : "",
  };
};

export const saveSGPCredentials = async (tenantId: string, credentials: { url: string; token: string }) => {
  const integrationRef = tenantId === 'default' 
    ? db.collection("settings").doc("integrations")
    : db.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
  await integrationRef.set({
    sgpUrl: credentials.url,
    sgpToken: credentials.token ? encryptCpf(credentials.token) : ""
  }, { merge: true });
};

export const getRBXCredentials = async (tenantId: string = "default") => {
  const keys = await getIntegrationKeys(tenantId);
  return {
    url: keys?.rbxUrl || "",
    token: keys?.rbxToken ? decryptCpf(keys.rbxToken) : "",
  };
};

export const saveRBXCredentials = async (tenantId: string, credentials: { url: string; token: string }) => {
  const integrationRef = tenantId === 'default' 
    ? db.collection("settings").doc("integrations")
    : db.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
  await integrationRef.set({
    rbxUrl: credentials.url,
    rbxToken: credentials.token ? encryptCpf(credentials.token) : ""
  }, { merge: true });
};

export const maskCpfForLog = (cpf?: string): string => {
  if (!cpf) return "";
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 5) return "***";
  return cleanCpf.slice(0, 3) + "***" + cleanCpf.slice(-2);
};

export const incrementShardedCounter = async (name: string, tenantId: string = 'default') => {
  try {
    const counterRef = db.collection('counters').doc(`${tenantId}_${name}`);
    await counterRef.set({
      value: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err: any) {
    logger.error("error_incrementing_counter_admin", { error: err.message, data: { name, tenantId } });
  }
};
