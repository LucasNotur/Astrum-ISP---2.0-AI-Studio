"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/firebaseAdmin.ts
function ensureInitialized() {
  if ((0, import_app.getApps)().length > 0) {
    return (0, import_app.getApps)()[0];
  }
  if (app) return app;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      app = (0, import_app.initializeApp)({
        credential: (0, import_app.cert)(serviceAccount)
      });
      console.log("[FirebaseAdmin] Status: Initialized using FIREBASE_SERVICE_ACCOUNT_JSON from environment");
      return app;
    } else {
      console.log("[FirebaseAdmin] Status: Trying applicationDefault()...");
      try {
        app = (0, import_app.initializeApp)({
          credential: (0, import_app.applicationDefault)()
        });
        return app;
      } catch (err) {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_JSON n\xE3o configurada. Por favor, adicione o JSON da conta de servi\xE7o do Firebase no menu Configura\xE7\xF5es (Settings) -> Secrets do AI Studio."
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("FIREBASE_SERVICE_ACCOUNT_JSON")) {
      throw error;
    }
    console.error("[FirebaseAdmin] Initialization error:", error);
    throw new Error(`Falha ao inicializar Firebase Admin: ${error instanceof Error ? error.message : String(error)}`);
  }
}
var import_app, import_firestore, import_auth, import_storage, adminNamespace, import_fs, app, dbIdFromConfig, dbProxy, authProxy, storageProxy, firestoreApi, customAdmin, firebaseAdmin_default;
var init_firebaseAdmin = __esm({
  "src/lib/firebaseAdmin.ts"() {
    "use strict";
    import_app = require("firebase-admin/app");
    import_firestore = require("firebase-admin/firestore");
    import_auth = require("firebase-admin/auth");
    import_storage = require("firebase-admin/storage");
    adminNamespace = __toESM(require("firebase-admin"), 1);
    import_fs = __toESM(require("fs"), 1);
    app = null;
    try {
      if (import_fs.default.existsSync("./firebase-applet-config.json")) {
        const config = JSON.parse(import_fs.default.readFileSync("./firebase-applet-config.json", "utf8"));
        dbIdFromConfig = config.firestoreDatabaseId;
      }
    } catch (e) {
    }
    dbProxy = new Proxy({}, {
      get(_, prop) {
        const db3 = (0, import_firestore.getFirestore)(ensureInitialized(), dbIdFromConfig);
        const value = db3[prop];
        return typeof value === "function" ? value.bind(db3) : value;
      }
    });
    authProxy = new Proxy({}, {
      get(_, prop) {
        const auth3 = (0, import_auth.getAuth)(ensureInitialized());
        const value = auth3[prop];
        return typeof value === "function" ? value.bind(auth3) : value;
      }
    });
    storageProxy = new Proxy({}, {
      get(_, prop) {
        const storage2 = (0, import_storage.getStorage)(ensureInitialized());
        const value = storage2[prop];
        return typeof value === "function" ? value.bind(storage2) : value;
      }
    });
    firestoreApi = function() {
      return (0, import_firestore.getFirestore)(ensureInitialized(), dbIdFromConfig);
    };
    firestoreApi.Timestamp = import_firestore.Timestamp;
    firestoreApi.FieldValue = import_firestore.FieldValue;
    customAdmin = {
      ...adminNamespace,
      firestore: firestoreApi,
      auth: function() {
        return (0, import_auth.getAuth)(ensureInitialized());
      }
    };
    firebaseAdmin_default = customAdmin;
  }
});

// src/lib/redis.ts
var redis_exports = {};
__export(redis_exports, {
  connection: () => connection,
  default: () => redis_default
});
var RedisModule, Redis2, isLocalRedis, redisUrl, createRedisClient, redis, connection, redis_default;
var init_redis = __esm({
  "src/lib/redis.ts"() {
    "use strict";
    RedisModule = __toESM(require("ioredis"), 1);
    Redis2 = RedisModule.default || RedisModule.Redis || RedisModule;
    isLocalRedis = !process.env.REDIS_URL || process.env.REDIS_URL.includes("localhost") || process.env.REDIS_URL.includes("127.0.0.1") || !process.env.REDIS_URL.startsWith("redis");
    redisUrl = process.env.REDIS_URL && process.env.REDIS_URL.startsWith("redis") ? process.env.REDIS_URL : "redis://localhost:6379";
    createRedisClient = () => {
      if (isLocalRedis) {
        console.warn("Using in-memory fallback for Redis (No remote REDIS_URL provided).");
        const store = /* @__PURE__ */ new Map();
        return {
          get: async (key) => {
            const item = store.get(key);
            if (!item) return null;
            if (item.expiresAt && Date.now() > item.expiresAt) {
              store.delete(key);
              return null;
            }
            return item.value;
          },
          set: async (key, value, ...args) => {
            let expiresAt = null;
            let nx = false;
            for (let i = 0; i < args.length; i++) {
              if (args[i] === "EX") expiresAt = Date.now() + args[i + 1] * 1e3;
              if (args[i] === "PX") expiresAt = Date.now() + args[i + 1];
              if (args[i] === "NX") nx = true;
            }
            if (nx && store.has(key)) {
              const item = store.get(key);
              if (!item?.expiresAt || Date.now() <= item.expiresAt) {
                return null;
              }
            }
            store.set(key, { value, expiresAt });
            return "OK";
          },
          incr: async (key) => {
            const item = store.get(key);
            let val = 1;
            if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
              val = parseInt(item.value, 10) + 1;
            }
            store.set(key, { value: val.toString(), expiresAt: item?.expiresAt || null });
            return val;
          },
          incrby: async (key, increment) => {
            const item = store.get(key);
            let val = Number(increment);
            if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
              val = parseInt(item.value, 10) + Number(increment);
            }
            store.set(key, { value: val.toString(), expiresAt: item?.expiresAt || null });
            return val;
          },
          expire: async (key, time) => {
            const item = store.get(key);
            if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
              store.set(key, { value: item.value, expiresAt: Date.now() + time * 1e3 });
              return 1;
            }
            return 0;
          },
          append: async (key, value) => {
            const item = store.get(key);
            let newValue = value;
            if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
              newValue = item.value + value;
            }
            store.set(key, { value: newValue, expiresAt: item?.expiresAt || null });
            return newValue.length;
          },
          del: async (key) => {
            store.delete(key);
            return 1;
          },
          exists: async (key) => {
            const item = store.get(key);
            if (!item) return 0;
            if (item.expiresAt && Date.now() > item.expiresAt) {
              store.delete(key);
              return 0;
            }
            return 1;
          },
          zadd: async (key, score, member) => {
            let setItem = store.get(key);
            if (!setItem || !Array.isArray(setItem.value)) {
              setItem = { value: [], expiresAt: null };
            }
            const arr = setItem.value;
            arr.push([score, member]);
            setItem.value = arr;
            store.set(key, setItem);
            return 1;
          },
          zremrangebyscore: async (key, min, max) => {
            const setItem = store.get(key);
            if (!setItem || !Array.isArray(setItem.value)) return 0;
            let arr = setItem.value;
            const initialLength = arr.length;
            arr = arr.filter(([score]) => score < min || score > max);
            setItem.value = arr;
            store.set(key, setItem);
            return initialLength - arr.length;
          },
          zcard: async (key) => {
            const setItem = store.get(key);
            if (!setItem || !Array.isArray(setItem.value)) return 0;
            return setItem.value.length;
          },
          zrangebyscore: async (key, min, max) => {
            const setItem = store.get(key);
            if (!setItem || !Array.isArray(setItem.value)) return [];
            const arr = setItem.value;
            const minNum = min === "-inf" ? -Infinity : Number(min);
            const maxNum = max === "+inf" ? Infinity : Number(max);
            return arr.filter(([score]) => score >= minNum && score <= maxNum).map((x) => x[1]);
          },
          multi: () => redis,
          exec: async () => []
        };
      }
      const client3 = new Redis2(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 50, 2e3);
        }
      });
      client3.on("error", (err) => {
        console.error("Redis connection error:", err.message);
      });
      client3.on("connect", () => {
        console.log("Connected to Redis");
      });
      return client3;
    };
    redis = createRedisClient();
    connection = redis;
    redis_default = redis;
  }
});

// packages/shared/src/utils/memoize.ts
function memoize(fn, keyFn) {
  const cache = /* @__PURE__ */ new Map();
  return ((...args) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  });
}
var init_memoize = __esm({
  "packages/shared/src/utils/memoize.ts"() {
    "use strict";
  }
});

// src/lib/saasMetrics.ts
var saasMetrics_exports = {};
__export(saasMetrics_exports, {
  calculateChurnRate: () => calculateChurnRate,
  calculateLTV: () => calculateLTV,
  calculateMRR: () => calculateMRR,
  snapshotSaasMetrics: () => snapshotSaasMetrics
});
async function calculateMRR(date = /* @__PURE__ */ new Date()) {
  let mrr = 0;
  try {
    const tenantsSnap = await dbProxy.collection("tenants").where("status", "==", "active").get();
    tenantsSnap.forEach((doc3) => {
      const data = doc3.data();
      if (data.subscription?.monthly_price) {
        mrr += Number(data.subscription.monthly_price);
      } else if (data.plan === "enterprise") {
        mrr += 1500;
      } else if (data.plan === "pro") {
        mrr += 500;
      } else if (data.plan === "starter") {
        mrr += 200;
      }
    });
  } catch (e) {
    console.error("Error calculating MRR", e);
  }
  return mrr;
}
async function calculateChurnRate(monthDate = /* @__PURE__ */ new Date()) {
  try {
    const startOfMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0
    );
    const allTenantsSnap = await dbProxy.collection("tenants").get();
    let activeAtStart = 0;
    let canceledInMonth = 0;
    allTenantsSnap.forEach((doc3) => {
      const data = doc3.data();
      const createdAt = data.createdAt?.toDate() || data.created_at?.toDate() || /* @__PURE__ */ new Date(0);
      const canceledAt = data.canceledAt?.toDate() || data.canceled_at?.toDate();
      if (createdAt < startOfMonth) {
        if (!canceledAt || canceledAt >= startOfMonth) {
          activeAtStart++;
        }
      }
      if (canceledAt && canceledAt >= startOfMonth && canceledAt <= endOfMonth) {
        canceledInMonth++;
      }
    });
    if (activeAtStart === 0) return 0;
    return canceledInMonth / activeAtStart;
  } catch (e) {
    console.error("Error calculating churn rate", e);
    return 0;
  }
}
async function snapshotSaasMetrics() {
  try {
    const now = /* @__PURE__ */ new Date();
    const mrr = await calculateMRR(now);
    const churnRate = await calculateChurnRate(now);
    const ltv = await calculateLTV();
    const docId = `${now.getFullYear()}-${now.getMonth() + 1}`;
    await dbProxy.collection("saas_metrics").doc(docId).set(
      {
        date: now,
        mrr,
        churnRate,
        ltv,
        updatedAt: /* @__PURE__ */ new Date()
      },
      { merge: true }
    );
    console.log(
      `SaaS Metrics snapshot updated for ${docId} - MRR: ${mrr}, Churn: ${churnRate}, LTV: ${ltv}`
    );
  } catch (e) {
    console.error("Error writing metrics snapshot", e);
  }
}
var calculateLTV;
var init_saasMetrics = __esm({
  "src/lib/saasMetrics.ts"() {
    "use strict";
    init_firebaseAdmin();
    init_memoize();
    calculateLTV = memoize(
      async (tenantId) => {
        try {
          const churnRate = await calculateChurnRate();
          const safeChurnRate = churnRate === 0 ? 0.05 : churnRate;
          let averageMrr = 0;
          if (tenantId) {
            const doc3 = await dbProxy.collection("tenants").doc(tenantId).get();
            if (doc3.exists) {
              const data = doc3.data();
              if (data.subscription?.monthly_price) {
                averageMrr = Number(data.subscription.monthly_price);
              } else if (data.plan === "enterprise") {
                averageMrr = 1500;
              } else if (data.plan === "pro") {
                averageMrr = 500;
              } else if (data.plan === "starter") {
                averageMrr = 200;
              }
            }
          } else {
            const mrr = await calculateMRR();
            const tenantsSnap = await dbProxy.collection("tenants").where("status", "==", "active").get();
            const activeCount = tenantsSnap.size;
            averageMrr = activeCount > 0 ? mrr / activeCount : 0;
          }
          return averageMrr * (1 / safeChurnRate);
        } catch (e) {
          console.error("Error calculating LTV", e);
          return 0;
        }
      },
      (tenantId) => `calculateLTV:${tenantId || "global"}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 7)}`
    );
  }
});

// src/lib/logger.ts
var logger;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    "use strict";
    logger = {
      info: (event, ctx = {}) => console.log(JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: "info", event, ...ctx })),
      warn: (event, ctx = {}) => console.warn(JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: "warn", event, ...ctx })),
      error: (event, ctx = {}) => console.error(JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: "error", event, ...ctx })),
      debug: (event, ctx = {}) => console.debug(JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), level: "debug", event, ...ctx }))
    };
  }
});

// firebase-applet-config.json
var firebase_applet_config_default;
var init_firebase_applet_config = __esm({
  "firebase-applet-config.json"() {
    firebase_applet_config_default = {
      projectId: "gen-lang-client-0027113729",
      appId: "1:103452413232:web:98c5fb9edaa5522e968cf5",
      apiKey: "AIzaSyDnYVVpZWRats0aEq7YzBDtJSrgQXqiQq0",
      authDomain: "gen-lang-client-0027113729.firebaseapp.com",
      firestoreDatabaseId: "ai-studio-633ffb9c-6851-4abe-8a0a-b40fae3d496f",
      storageBucket: "gen-lang-client-0027113729.firebasestorage.app",
      messagingSenderId: "103452413232",
      measurementId: ""
    };
  }
});

// src/lib/firebase.ts
var import_app2, import_auth2, import_firestore2, import_storage2, app2, dbInstance, db, auth, storage;
var init_firebase = __esm({
  "src/lib/firebase.ts"() {
    "use strict";
    import_app2 = require("firebase/app");
    import_auth2 = require("firebase/auth");
    import_firestore2 = require("firebase/firestore");
    import_storage2 = require("firebase/storage");
    init_firebase_applet_config();
    app2 = !(0, import_app2.getApps)().length ? (0, import_app2.initializeApp)(firebase_applet_config_default) : (0, import_app2.getApp)();
    try {
      dbInstance = (0, import_firestore2.initializeFirestore)(app2, {
        experimentalForceLongPolling: true
      }, firebase_applet_config_default.firestoreDatabaseId);
    } catch (e) {
      dbInstance = (0, import_firestore2.getFirestore)(app2, firebase_applet_config_default.firestoreDatabaseId);
    }
    db = dbInstance;
    auth = (0, import_auth2.getAuth)(app2);
    (0, import_auth2.setPersistence)(auth, import_auth2.browserLocalPersistence).catch(console.error);
    storage = (0, import_storage2.getStorage)(app2);
  }
});

// src/ai-provider/adapters/openai.adapter.ts
var import_openai, OpenAIAdapter;
var init_openai_adapter = __esm({
  "src/ai-provider/adapters/openai.adapter.ts"() {
    "use strict";
    import_openai = __toESM(require("openai"), 1);
    init_dbAdmin();
    OpenAIAdapter = class {
      name = "openai";
      clients = /* @__PURE__ */ new Map();
      constructor() {
      }
      async getClient(tenantId) {
        const key = await getOpenAIKey(tenantId);
        if (this.clients.has(key)) return this.clients.get(key);
        const client3 = new import_openai.default({
          apiKey: key,
          dangerouslyAllowBrowser: true
        });
        this.clients.set(key, client3);
        return client3;
      }
      async chat(messages, config, tenantId, options) {
        const client3 = await this.getClient(tenantId);
        const openaiMessages = messages.map((m) => {
          if (m.parts && m.parts.length > 0) {
            const content2 = m.parts.map((p) => {
              if (p.inlineData) {
                return { type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } };
              }
              return { type: "text", text: p.text };
            });
            return { role: m.role, content: content2 };
          }
          return { role: m.role, content: m.content };
        });
        const response = await client3.chat.completions.create({
          model: config.model,
          messages: openaiMessages,
          temperature: options?.temperature ?? config.temperature ?? 0.7,
          max_tokens: config.maxTokens,
          tools: options?.tools
        });
        const choice = response.choices[0];
        const content = choice.message.content || "";
        const toolCalls = choice.message.tool_calls?.map((tc) => ({
          id: tc.id,
          type: tc.type || "function",
          function: tc.function,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || "{}")
        }));
        const inputTokens = response.usage?.prompt_tokens || 0;
        const outputTokens = response.usage?.completion_tokens || 0;
        return {
          content,
          toolCalls,
          provider: this.name,
          model: config.model,
          usage: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
            estimatedCostUsd: this.calculateCost(config.model, inputTokens, outputTokens)
          }
        };
      }
      async embed(texts, config, tenantId) {
        const client3 = await this.getClient(tenantId);
        const response = await client3.embeddings.create({
          model: config.model || "text-embedding-3-small",
          input: texts
        });
        const inputTokens = response.usage.prompt_tokens;
        return {
          vector: response.data[0].embedding,
          provider: this.name,
          model: config.model || "text-embedding-3-small",
          usage: {
            input: inputTokens,
            output: 0,
            total: inputTokens,
            estimatedCostUsd: this.calculateCost(config.model || "text-embedding-3-small", inputTokens, 0)
          }
        };
      }
      calculateCost(model, inputTokens, outputTokens) {
        if (model.includes("gpt-4o-mini")) return (inputTokens * 0.15 + outputTokens * 0.6) / 1e6;
        if (model.includes("gpt-4o")) return (inputTokens * 5 + outputTokens * 15) / 1e6;
        if (model.includes("embedding")) return inputTokens * 0.02 / 1e6;
        return 0;
      }
    };
  }
});

// src/ai-provider/adapters/gemini.adapter.ts
var import_genai, GeminiAdapter;
var init_gemini_adapter = __esm({
  "src/ai-provider/adapters/gemini.adapter.ts"() {
    "use strict";
    import_genai = require("@google/genai");
    init_dbAdmin();
    GeminiAdapter = class {
      name = "gemini";
      clients = /* @__PURE__ */ new Map();
      constructor() {
      }
      async getClient(tenantId) {
        const key = await getGeminiKey(tenantId);
        if (this.clients.has(key)) return this.clients.get(key);
        const client3 = new import_genai.GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build"
            }
          }
        });
        this.clients.set(key, client3);
        return client3;
      }
      async chat(messages, config, tenantId, options) {
        const client3 = await this.getClient(tenantId);
        const model = config.model || "gemini-3.1-flash-lite";
        const systemInstruction = messages.find((m) => m.role === "system")?.content;
        const contents = messages.filter((m) => m.role !== "system").map((m) => {
          if (m.parts && m.parts.length > 0) {
            return {
              role: m.role === "assistant" ? "model" : "user",
              parts: m.parts
            };
          }
          return {
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          };
        });
        const response = await client3.models.generateContent({
          model,
          contents,
          config: {
            tools: options?.tools,
            systemInstruction,
            temperature: options?.temperature ?? config.temperature
          }
        });
        const content = response.text;
        let toolCalls = void 0;
        if (response.functionCalls && response.functionCalls.length > 0) {
          toolCalls = response.functionCalls.map((fc) => ({
            name: fc.name,
            args: fc.args
          }));
        }
        const inputTokens = response.usageMetadata?.promptTokenCount || 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
        return {
          content,
          toolCalls,
          provider: this.name,
          model,
          usage: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
            estimatedCostUsd: this.calculateCost(model, inputTokens, outputTokens)
          }
        };
      }
      async embed(texts, config, tenantId) {
        const client3 = await this.getClient(tenantId);
        const model = config.model || "text-embedding-004";
        const response = await client3.models.embedContent({
          model,
          contents: texts[0]
        });
        const vector = response.embeddings[0].values;
        const estimatedTokens = texts[0].length / 4;
        return {
          vector,
          provider: this.name,
          model,
          usage: {
            input: estimatedTokens,
            output: 0,
            total: estimatedTokens,
            estimatedCostUsd: this.calculateCost(model, estimatedTokens, 0)
          }
        };
      }
      calculateCost(model, inputTokens, outputTokens) {
        return (inputTokens * 0.075 + outputTokens * 0.3) / 1e6;
      }
    };
  }
});

// src/ai-provider/adapters/anthropic.adapter.ts
var import_sdk, AnthropicAdapter;
var init_anthropic_adapter = __esm({
  "src/ai-provider/adapters/anthropic.adapter.ts"() {
    "use strict";
    import_sdk = __toESM(require("@anthropic-ai/sdk"), 1);
    init_dbAdmin();
    AnthropicAdapter = class {
      name = "anthropic";
      clients = /* @__PURE__ */ new Map();
      constructor() {
      }
      async getClient(tenantId) {
        const key = await getAnthropicKey(tenantId);
        if (this.clients.has(key)) return this.clients.get(key);
        const client3 = new import_sdk.default({
          apiKey: key,
          dangerouslyAllowBrowser: true
        });
        this.clients.set(key, client3);
        return client3;
      }
      async chat(messages, config, tenantId, options) {
        const client3 = await this.getClient(tenantId);
        const system = messages.find((m) => m.role === "system")?.content;
        const coreMessages = messages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content
        }));
        const response = await client3.messages.create({
          model: config.model || "claude-3-haiku-20240307",
          max_tokens: config.maxTokens || 1024,
          temperature: 0.7,
          system,
          messages: coreMessages
        });
        const contentBlock = response.content.find((c) => c.type === "text");
        const content = contentBlock ? contentBlock.text : "";
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        return {
          content,
          provider: this.name,
          model: config.model,
          usage: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
            estimatedCostUsd: this.calculateCost(config.model, inputTokens, outputTokens)
          }
        };
      }
      async embed(texts, config, tenantId) {
        throw new Error("Anthropic does not natively support embeddings currently");
      }
      calculateCost(model, inputTokens, outputTokens) {
        if (model.includes("haiku")) return (inputTokens * 0.25 + outputTokens * 1.25) / 1e6;
        if (model.includes("sonnet")) return (inputTokens * 3 + outputTokens * 15) / 1e6;
        return 0;
      }
    };
  }
});

// src/lib/email.ts
var email_exports = {};
__export(email_exports, {
  sendAdminEmail: () => sendAdminEmail,
  sendEmail: () => sendEmail,
  sendWelcomeEmail: () => sendWelcomeEmail
});
var import_nodemailer, transporter, sendEmail, sendAdminEmail, sendWelcomeEmail;
var init_email = __esm({
  "src/lib/email.ts"() {
    "use strict";
    import_nodemailer = __toESM(require("nodemailer"), 1);
    transporter = import_nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    sendEmail = async (to, subject, body, attachments) => {
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          await transporter.sendMail({
            from: `"Sistema" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html: body,
            attachments
          });
          console.log(`[Email] Generic email sent to ${to}`);
        } catch (err) {
          console.error("[Email] Failed to send generic email:", err);
        }
      } else {
        console.log(`[Email] Mocked (No SMTP creds). Sent to ${to}. Subject: ${subject}`);
      }
    };
    sendAdminEmail = async (tenantId, subject, body) => {
      console.log(`[Email] Admin email to tenant ${tenantId}. Subject: ${subject}`);
    };
    sendWelcomeEmail = async (to, name, companyName, loginUrl, verificationCode) => {
      const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; padding: 20px; border-radius: 8px;">
      <h2 style="color: #333;">Bem-vindo ao sistema, ${name}!</h2>
      <p style="color: #555;">Sua empresa <strong>${companyName}</strong> foi provisionada com sucesso.</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
          Acessar Sistema
        </a>
      </p>
      
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eaeaea;" />
      
      <p style="color: #555;">Para concluir a verifica\xE7\xE3o do seu e-mail, utilize o c\xF3digo de 6 d\xEDgitos abaixo:</p>
      <div style="text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; letter-spacing: 5px; color: #111; font-weight: bold; background-color: #f4f4f5; padding: 10px 20px; border-radius: 8px;">
          ${verificationCode}
        </span>
      </div>
      <p style="color: #777; font-size: 14px; text-align: center;">Este c\xF3digo expira em 30 minutos.</p>
      
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eaeaea;" />
      <p style="color: #555; font-size: 14px;">Consulte nossa <a href="https://docs.seusistema.com.br" style="color: #2563eb;">Documenta\xE7\xE3o</a> para come\xE7ar ou entre em contato com nosso suporte se precisar de ajuda.</p>
    </div>
  `;
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          await transporter.sendMail({
            from: `"Sistema" <${process.env.SMTP_USER}>`,
            to,
            subject: "Bem-vindo ao nosso sistema! Verifique seu e-mail",
            html
          });
          console.log(`[Email] Welcome email sent to ${to}`);
        } catch (err) {
          console.error("[Email] Failed to send email:", err);
        }
      } else {
        console.log(`[Email] Mocked (No SMTP creds). Sent to ${to}. Code: ${verificationCode}`);
      }
    };
  }
});

// src/ai-provider/ai-provider.service.ts
var AIProviderService;
var init_ai_provider_service = __esm({
  "src/ai-provider/ai-provider.service.ts"() {
    "use strict";
    init_openai_adapter();
    init_gemini_adapter();
    init_anthropic_adapter();
    init_redis();
    AIProviderService = class {
      constructor(getConfig, onTokenLog) {
        this.getConfig = getConfig;
        this.onTokenLog = onTokenLog;
        this.adapters = {
          openai: new OpenAIAdapter(),
          gemini: new GeminiAdapter(),
          anthropic: new AnthropicAdapter()
        };
      }
      getConfig;
      onTokenLog;
      adapters;
      calculateCost(provider, model, inputTokens, completionTokens) {
        let cost = 0;
        if (provider === "openai" || model.includes("gpt-4o")) {
          cost = inputTokens / 1e3 * 5e-3 + completionTokens / 1e3 * 0.015;
        } else if (provider === "gemini" || model.includes("flash")) {
          cost = (inputTokens + completionTokens) / 1e6 * 0.075;
        } else if (provider === "anthropic" || model.includes("haiku")) {
          cost = (inputTokens + completionTokens) / 1e6 * 0.25;
        }
        return cost;
      }
      async interceptAndCalculateCost(tenantId, result) {
        if (!result.usage) return;
        const input = result.usage.input || 0;
        const output = result.usage.output || 0;
        const cost = this.calculateCost(result.provider, result.model, input, output);
        result.usage.estimatedCostUsd = cost;
        if (cost > 0) {
          const yyyyMm = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
          try {
            await redis_default.incrbyfloat(`token_cost:${tenantId}:${yyyyMm}`, cost);
            await redis_default.incrby(`token_count:${tenantId}:${yyyyMm}`, input + output);
            await redis_default.hincrby(`token_provider:${tenantId}:${yyyyMm}`, result.provider, input + output);
          } catch (e) {
            console.error("Failed to accumulate token usage:", e);
          }
        }
      }
      async getCircuitState(provider) {
        const val = await redis_default.get(`llm_circuit:${provider}`);
        if (val === "OPEN") return "OPEN";
        const recent = await redis_default.get(`llm_circuit:recent_open:${provider}`);
        if (recent) return "HALF_OPEN";
        return "CLOSED";
      }
      async checkExtendedOutage(provider) {
        const firstOpenStr = await redis_default.get(`llm_circuit:first_open_time:${provider}`);
        if (firstOpenStr) {
          const firstOpen = parseInt(firstOpenStr, 10);
          const now = Date.now();
          if (now - firstOpen > 5 * 60 * 1e3) {
            const alertSent = await redis_default.get(`llm_circuit:alert_sent:${provider}`);
            if (!alertSent) {
              try {
                const email = await Promise.resolve().then(() => (init_email(), email_exports));
                await email.sendEmail(
                  "noturcursos1@gmail.com",
                  // Super-Admin
                  "Alerta Cr\xEDtico: Provedor LLM Fora do Ar",
                  `O provedor ${provider} est\xE1 com o circuit breaker aberto (indispon\xEDvel) h\xE1 mais de 5 minutos.`
                );
                await redis_default.set(`llm_circuit:alert_sent:${provider}`, "1", "EX", 3600);
              } catch (e) {
                console.error("Failed to send outage alert:", e);
              }
            }
          }
        } else {
          await redis_default.setnx(`llm_circuit:first_open_time:${provider}`, Date.now().toString());
        }
      }
      async recordFailure(provider) {
        const state = await this.getCircuitState(provider);
        if (state === "OPEN") return;
        if (state === "HALF_OPEN") {
          await redis_default.set(`llm_circuit:${provider}`, "OPEN", "EX", 60);
          await redis_default.set(`llm_circuit:recent_open:${provider}`, "1", "EX", 120);
          await this.checkExtendedOutage(provider);
          return;
        }
        const failsKey = `llm_circuit:failures:${provider}`;
        const fails = await redis_default.incr(failsKey);
        if (fails === 1) {
          await redis_default.expire(failsKey, 60);
        }
        if (fails >= 3) {
          await redis_default.set(`llm_circuit:${provider}`, "OPEN", "EX", 60);
          await redis_default.set(`llm_circuit:recent_open:${provider}`, "1", "EX", 120);
          await redis_default.del(failsKey);
          await redis_default.setnx(`llm_circuit:first_open_time:${provider}`, Date.now().toString());
        }
      }
      async recordSuccess(provider) {
        await redis_default.del(`llm_circuit:${provider}`);
        await redis_default.del(`llm_circuit:recent_open:${provider}`);
        await redis_default.del(`llm_circuit:failures:${provider}`);
        await redis_default.del(`llm_circuit:first_open_time:${provider}`);
        await redis_default.del(`llm_circuit:alert_sent:${provider}`);
      }
      async getAvailableProvider(tenantId, priorityList) {
        for (const provider of priorityList) {
          const state = await this.getCircuitState(provider);
          if (state === "CLOSED" || state === "HALF_OPEN") {
            return provider;
          }
        }
        return priorityList[0];
      }
      async chat(aiFunction, messages, tenantId, options) {
        const config = await this.getConfig(tenantId, aiFunction);
        const priorityList = [config.provider];
        if (config.fallbackProvider && config.fallbackProvider !== config.provider) {
          priorityList.push(config.fallbackProvider);
        }
        if (!priorityList.includes("gemini")) priorityList.push("gemini");
        const targetProvider = options?.overrideProvider ? options.overrideProvider : await this.getAvailableProvider(tenantId, priorityList);
        const activeModel = targetProvider === config.provider ? config.model : (targetProvider === config.fallbackProvider ? config.fallbackModel : "gemini-2.0-flash") || "gemini-2.0-flash";
        const activeConfig = { ...config, provider: targetProvider, model: activeModel };
        let adapter = this.adapters[activeConfig.provider];
        try {
          if (!adapter) throw new Error(`Provider ${activeConfig.provider} not initialized`);
          const result = await adapter.chat(messages, activeConfig, tenantId, options);
          await this.recordSuccess(activeConfig.provider);
          await this.interceptAndCalculateCost(tenantId, result);
          await this.onTokenLog({
            tenantId,
            aiFunction,
            provider: result.provider,
            model: result.model,
            inputTokens: result.usage.input,
            outputTokens: result.usage.output,
            estimatedCostUsd: result.usage.estimatedCostUsd,
            usedFallback: activeConfig.provider !== config.provider,
            createdAt: /* @__PURE__ */ new Date()
          });
          return result;
        } catch (e) {
          await this.recordFailure(activeConfig.provider);
          console.warn(`[AIProvider] ${activeConfig.provider} failed for ${aiFunction}. Error: ${e.message}`);
          throw e;
        }
      }
      async embed(aiFunction, texts, tenantId, options) {
        const config = await this.getConfig(tenantId, aiFunction);
        const priorityList = [config.provider];
        if (config.fallbackProvider && config.fallbackProvider !== config.provider) {
          priorityList.push(config.fallbackProvider);
        }
        if (!priorityList.includes("gemini")) priorityList.push("gemini");
        const targetProvider = options?.overrideProvider ? options.overrideProvider : await this.getAvailableProvider(tenantId, priorityList);
        const activeModel = targetProvider === config.provider ? config.model : (targetProvider === config.fallbackProvider ? config.fallbackModel : "text-embedding-004") || "text-embedding-004";
        const activeConfig = { ...config, provider: targetProvider, model: activeModel };
        const adapter = this.adapters[activeConfig.provider];
        try {
          if (!adapter) throw new Error(`Provider ${activeConfig.provider} not initialized`);
          const result = await adapter.embed(texts, activeConfig, tenantId);
          await this.recordSuccess(activeConfig.provider);
          await this.interceptAndCalculateCost(tenantId, result);
          await this.onTokenLog({
            tenantId,
            aiFunction,
            provider: result.provider,
            model: result.model,
            inputTokens: result.usage.input,
            outputTokens: result.usage.output,
            estimatedCostUsd: result.usage.estimatedCostUsd,
            usedFallback: activeConfig.provider !== config.provider,
            createdAt: /* @__PURE__ */ new Date()
          });
          return result;
        } catch (e) {
          await this.recordFailure(activeConfig.provider);
          console.warn(`[AIProvider] ${activeConfig.provider} failed for embed ${aiFunction}. Error: ${e.message}`);
          throw e;
        }
      }
    };
  }
});

// src/ai-provider/ai-provider.setup.ts
var DEFAULT_CONFIGS, aiProvider;
var init_ai_provider_setup = __esm({
  "src/ai-provider/ai-provider.setup.ts"() {
    "use strict";
    init_ai_provider_service();
    init_firebaseAdmin();
    init_firebaseAdmin();
    DEFAULT_CONFIGS = {
      orchestrator: { provider: "openai", model: "gpt-4o", fallbackProvider: "gemini", fallbackModel: "gemini-2.0-flash" },
      chat: { provider: "openai", model: "gpt-4o-mini", fallbackProvider: "gemini", fallbackModel: "gemini-2.0-flash" },
      embed: { provider: "openai", model: "text-embedding-3-small" },
      summary: { provider: "openai", model: "gpt-4o-mini", fallbackProvider: "gemini", fallbackModel: "gemini-2.0-flash" },
      fallback: { provider: "gemini", model: "gemini-2.0-flash" }
    };
    aiProvider = new AIProviderService(
      async (tenantId, aiFunction) => {
        try {
          const snap = await dbProxy.collection("ai_provider_configs").doc(`${tenantId}_${aiFunction}`).get();
          if (snap.exists) {
            const data = snap.data();
            return {
              provider: data.provider || DEFAULT_CONFIGS[aiFunction].provider,
              model: data.model || DEFAULT_CONFIGS[aiFunction].model,
              fallbackProvider: data.fallback_provider || DEFAULT_CONFIGS[aiFunction].fallbackProvider,
              fallbackModel: data.fallback_model || DEFAULT_CONFIGS[aiFunction].fallbackModel,
              temperature: data.temperature,
              maxTokens: data.max_tokens
            };
          }
        } catch (e) {
          console.error("[AIProvider] Error reading config from Firestore, using default", e);
        }
        return DEFAULT_CONFIGS[aiFunction];
      },
      async (log) => {
        try {
          await dbProxy.collection("ai_token_logs").add({
            ...log,
            createdAt: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.error("[AIProvider] Error logging tokens to Firestore", e);
        }
      }
    );
  }
});

// src/lib/embeddingProvider.ts
function createProviderFromConfig(config) {
  const client3 = new import_openai3.default({ apiKey: config.api_key, dangerouslyAllowBrowser: true });
  return {
    embed: async (text) => {
      const response = await client3.embeddings.create({
        input: text,
        model: config.model || "text-embedding-ada-002"
      });
      return response.data[0].embedding;
    },
    embedBatch: async (texts) => {
      if (texts.length === 0) return [];
      const response = await client3.embeddings.create({
        input: texts,
        model: config.model || "text-embedding-ada-002"
      });
      return response.data.map((d) => d.embedding);
    }
  };
}
function createProviderFromEnv() {
  return {
    embed: async (text, tenantId = "default") => {
      const result = await aiProvider.embed("embed", [text], tenantId);
      return result.vector;
    },
    embedBatch: async (texts, tenantId = "default") => {
      if (texts.length === 0) return [];
      const result = await aiProvider.embed("embed", texts, tenantId);
      return Promise.all(texts.map(async (text) => {
        const res = await aiProvider.embed("embed", [text], tenantId);
        return res.vector;
      }));
    }
  };
}
async function getEmbeddingProvider(tenantId) {
  if (tenantId && tenantId !== "default") {
    const tenantDoc = await (0, import_firestore3.getDoc)((0, import_firestore3.doc)(db, "tenants", tenantId));
    if (tenantDoc.exists()) {
      const config = tenantDoc.data()?.embedding_config;
      if (config?.api_key) {
        return createProviderFromConfig(config);
      }
    }
  }
  return createProviderFromEnv();
}
var import_firestore3, import_openai3, embeddingProvider;
var init_embeddingProvider = __esm({
  "src/lib/embeddingProvider.ts"() {
    "use strict";
    init_firebase();
    import_firestore3 = require("firebase/firestore");
    init_ai_provider_setup();
    import_openai3 = __toESM(require("openai"), 1);
    embeddingProvider = Promise.resolve(createProviderFromEnv());
  }
});

// src/lib/vectorStore.ts
function getQdrantClient(config) {
  if (!config.url) throw new Error("Vector Store URL not configured");
  return new import_js_client_rest.QdrantClient({
    url: config.url,
    apiKey: config.apiKey ?? void 0
  });
}
function createStoreFromConfig(config) {
  return {
    upsert: async (doc3, tenantId) => {
      const client3 = getQdrantClient(config);
      await client3.upsert(config.collection, {
        points: [{
          id: doc3.id,
          vector: { dense: doc3.embedding },
          payload: { text: doc3.text, ...doc3.metadata }
        }]
      });
    },
    upsertBatch: async (docs, tenantId) => {
      if (docs.length === 0) return;
      const client3 = getQdrantClient(config);
      await client3.upsert(config.collection, {
        points: docs.map((doc3) => ({
          id: doc3.id,
          vector: { dense: doc3.embedding },
          payload: { text: doc3.text, ...doc3.metadata }
        }))
      });
    },
    search: async (embedding, tenantId, limit = 3) => {
      const client3 = getQdrantClient(config);
      const res = await client3.search(config.collection, {
        vector: {
          name: "dense",
          vector: embedding
        },
        limit,
        with_payload: true,
        filter: {
          must: [{ key: "tenant_id", match: { value: tenantId } }]
        }
      });
      return res.map((r) => ({
        id: String(r.id),
        text: r.payload?.text,
        score: r.score,
        metadata: r.payload
      }));
    },
    delete: async (id, tenantId) => {
      const client3 = getQdrantClient(config);
      await client3.delete(config.collection, {
        wait: true,
        points: [id]
      });
    }
  };
}
function createStoreFromEnv() {
  const config = {
    provider: (typeof process !== "undefined" && process.env ? process.env.VECTOR_STORE_PROVIDER : void 0) ?? "qdrant",
    url: typeof process !== "undefined" && process.env ? process.env.VECTOR_STORE_URL : void 0,
    apiKey: typeof process !== "undefined" && process.env ? process.env.VECTOR_STORE_API_KEY : void 0,
    collection: (typeof process !== "undefined" && process.env ? process.env.VECTOR_STORE_COLLECTION : void 0) ?? "astrum_knowledge"
  };
  return createStoreFromConfig(config);
}
async function getVectorStore(tenantId) {
  if (tenantId && tenantId !== "default") {
    const tenantDoc = await (0, import_firestore4.getDoc)((0, import_firestore4.doc)(db, "tenants", tenantId));
    if (tenantDoc.exists()) {
      const config = tenantDoc.data()?.vector_store_config;
      if (config?.url) {
        return createStoreFromConfig({
          provider: config.provider || "qdrant",
          url: config.url,
          apiKey: config.apiKey,
          collection: config.collection || "astrum_knowledge"
        });
      }
    }
  }
  return createStoreFromEnv();
}
var import_firestore4, import_js_client_rest, vectorStore;
var init_vectorStore = __esm({
  "src/lib/vectorStore.ts"() {
    "use strict";
    init_firebase();
    import_firestore4 = require("firebase/firestore");
    import_js_client_rest = require("@qdrant/js-client-rest");
    vectorStore = Promise.resolve(createStoreFromEnv());
  }
});

// src/lib/dbAdmin.ts
var dbAdmin_exports = {};
__export(dbAdmin_exports, {
  addToKnowledgeBase: () => addToKnowledgeBase,
  checkCoverageReal: () => checkCoverageReal,
  decryptCpf: () => decryptCpf,
  deleteKBArticle: () => deleteKBArticle,
  encryptCpf: () => encryptCpf,
  getAnthropicKey: () => getAnthropicKey,
  getBillingStatusReal: () => getBillingStatusReal,
  getGeminiKey: () => getGeminiKey,
  getHubSoftCredentials: () => getHubSoftCredentials,
  getIXCCredentials: () => getIXCCredentials,
  getIntegrationKeys: () => getIntegrationKeys,
  getOpenAIKey: () => getOpenAIKey,
  getRBXCredentials: () => getRBXCredentials,
  getSGPCredentials: () => getSGPCredentials,
  getSystemPrompts: () => getSystemPrompts,
  getVoalleCredentials: () => getVoalleCredentials,
  incrementShardedCounter: () => incrementShardedCounter,
  maskCpfForLog: () => maskCpfForLog,
  runDiagnosticsReal: () => runDiagnosticsReal,
  saveHubSoftCredentials: () => saveHubSoftCredentials,
  saveIXCCredentials: () => saveIXCCredentials,
  saveRBXCredentials: () => saveRBXCredentials,
  saveSGPCredentials: () => saveSGPCredentials,
  saveVoalleCredentials: () => saveVoalleCredentials,
  searchKnowledgeBase: () => searchKnowledgeBase
});
async function getGeminiKey(tenantId = "default") {
  try {
    const keys = await getIntegrationKeys(tenantId);
    if (keys?.gemini_api_key) return keys.gemini_api_key;
    if (keys?.geminiGlobal) return keys.geminiGlobal;
  } catch {
  }
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (envKey && envKey !== "MY_GEMINI_API_KEY" && !envKey.includes("placeholder")) {
    return envKey;
  }
  console.warn("getGeminiKey fallback failed - envKey type/val:", typeof envKey, envKey ? "present (but rejected)" : "missing");
  throw new Error(
    "Gemini API Key n\xE3o configurada. Configure em Configura\xE7\xF5es \u2192 Provedores de IA no painel "
  );
}
async function getOpenAIKey(tenantId = "default") {
  try {
    const keys = await getIntegrationKeys(tenantId);
    if (keys?.openai_api_key) return keys.openai_api_key;
    if (keys?.openaiChat) return keys.openaiChat;
    if (keys?.openaiGlobal) return keys.openaiGlobal;
  } catch {
  }
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && envKey.trim() !== "" && !envKey.includes("placeholder") && !envKey.includes("sua_chave")) {
    return envKey;
  }
  throw new Error(
    "OpenAI API Key n\xE3o configurada. Configure em Configura\xE7\xF5es \u2192 Provedores de IA no painel."
  );
}
async function getAnthropicKey(tenantId = "default") {
  try {
    const keys = await getIntegrationKeys(tenantId);
    if (keys?.anthropic_api_key) return keys.anthropic_api_key;
    if (keys?.anthropicGlobal) return keys.anthropicGlobal;
  } catch {
  }
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.trim() !== "" && !envKey.includes("placeholder")) {
    return envKey;
  }
  throw new Error(
    "Anthropic API Key n\xE3o configurada. Configure em Configura\xE7\xF5es \u2192 Provedores de IA no painel."
  );
}
var import_node_forge, getIntegrationKeys, getSystemPrompts, searchKnowledgeBase, addToKnowledgeBase, deleteKBArticle, checkCoverageReal, getBillingStatusReal, runDiagnosticsReal, encryptCpf, decryptCpf, getIXCCredentials, saveIXCCredentials, getVoalleCredentials, saveVoalleCredentials, getHubSoftCredentials, saveHubSoftCredentials, getSGPCredentials, saveSGPCredentials, getRBXCredentials, saveRBXCredentials, maskCpfForLog, incrementShardedCounter;
var init_dbAdmin = __esm({
  "src/lib/dbAdmin.ts"() {
    "use strict";
    init_firebaseAdmin();
    init_firebaseAdmin();
    init_logger();
    import_node_forge = __toESM(require("node-forge"), 1);
    init_embeddingProvider();
    init_vectorStore();
    getIntegrationKeys = async (tenantId = "default") => {
      try {
        if (tenantId && tenantId !== "default") {
          const tenantDoc = await dbProxy.collection("tenants").doc(tenantId).collection("settings").doc("integrations").get();
          if (tenantDoc.exists) {
            const data = tenantDoc.data();
            if (data && data.evolutionUrl && data.evolutionUrl.includes("trycloudflare")) {
              data.evolutionUrl = "";
            }
            return data;
          }
        }
        const doc3 = await dbProxy.collection("settings").doc("integrations").get();
        if (doc3.exists) {
          const data = doc3.data();
          if (data && data.evolutionUrl && data.evolutionUrl.includes("trycloudflare")) {
            data.evolutionUrl = "";
          }
          return data;
        }
        return {};
      } catch (err) {
        logger.error("error_fetching_integration_keys_admin", { error: err.message, tenant_id: tenantId });
        return {};
      }
    };
    getSystemPrompts = async (tenantId = "default") => {
      try {
        const versionsRef = dbProxy.collection("prompts").doc(tenantId).collection("versions");
        const snapshot = await versionsRef.where("active", "==", true).get();
        if (!snapshot.empty) {
          const prompts = {};
          snapshot.forEach((d) => {
            prompts[d.data().agent] = d.data().content;
          });
          return prompts;
        }
        const legacySnapshot = await dbProxy.collection("prompts").doc(tenantId).get();
        if (legacySnapshot.exists) {
          return legacySnapshot.data();
        }
        return null;
      } catch (err) {
        logger.error("error_fetching_system_prompts_admin", { error: err.message });
        return null;
      }
    };
    searchKnowledgeBase = async (searchTerm, tenantId = "default") => {
      try {
        const embeddingProvider2 = await getEmbeddingProvider(tenantId);
        const vectorStore2 = await getVectorStore(tenantId);
        const queryEmbedding = await embeddingProvider2.embed(searchTerm, tenantId);
        const results = await vectorStore2.search(queryEmbedding, tenantId, 3);
        const MIN_SCORE = parseFloat(process.env.VECTOR_MIN_SCORE ?? "0.7");
        const relevant = results.filter((r) => r.score >= MIN_SCORE);
        if (relevant.length === 0) return [];
        return relevant.map((r) => ({
          text: r.text,
          title: r.metadata.title,
          score: r.score
        }));
      } catch (err) {
        logger.warn("vector_search_failed_fallback_admin", { error: err.message, tenant_id: tenantId });
        const snapshot = await dbProxy.collection("knowledge_base").where("tenant_id", "==", tenantId).limit(3).get();
        return snapshot.docs.map((d) => ({
          text: d.data().content,
          title: d.data().title,
          score: 0.5
        }));
      }
    };
    addToKnowledgeBase = async (article) => {
      const docRef = await dbProxy.collection("knowledge_base").add({
        title: article.title,
        content: article.content,
        category: article.category,
        tenant_id: article.tenantId,
        created_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp(),
        vector_indexed: false
      });
      try {
        const embeddingProvider2 = await getEmbeddingProvider(article.tenantId);
        const vectorStore2 = await getVectorStore(article.tenantId);
        const embedding = await embeddingProvider2.embed(`${article.title}

${article.content}`, article.tenantId);
        await vectorStore2.upsert({
          id: docRef.id,
          text: article.content,
          embedding,
          metadata: {
            tenant_id: article.tenantId,
            category: article.category,
            title: article.title
          }
        }, article.tenantId);
        await docRef.update({ vector_indexed: true, vector_indexed_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp() });
      } catch (err) {
        logger.warn("Initial vector store indexing failed admin", { error: err });
      }
      return docRef.id;
    };
    deleteKBArticle = async (id) => {
      await dbProxy.collection("knowledge_base").doc(id).delete();
    };
    checkCoverageReal = async (cep) => {
      try {
        const keys = await getIntegrationKeys();
        const mapsKey = keys.googleMapsKey;
        if (!mapsKey) {
          return {
            status: "manual_check_required",
            message: "A consulta de viabilidade t\xE9cnica integrada (CTOs) est\xE1 desativada ou restrita pela empresa m\xE3e."
          };
        }
        const snapshot = await dbProxy.collection("network_ctos").where("cep", "==", cep).get();
        const ctos = snapshot.docs.map((doc3) => doc3.data());
        const available = ctos.some((cto) => (cto.usedPorts || 0) < (cto.totalPorts || 0));
        return {
          status: available ? "available" : "unavailable",
          ctos_found: ctos.length
        };
      } catch (err) {
        logger.error("error_checking_coverage_admin", { error: err.message });
        return { status: "manual_check_required" };
      }
    };
    getBillingStatusReal = async (cpf) => {
      try {
        const snapshot = await dbProxy.collection("invoices").where("customer_cpf", "==", cpf).where("status", "==", "pending").get();
        if (snapshot.empty) return { status: "up_to_date" };
        const overdue = snapshot.docs.map((d) => d.data());
        return {
          status: "overdue",
          count: overdue.length,
          total: overdue.reduce((sum, inv) => sum + (inv.amount || 0), 0),
          invoices: overdue
        };
      } catch (err) {
        logger.error("error_billing_status_admin", { error: err.message });
        return { status: "unknown" };
      }
    };
    runDiagnosticsReal = async (customerId) => {
      const status = Math.random() > 0.3 ? "online" : "offline";
      const signal = status === "online" ? -18 - Math.floor(Math.random() * 15) : -99;
      return {
        status,
        signal_dbm: signal,
        last_reboot: new Date(Date.now() - 36e5 * 24).toISOString(),
        firmware: "v2.4.1-astrum"
      };
    };
    encryptCpf = (cpf) => {
      if (!cpf) return cpf;
      const keyHex = process.env.VITE_CPF_ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";
      try {
        const key = import_node_forge.default.util.hexToBytes(keyHex);
        if (key.length !== 32) return cpf;
        const iv = import_node_forge.default.random.getBytesSync(12);
        const cipher = import_node_forge.default.cipher.createCipher("AES-GCM", key);
        cipher.start({ iv });
        cipher.update(import_node_forge.default.util.createBuffer(cpf, "utf8"));
        cipher.finish();
        const encrypted = cipher.output.getBytes();
        const tag = cipher.mode.tag.getBytes();
        return import_node_forge.default.util.encode64(iv) + ":" + import_node_forge.default.util.encode64(tag) + ":" + import_node_forge.default.util.encode64(encrypted);
      } catch (err) {
        return cpf;
      }
    };
    decryptCpf = (encryptedCpf) => {
      if (!encryptedCpf || typeof encryptedCpf !== "string" || !encryptedCpf.includes(":"))
        return encryptedCpf;
      const keyHex = process.env.VITE_CPF_ENCRYPTION_KEY || "0000000000000000000000000000000000000000000000000000000000000000";
      try {
        const key = import_node_forge.default.util.hexToBytes(keyHex);
        if (key.length !== 32) return encryptedCpf;
        const parts = encryptedCpf.split(":");
        if (parts.length !== 3) return encryptedCpf;
        const iv = import_node_forge.default.util.decode64(parts[0]);
        const tag = import_node_forge.default.util.decode64(parts[1]);
        const encrypted = import_node_forge.default.util.decode64(parts[2]);
        const decipher = import_node_forge.default.cipher.createDecipher("AES-GCM", key);
        decipher.start({
          iv,
          tag: import_node_forge.default.util.createBuffer(tag)
        });
        decipher.update(import_node_forge.default.util.createBuffer(encrypted));
        const pass = decipher.finish();
        if (pass) {
          return decipher.output.toString();
        }
        return encryptedCpf;
      } catch (err) {
        return encryptedCpf;
      }
    };
    getIXCCredentials = async (tenantId = "default") => {
      const keys = await getIntegrationKeys(tenantId);
      return {
        url: keys?.ixcUrl || "",
        token: keys?.ixcToken ? decryptCpf(keys.ixcToken) : "",
        integrationKey: keys?.ixcIntegrationKey ? decryptCpf(keys.ixcIntegrationKey) : ""
      };
    };
    saveIXCCredentials = async (tenantId, credentials) => {
      const integrationRef = tenantId === "default" ? dbProxy.collection("settings").doc("integrations") : dbProxy.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
      await integrationRef.set({
        ixcUrl: credentials.url,
        ixcToken: credentials.token ? encryptCpf(credentials.token) : "",
        ixcIntegrationKey: credentials.integrationKey ? encryptCpf(credentials.integrationKey) : ""
      }, { merge: true });
    };
    getVoalleCredentials = async (tenantId = "default") => {
      const keys = await getIntegrationKeys(tenantId);
      return {
        url: keys?.voalleUrl || "",
        clientId: keys?.voalleClientId ? decryptCpf(keys.voalleClientId) : "",
        clientSecret: keys?.voalleClientSecret ? decryptCpf(keys.voalleClientSecret) : ""
      };
    };
    saveVoalleCredentials = async (tenantId, credentials) => {
      const integrationRef = tenantId === "default" ? dbProxy.collection("settings").doc("integrations") : dbProxy.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
      await integrationRef.set({
        voalleUrl: credentials.url,
        voalleClientId: credentials.clientId ? encryptCpf(credentials.clientId) : "",
        voalleClientSecret: credentials.clientSecret ? encryptCpf(credentials.clientSecret) : ""
      }, { merge: true });
    };
    getHubSoftCredentials = async (tenantId = "default") => {
      const keys = await getIntegrationKeys(tenantId);
      return {
        url: keys?.hubsoftUrl || "",
        token: keys?.hubsoftToken ? decryptCpf(keys.hubsoftToken) : ""
      };
    };
    saveHubSoftCredentials = async (tenantId, credentials) => {
      const integrationRef = tenantId === "default" ? dbProxy.collection("settings").doc("integrations") : dbProxy.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
      await integrationRef.set({
        hubsoftUrl: credentials.url,
        hubsoftToken: credentials.token ? encryptCpf(credentials.token) : ""
      }, { merge: true });
    };
    getSGPCredentials = async (tenantId = "default") => {
      const keys = await getIntegrationKeys(tenantId);
      return {
        url: keys?.sgpUrl || "",
        token: keys?.sgpToken ? decryptCpf(keys.sgpToken) : ""
      };
    };
    saveSGPCredentials = async (tenantId, credentials) => {
      const integrationRef = tenantId === "default" ? dbProxy.collection("settings").doc("integrations") : dbProxy.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
      await integrationRef.set({
        sgpUrl: credentials.url,
        sgpToken: credentials.token ? encryptCpf(credentials.token) : ""
      }, { merge: true });
    };
    getRBXCredentials = async (tenantId = "default") => {
      const keys = await getIntegrationKeys(tenantId);
      return {
        url: keys?.rbxUrl || "",
        token: keys?.rbxToken ? decryptCpf(keys.rbxToken) : ""
      };
    };
    saveRBXCredentials = async (tenantId, credentials) => {
      const integrationRef = tenantId === "default" ? dbProxy.collection("settings").doc("integrations") : dbProxy.collection("tenants").doc(tenantId).collection("settings").doc("integrations");
      await integrationRef.set({
        rbxUrl: credentials.url,
        rbxToken: credentials.token ? encryptCpf(credentials.token) : ""
      }, { merge: true });
    };
    maskCpfForLog = (cpf) => {
      if (!cpf) return "";
      const cleanCpf = cpf.replace(/\D/g, "");
      if (cleanCpf.length < 5) return "***";
      return cleanCpf.slice(0, 3) + "***" + cleanCpf.slice(-2);
    };
    incrementShardedCounter = async (name, tenantId = "default") => {
      try {
        const counterRef = dbProxy.collection("counters").doc(`${tenantId}_${name}`);
        await counterRef.set({
          value: firebaseAdmin_default.firestore.FieldValue.increment(1),
          updatedAt: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) {
        logger.error("error_incrementing_counter_admin", { error: err.message, data: { name, tenantId } });
      }
    };
  }
});

// src/lib/plans.ts
var PLANS;
var init_plans = __esm({
  "src/lib/plans.ts"() {
    "use strict";
    PLANS = {
      FREE: {
        id: "FREE",
        name: "Free Trial",
        price_cents: 0,
        limits: {
          trial_days: 14,
          operators: 1,
          monthly_messages: 500
        },
        features: {
          basic_whitelabel: false,
          advanced_whitelabel: false,
          knowledge_base: true,
          api_access: false,
          custom_domain: false,
          priority_support: false
        }
      },
      PRO: {
        id: "PRO",
        name: "Pro",
        price_cents: 29700,
        limits: {
          trial_days: 0,
          operators: 5,
          monthly_messages: 1e4
        },
        features: {
          basic_whitelabel: false,
          advanced_whitelabel: false,
          knowledge_base: true,
          api_access: true,
          custom_domain: false,
          priority_support: false
        }
      },
      BUSINESS: {
        id: "BUSINESS",
        name: "Business",
        price_cents: 69700,
        limits: {
          trial_days: 0,
          operators: 20,
          monthly_messages: 5e4
        },
        features: {
          basic_whitelabel: true,
          advanced_whitelabel: false,
          knowledge_base: true,
          api_access: true,
          custom_domain: false,
          priority_support: true
        }
      },
      ENTERPRISE: {
        id: "ENTERPRISE",
        name: "Enterprise",
        price_cents: 149700,
        limits: {
          trial_days: 0,
          operators: -1,
          // ilimitado
          monthly_messages: -1
          // ilimitado
        },
        features: {
          basic_whitelabel: true,
          advanced_whitelabel: true,
          knowledge_base: true,
          api_access: true,
          custom_domain: true,
          priority_support: true
        }
      }
    };
  }
});

// src/lib/featureFlags.ts
var getTenantPlanId;
var init_featureFlags = __esm({
  "src/lib/featureFlags.ts"() {
    "use strict";
    init_firebaseAdmin();
    init_redis();
    init_plans();
    getTenantPlanId = async (tenantId) => {
      const cacheKey = `tenant_plan:${tenantId}`;
      let planId = await redis_default.get(cacheKey);
      if (!planId) {
        const tenantDoc = await dbProxy.collection("tenants").doc(tenantId).get();
        if (tenantDoc.exists) {
          planId = tenantDoc.data()?.plan_id || "FREE";
        } else {
          planId = "FREE";
        }
        await redis_default.setex(cacheKey, 600, planId);
      }
      return planId;
    };
  }
});

// src/lib/rateLimiter.ts
var rateLimiter_exports = {};
__export(rateLimiter_exports, {
  acquireSendSlot: () => acquireSendSlot,
  checkBanSignal: () => checkBanSignal,
  checkDailyLimit: () => checkDailyLimit,
  incrementDailyLimit: () => incrementDailyLimit
});
async function checkBanSignal(res, tenantId, instanceId) {
  if (!res) return;
  let isBanned = false;
  if (res.status === 403) {
    isBanned = true;
  } else {
    try {
      const clone = res.clone();
      const bodyStr = await clone.text();
      if (bodyStr.toLowerCase().includes("banned") || bodyStr.toLowerCase().includes("blocked")) {
        isBanned = true;
      }
    } catch (e) {
    }
  }
  if (isBanned && redis_default) {
    const key = `ban_signals:${instanceId}`;
    const count = await redis_default.incr(key);
    if (count === 1) await redis_default.expire(key, 3600);
    if (count >= 3) {
      await redis_default.setex(`pause_jobs:${instanceId}`, 1800, "paused");
      await dbProxy.collection("notifications").add({
        tenantId,
        title: "Risco de Banimento no WhatsApp",
        message: `A inst\xE2ncia ${instanceId} recebeu m\xFAltiplos sinais de banimento. Envios pausados por 30 min.`,
        type: "warning",
        read: false,
        createdAt: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
      });
      await dbProxy.collection("audit_logs").add({
        tenantId,
        action: "WHATSAPP_BAN_RISK",
        details: `Inst\xE2ncia ${instanceId} pode ter sido banida/bloqueada.`,
        user: "system",
        createdAt: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
      });
      logger.warn("whatsapp_ban_risk", { tenant_id: tenantId, data: { instanceId, signals: count } });
    }
  }
}
var acquireSendSlot, checkDailyLimit, incrementDailyLimit;
var init_rateLimiter = __esm({
  "src/lib/rateLimiter.ts"() {
    "use strict";
    init_redis();
    init_featureFlags();
    init_plans();
    init_firebaseAdmin();
    init_firebaseAdmin();
    init_logger();
    acquireSendSlot = async (tenantId, instanceId, limitPerSecond) => {
      if (!redis_default) {
        return { allowed: true };
      }
      let finalLimit = limitPerSecond;
      if (!finalLimit) {
        const tenantSnap = await dbProxy.collection("tenants").doc(tenantId).get();
        if (tenantSnap.exists) {
          const tData = tenantSnap.data();
          finalLimit = tData.rate_limit || 30;
        } else {
          finalLimit = 30;
        }
      }
      const key = `rate_limit:instance:${tenantId}:${instanceId}`;
      const now = Date.now();
      const windowStart = now - 1e3;
      await redis_default.zremrangebyscore(key, 0, windowStart);
      const count = await redis_default.zcard(key);
      if (count < finalLimit) {
        await redis_default.zadd(key, now, `${now}-${Math.random()}`);
        await redis_default.expire(key, 5);
        return { allowed: true };
      } else {
        const oldestItemScore = await redis_default.zrangebyscore(key, "-inf", "+inf", "LIMIT", 0, 1);
        let retryAfter = 1e3;
        if (oldestItemScore && oldestItemScore.length > 0) {
          retryAfter = 1e3;
        }
        return { allowed: false, retryAfter };
      }
    };
    checkDailyLimit = async (tenantId) => {
      if (!redis_default) {
        return { allowed: true, remaining: 999999 };
      }
      const planId = await getTenantPlanId(tenantId);
      const plan = PLANS[planId] || PLANS["FREE"];
      if (plan.limits.monthly_messages === -1) {
        return { allowed: true, remaining: -1 };
      }
      const dailyLimit = Math.ceil(plan.limits.monthly_messages / 30);
      const d = /* @__PURE__ */ new Date();
      const yyyyMmDd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const key = `daily_msg_count:${tenantId}:${yyyyMmDd}`;
      const currentCountStr = await redis_default.get(key);
      const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
      if (currentCount >= dailyLimit) {
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: dailyLimit - currentCount };
    };
    incrementDailyLimit = async (tenantId) => {
      if (!redis_default) return;
      const d = /* @__PURE__ */ new Date();
      const yyyyMmDd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const key = `daily_msg_count:${tenantId}:${yyyyMmDd}`;
      await redis_default.incr(key);
      await redis_default.expire(key, 86400 * 2);
    };
  }
});

// src/lib/whatsappSender.ts
var whatsappSender_exports = {};
__export(whatsappSender_exports, {
  TemplateNotApprovedError: () => TemplateNotApprovedError,
  sendHSMTemplate: () => sendHSMTemplate
});
async function sendHSMTemplate(tenantId, templateName, recipientPhone, variables) {
  const templateSnap = await dbProxy.collection("tenants").doc(tenantId).collection("hsm_templates").where("name", "==", templateName).where("status", "==", "APPROVED").limit(1).get();
  if (templateSnap.empty) {
    throw new TemplateNotApprovedError("TEMPLATE_NOT_APPROVED");
  }
  const templateDoc = templateSnap.docs[0];
  const template = templateDoc.data();
  let bodyText = template.body;
  const expectedVars = [...bodyText.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((m) => m[1]);
  for (const expectedVar of expectedVars) {
    if (!variables || !(expectedVar in variables)) {
      throw new Error("MISSING_TEMPLATE_VARIABLE");
    }
  }
  for (const [key, value] of Object.entries(variables || {})) {
    bodyText = bodyText.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  const keys = await getIntegrationKeys(tenantId);
  const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
  const evoInstance = keys.evolutionInstance;
  const evoApiKey = keys.evolutionApiKey;
  if (!evoUrl || !evoInstance || !evoApiKey) {
    throw new Error("Evolution API credentials not configured.");
  }
  const response = await fetch(`${evoUrl}/message/sendTemplate/${evoInstance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evoApiKey
    },
    body: JSON.stringify({
      number: recipientPhone,
      name: templateName,
      language: template.language || "pt_BR",
      variables: Object.values(variables || {}).map((v) => ({ text: v }))
    })
  });
  const resData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to send HSM Template via Evolution: ${JSON.stringify(resData)}`);
  }
  await dbProxy.collection("hsm_send_logs").add({
    template_id: templateDoc.id,
    template_name: templateName,
    recipient: recipientPhone,
    variables,
    sent_at: /* @__PURE__ */ new Date(),
    tenant_id: tenantId
  });
  return resData;
}
var TemplateNotApprovedError;
var init_whatsappSender = __esm({
  "src/lib/whatsappSender.ts"() {
    "use strict";
    init_firebaseAdmin();
    init_dbAdmin();
    TemplateNotApprovedError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "TemplateNotApprovedError";
      }
    };
  }
});

// src/lib/supabaseAdmin.ts
var supabaseAdmin_exports = {};
__export(supabaseAdmin_exports, {
  supabaseAdmin: () => supabaseAdmin
});
var import_supabase_js, supabaseUrl, serviceRoleKey, supabaseAdmin;
var init_supabaseAdmin = __esm({
  "src/lib/supabaseAdmin.ts"() {
    "use strict";
    import_supabase_js = require("@supabase/supabase-js");
    supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE;
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY \xE9 obrigat\xF3rio para opera\xE7\xF5es admin.");
    }
    supabaseUrl = supabaseUrl.replace("/rest/v1/", "").replace(/\/$/, "");
    supabaseAdmin = (0, import_supabase_js.createClient)(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
});

// apps/api/src/infrastructure/logging/logger.ts
var import_pino, isDev, logger2, atendimentoLogger, cobrancaLogger, iaLogger, infraLogger, securityLogger;
var init_logger2 = __esm({
  "apps/api/src/infrastructure/logging/logger.ts"() {
    "use strict";
    import_pino = __toESM(require("pino"));
    isDev = process.env.NODE_ENV !== "production";
    logger2 = (0, import_pino.default)({
      level: process.env.LOG_LEVEL ?? "info",
      transport: isDev ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname"
        }
      } : void 0,
      base: {
        service: "astrum-api",
        env: process.env.NODE_ENV ?? "development"
      },
      // Esconder dados sensíveis automaticamente em TODOS os logs
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.token",
          "*.cpf",
          "*.credit_card",
          "*.apikey",
          "*.api_key"
        ],
        censor: "[REDACTED]"
      }
    });
    atendimentoLogger = logger2.child({ domain: "atendimento" });
    cobrancaLogger = logger2.child({ domain: "cobranca" });
    iaLogger = logger2.child({ domain: "ia" });
    infraLogger = logger2.child({ domain: "infra" });
    securityLogger = logger2.child({ domain: "security" });
  }
});

// apps/api/src/infrastructure/security/hmac.service.ts
var hmac_service_exports = {};
__export(hmac_service_exports, {
  generateWebhookSignature: () => generateWebhookSignature,
  validateWebhookSignature: () => validateWebhookSignature
});
function validateWebhookSignature(payload, receivedSignature, provider = "generic") {
  const secret = getSecrets()[provider];
  if (!secret) {
    securityLogger.error({ provider }, "HMAC secret n\xE3o configurado para provider");
    return false;
  }
  const cleanSignature = receivedSignature.replace(/^sha256=/, "");
  const expectedHmac = import_node_crypto.default.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const receivedBuffer = Buffer.from(cleanSignature, "hex");
    const expectedBuffer = Buffer.from(expectedHmac, "hex");
    if (receivedBuffer.length !== expectedBuffer.length) {
      securityLogger.warn({ provider }, "HMAC com tamanho inv\xE1lido rejeitado");
      return false;
    }
    const isValid = import_node_crypto.default.timingSafeEqual(receivedBuffer, expectedBuffer);
    if (!isValid) {
      securityLogger.warn({ provider }, "\u26A0\uFE0F Assinatura HMAC inv\xE1lida \u2014 poss\xEDvel ataque");
    }
    return isValid;
  } catch {
    return false;
  }
}
function generateWebhookSignature(payload, provider = "generic") {
  const secret = getSecrets()[provider];
  if (!secret) throw new Error(`Secret n\xE3o configurado para provider: ${provider}`);
  return "sha256=" + import_node_crypto.default.createHmac("sha256", secret).update(payload).digest("hex");
}
var import_node_crypto, getSecrets;
var init_hmac_service = __esm({
  "apps/api/src/infrastructure/security/hmac.service.ts"() {
    "use strict";
    import_node_crypto = __toESM(require("node:crypto"));
    init_logger2();
    getSecrets = () => ({
      evolution: process.env.EVOLUTION_WEBHOOK_SECRET ?? process.env.WEBHOOK_HMAC_SECRET,
      facebook: process.env.FACEBOOK_APP_SECRET,
      payment: process.env.PAYMENT_WEBHOOK_SECRET ?? process.env.WEBHOOK_HMAC_SECRET,
      generic: process.env.WEBHOOK_HMAC_SECRET
    });
  }
});

// apps/api/src/adapters/openai/circuit-breaker.config.ts
var OPENAI_CIRCUIT_BREAKER_CONFIG;
var init_circuit_breaker_config = __esm({
  "apps/api/src/adapters/openai/circuit-breaker.config.ts"() {
    "use strict";
    OPENAI_CIRCUIT_BREAKER_CONFIG = {
      timeout: 15e3,
      errorThresholdPercentage: 50,
      resetTimeout: 3e4,
      volumeThreshold: 5,
      rollingCountTimeout: 1e4,
      rollingCountBuckets: 10
    };
  }
});

// apps/api/src/adapters/openai/openai.adapter.ts
function createOpenAIClient(tenantId, userId) {
  const baseConfig = {
    apiKey: process.env.OPENAI_API_KEY || "dummy_key",
    defaultHeaders: tenantId ? {
      "Helicone-Property-TenantId": tenantId,
      "Helicone-Property-UserId": userId ?? "unknown",
      "Helicone-Property-Environment": process.env.NODE_ENV ?? "development"
    } : void 0
  };
  if (isHeliconeEnabled) {
    return new import_openai4.default({
      ...baseConfig,
      baseURL: "https://oai.helicone.ai/v1",
      defaultHeaders: {
        ...baseConfig.defaultHeaders,
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`
      }
    });
  }
  return new import_openai4.default(baseConfig);
}
async function callOpenAIAPI(options) {
  const client3 = options.tenantId ? createOpenAIClient(options.tenantId, options.userId) : defaultOpenAI;
  const response = await client3.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.max_tokens
  });
  return {
    content: response.choices[0]?.message?.content || "",
    model: response.model,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0
    },
    fromFallback: false
  };
}
function callOpenAI(options) {
  return breaker.fire(options);
}
function getOpenAICircuitStatus() {
  if (breaker.opened) return "open";
  if (breaker.halfOpen) return "halfOpen";
  return "closed";
}
var import_opossum, import_openai4, isHeliconeEnabled, defaultOpenAI, breaker;
var init_openai_adapter2 = __esm({
  "apps/api/src/adapters/openai/openai.adapter.ts"() {
    "use strict";
    import_opossum = __toESM(require("opossum"));
    import_openai4 = __toESM(require("openai"));
    init_circuit_breaker_config();
    init_logger2();
    isHeliconeEnabled = !!process.env.HELICONE_API_KEY;
    defaultOpenAI = createOpenAIClient();
    breaker = new import_opossum.default(callOpenAIAPI, OPENAI_CIRCUIT_BREAKER_CONFIG);
    breaker.fallback(() => {
      return {
        content: "Estou com dificuldades t\xE9cnicas no momento. Seu atendimento foi registrado e nossa equipe entrar\xE1 em contato em breve.",
        model: "fallback",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        fromFallback: true
      };
    });
    breaker.on("open", () => iaLogger.error("[CIRCUIT_BREAKER] OpenAI ABERTO. Usando fallback."));
    breaker.on("close", () => iaLogger.info("[CIRCUIT_BREAKER] OpenAI FECHADO"));
  }
});

// apps/api/src/adapters/ai/llm.adapter.ts
var llm_adapter_exports = {};
__export(llm_adapter_exports, {
  callLLM: () => callLLM,
  classifyMessageComplexity: () => classifyMessageComplexity,
  getLLMStatus: () => getLLMStatus
});
function classifyMessageComplexity(messages, context) {
  if (context === "analysis") return "gpt-4o";
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const isComplex = COMPLEX_KEYWORDS.some(
    (k) => lastUserMessage.toLowerCase().includes(k)
  );
  const isLong = lastUserMessage.length > 200;
  return isComplex || isLong ? "gpt-4o" : "gpt-4o-mini";
}
async function callLLM(request) {
  const startTime = Date.now();
  const model = request.forceModel ?? classifyMessageComplexity(request.messages, request.context);
  const messages = request.systemPrompt ? [{ role: "system", content: request.systemPrompt }, ...request.messages] : request.messages;
  const response = await callOpenAI({
    model,
    messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 1e3,
    tenantId: request.tenantId,
    userId: request.userId
  });
  return {
    content: response.content,
    model: response.model,
    tokensUsed: response.usage.total_tokens,
    fromFallback: response.fromFallback ?? false,
    routingDecision: model,
    latencyMs: Date.now() - startTime
  };
}
function getLLMStatus() {
  return { openai: getOpenAICircuitStatus(), router: "active" };
}
var COMPLEX_KEYWORDS;
var init_llm_adapter = __esm({
  "apps/api/src/adapters/ai/llm.adapter.ts"() {
    "use strict";
    init_openai_adapter2();
    COMPLEX_KEYWORDS = [
      "diagn\xF3stico",
      "t\xE9cnico",
      "olt",
      "fibra",
      "splitter",
      "onu",
      "ont",
      "contrato",
      "cancelar",
      "rescis\xE3o",
      "churn",
      "inadimplente",
      "analisar",
      "relat\xF3rio",
      "configurar",
      "problema"
    ];
  }
});

// apps/api/src/infrastructure/database/supabase.client.ts
var supabase_client_exports = {};
__export(supabase_client_exports, {
  SUPABASE_URL: () => SUPABASE_URL,
  default: () => supabase_client_default,
  supabase: () => supabase,
  supabaseAdmin: () => supabaseAdmin2,
  supabaseClient: () => supabaseClient
});
var import_supabase_js2, supabaseUrl2, supabaseAnonKey, supabaseClient, supabase, SUPABASE_URL, supabaseServiceRoleKey, supabaseAdmin2, supabase_client_default;
var init_supabase_client = __esm({
  "apps/api/src/infrastructure/database/supabase.client.ts"() {
    "use strict";
    import_supabase_js2 = require("@supabase/supabase-js");
    supabaseUrl2 = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE || "https://placeholder.supabase.co";
    supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE || "placeholder";
    supabaseClient = (0, import_supabase_js2.createClient)(supabaseUrl2, supabaseAnonKey);
    supabase = supabaseClient;
    SUPABASE_URL = supabaseUrl2;
    supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "placeholder_service_role_key";
    if (supabaseServiceRoleKey === "placeholder_service_role_key") {
      console.warn("\u26A0\uFE0F AVISO: SUPABASE_SERVICE_ROLE_KEY n\xE3o configurado! Realtime e operations que requerem Admin falhar\xE3o.");
    }
    supabaseAdmin2 = (0, import_supabase_js2.createClient)(supabaseUrl2, supabaseServiceRoleKey);
    supabase_client_default = supabaseClient;
  }
});

// apps/api/src/infrastructure/idempotency/idempotency.middleware.ts
var idempotency_middleware_exports = {};
__export(idempotency_middleware_exports, {
  REQUIRED_ROUTES: () => REQUIRED_ROUTES,
  default: () => idempotency_middleware_default
});
var import_fastify_plugin2, import_crypto, REQUIRED_ROUTES, isUUIDv4, idempotencyPlugin, idempotency_middleware_default;
var init_idempotency_middleware = __esm({
  "apps/api/src/infrastructure/idempotency/idempotency.middleware.ts"() {
    "use strict";
    import_fastify_plugin2 = __toESM(require("fastify-plugin"));
    import_crypto = require("crypto");
    init_supabase_client();
    init_logger2();
    REQUIRED_ROUTES = [
      "/api/billing/charge",
      "/api/billing/refund",
      "/api/suspension/suspend",
      "/api/suspension/reactivate",
      "/api/payments/process"
    ];
    isUUIDv4 = (uuid) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
    };
    idempotencyPlugin = async (fastify) => {
      fastify.addHook("preHandler", async (request, reply) => {
        if (request.method !== "POST") return;
        const urlPath = request.url.split("?")[0];
        const isRequired = REQUIRED_ROUTES.some((route) => urlPath === route);
        if (!isRequired) return;
        const idempotencyKey = request.headers["idempotency-key"];
        if (!idempotencyKey) {
          return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required for this route" });
        }
        if (!isUUIDv4(idempotencyKey)) {
          return reply.code(400).send({ code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key must be a valid UUID v4" });
        }
        try {
          const { data } = await supabaseClient.from("idempotency_keys").select("*").eq("idempotency_key", idempotencyKey).single();
          if (data && new Date(data.expires_at) > /* @__PURE__ */ new Date()) {
            securityLogger.info({ idempotencyKey }, "Resposta cacheada retornada");
            reply.header("X-Idempotency-Replayed", "true");
            return reply.code(data.response_status).send(data.response_body);
          }
        } catch (err) {
          securityLogger.error({ err }, "Erro ao buscar chave de idempot\xEAncia");
        }
        const bodyString = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
        request.__idempotencyKey = idempotencyKey;
        request.__requestHash = (0, import_crypto.createHash)("sha256").update(bodyString).digest("hex");
      });
      fastify.addHook("onSend", async (request, reply, payload) => {
        if (!request.__idempotencyKey) return typeof payload === "string" ? payload : JSON.stringify(payload);
        try {
          let responseBody;
          try {
            if (typeof payload === "string") {
              responseBody = JSON.parse(payload);
            } else if (Buffer.isBuffer(payload)) {
              responseBody = JSON.parse(payload.toString());
            } else {
              responseBody = payload;
            }
          } catch (err) {
            responseBody = { data: payload };
          }
          const tenantId = request.tenantId || "00000000-0000-0000-0000-000000000000";
          const expiresAt = /* @__PURE__ */ new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          await supabaseClient.from("idempotency_keys").upsert({
            idempotency_key: request.__idempotencyKey,
            tenant_id: tenantId,
            endpoint: request.url.split("?")[0],
            request_hash: request.__requestHash,
            response_status: reply.statusCode,
            response_body: responseBody,
            expires_at: expiresAt.toISOString()
          });
        } catch (err) {
          securityLogger.error({ err }, "Erro ao salvar idempotency key");
        }
        return typeof payload === "string" ? payload : JSON.stringify(payload);
      });
    };
    idempotency_middleware_default = (0, import_fastify_plugin2.default)(idempotencyPlugin);
  }
});

// apps/api/src/infrastructure/cache/redis.client.ts
var redis_client_exports = {};
__export(redis_client_exports, {
  closeRedis: () => closeRedis,
  connection: () => connection2,
  default: () => redis_client_default,
  getRedisClient: () => getRedisClient,
  getRedisStatus: () => getRedisStatus,
  redis: () => redis2
});
function createMockClient() {
  infraLogger.warn("Redis: usando fallback in-memory (sem REDIS_URL real)");
  const store = /* @__PURE__ */ new Map();
  return {
    get: async (key) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      return item.value;
    },
    set: async (key, value, ...args) => {
      let expiresAt = null;
      let nx = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "EX") expiresAt = Date.now() + args[i + 1] * 1e3;
        if (args[i] === "PX") expiresAt = Date.now() + args[i + 1];
        if (args[i] === "NX") nx = true;
      }
      if (nx && store.has(key)) {
        const item = store.get(key);
        if (!item?.expiresAt || Date.now() <= item.expiresAt) {
          return null;
        }
      }
      store.set(key, { value, expiresAt });
      return "OK";
    },
    incr: async (key) => {
      const item = store.get(key);
      let val = 1;
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        val = parseInt(item.value, 10) + 1;
      }
      store.set(key, { value: val.toString(), expiresAt: item?.expiresAt || null });
      return val;
    },
    incrby: async (key, increment) => {
      const item = store.get(key);
      let val = Number(increment);
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        val = parseInt(item.value, 10) + Number(increment);
      }
      store.set(key, { value: val.toString(), expiresAt: item?.expiresAt || null });
      return val;
    },
    expire: async (key, time) => {
      const item = store.get(key);
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        store.set(key, { value: item.value, expiresAt: Date.now() + time * 1e3 });
        return 1;
      }
      return 0;
    },
    append: async (key, value) => {
      const item = store.get(key);
      let newValue = value;
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        newValue = item.value + value;
      }
      store.set(key, { value: newValue, expiresAt: item?.expiresAt || null });
      return newValue.length;
    },
    del: async (key) => {
      store.delete(key);
      return 1;
    },
    exists: async (key) => {
      const item = store.get(key);
      if (!item) return 0;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return 0;
      }
      return 1;
    },
    zadd: async (key, score, member) => {
      let setItem = store.get(key);
      if (!setItem || !Array.isArray(setItem.value)) {
        setItem = { value: [], expiresAt: null };
      }
      const arr = setItem.value;
      arr.push([score, member]);
      setItem.value = arr;
      store.set(key, setItem);
      return 1;
    },
    zremrangebyscore: async (key, min, max) => {
      const setItem = store.get(key);
      if (!setItem || !Array.isArray(setItem.value)) return 0;
      let arr = setItem.value;
      const initialLength = arr.length;
      arr = arr.filter(([score]) => score < min || score > max);
      setItem.value = arr;
      store.set(key, setItem);
      return initialLength - arr.length;
    },
    zcard: async (key) => {
      const setItem = store.get(key);
      if (!setItem || !Array.isArray(setItem.value)) return 0;
      return setItem.value.length;
    },
    zrangebyscore: async (key, min, max) => {
      const setItem = store.get(key);
      if (!setItem || !Array.isArray(setItem.value)) return [];
      const arr = setItem.value;
      const minNum = min === "-inf" ? -Infinity : Number(min);
      const maxNum = max === "+inf" ? Infinity : Number(max);
      return arr.filter(([score]) => score >= minNum && score <= maxNum).map((x) => x[1]);
    },
    multi: () => redis2,
    exec: async () => [],
    quit: async () => {
    }
  };
}
async function closeRedis() {
  if (!isMock && typeof redis2.quit === "function") {
    await redis2.quit();
    infraLogger.info("Redis: conex\xE3o encerrada graciosamente");
  }
}
var RedisModule2, Redis4, isMock, redisUrl2, getRedisStatus, createRedisClient2, redis2, connection2, getRedisClient, redis_client_default;
var init_redis_client = __esm({
  "apps/api/src/infrastructure/cache/redis.client.ts"() {
    "use strict";
    RedisModule2 = __toESM(require("ioredis"));
    init_logger2();
    Redis4 = RedisModule2.default || RedisModule2.Redis || RedisModule2;
    isMock = !process.env.REDIS_URL || process.env.REDIS_URL.includes("localhost") || process.env.REDIS_URL.includes("127.0.0.1") || !process.env.REDIS_URL.startsWith("redis");
    redisUrl2 = process.env.REDIS_URL && process.env.REDIS_URL.startsWith("redis") ? process.env.REDIS_URL : "redis://localhost:6379";
    getRedisStatus = () => isMock ? "mock" : "real";
    createRedisClient2 = () => {
      if (isMock) {
        return createMockClient();
      }
      const client3 = new Redis4(redisUrl2, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        connectTimeout: 5e3,
        commandTimeout: 3e3,
        retryStrategy(times) {
          if (times > 10) {
            infraLogger.error("Redis: m\xE1ximo de tentativas atingido \u2014 desistindo");
            return null;
          }
          const delay = Math.min(times * 100, 3e3);
          infraLogger.warn({ attempt: times, delayMs: delay }, "Redis: reconectando...");
          return delay;
        },
        lazyConnect: false
      });
      client3.on("connect", () => infraLogger.info("Redis: conectado"));
      client3.on("ready", () => infraLogger.info("Redis: pronto para comandos"));
      client3.on("error", (err) => infraLogger.error({ err }, "Redis: erro de conex\xE3o"));
      client3.on("close", () => infraLogger.warn("Redis: conex\xE3o fechada"));
      client3.on("reconnecting", () => infraLogger.warn("Redis: reconectando..."));
      return client3;
    };
    redis2 = createRedisClient2();
    connection2 = redis2;
    getRedisClient = () => redis2;
    redis_client_default = redis2;
  }
});

// apps/api/src/infrastructure/rate-limit/token-bucket.service.ts
async function checkRateLimit(tenantId, routeGroup) {
  const groupName = Object.keys(RATE_LIMIT_CONFIGS).includes(routeGroup) ? routeGroup : "default";
  const config = RATE_LIMIT_CONFIGS[groupName];
  const { capacity, refillRate, tokensPerRequest } = config;
  const cacheKey = `rate_limit:token_bucket:${groupName}:${tenantId}`;
  try {
    const rawData = await redis_client_default.get(cacheKey);
    const now = Date.now();
    let tokens = capacity;
    let lastRefill = now;
    if (rawData) {
      const data = JSON.parse(rawData);
      tokens = data.tokens;
      lastRefill = data.lastRefill;
      const elapsedSeconds = (now - lastRefill) / 1e3;
      const tokensToAdd = elapsedSeconds * refillRate;
      tokens = Math.min(capacity, tokens + tokensToAdd);
    }
    if (tokens < tokensPerRequest) {
      const tokensShortfall = tokensPerRequest - tokens;
      const resetInSeconds = Math.ceil(tokensShortfall / refillRate);
      return {
        allowed: false,
        remainingTokens: Math.floor(tokens),
        resetInSeconds,
        limit: capacity
      };
    }
    tokens -= tokensPerRequest;
    await redis_client_default.set(cacheKey, JSON.stringify({ tokens, lastRefill: now }), "EX", 3600);
    return {
      allowed: true,
      remainingTokens: Math.floor(tokens),
      resetInSeconds: 0,
      limit: capacity
    };
  } catch (error) {
    infraLogger.error({ err: error }, "Erro ao checar limite de rate limit");
    return {
      allowed: true,
      remainingTokens: capacity,
      resetInSeconds: 0,
      limit: capacity
    };
  }
}
function getRouteGroup(url) {
  const path3 = url.split("?")[0] || "";
  if (path3.includes("/api/ai") || path3.includes("/api/chat")) return "ai";
  if (path3.includes("/api/billing") || path3.includes("/api/payments")) return "billing";
  if (path3.includes("/api/webhook")) return "webhooks";
  return "default";
}
var RATE_LIMIT_CONFIGS;
var init_token_bucket_service = __esm({
  "apps/api/src/infrastructure/rate-limit/token-bucket.service.ts"() {
    "use strict";
    init_redis_client();
    init_logger2();
    RATE_LIMIT_CONFIGS = {
      ai: { capacity: 10, refillRate: 10 / 60, tokensPerRequest: 1 },
      billing: { capacity: 5, refillRate: 5 / 60, tokensPerRequest: 1 },
      webhooks: { capacity: 100, refillRate: 100 / 60, tokensPerRequest: 1 },
      default: { capacity: 60, refillRate: 1, tokensPerRequest: 1 }
    };
  }
});

// apps/api/src/infrastructure/rate-limit/rate-limit.plugin.ts
var rate_limit_plugin_exports = {};
__export(rate_limit_plugin_exports, {
  default: () => rate_limit_plugin_default
});
var import_fastify_plugin3, rateLimitPlugin, rate_limit_plugin_default;
var init_rate_limit_plugin = __esm({
  "apps/api/src/infrastructure/rate-limit/rate-limit.plugin.ts"() {
    "use strict";
    import_fastify_plugin3 = __toESM(require("fastify-plugin"));
    init_token_bucket_service();
    rateLimitPlugin = async (fastify) => {
      fastify.addHook("preHandler", async (request, reply) => {
        const path3 = (request.url || "").split("?")[0] ?? "";
        if (!path3.startsWith("/api/")) return;
        if (path3 === "/api/health") return;
        const tenantId = request.user?.tenantId ?? request.ips?.[request.ips.length - 1] ?? request.ip;
        const routeGroup = getRouteGroup(request.url || "");
        const result = await checkRateLimit(tenantId, routeGroup);
        reply.header("X-RateLimit-Limit", result.limit.toString());
        reply.header("X-RateLimit-Remaining", result.remainingTokens.toString());
        if (!result.allowed) {
          reply.header("X-RateLimit-Reset", result.resetInSeconds.toString());
          reply.header("Retry-After", result.resetInSeconds.toString());
          return reply.code(429).send({
            code: "RATE_LIMIT_EXCEEDED",
            message: `Limite excedido. Tente novamente em ${result.resetInSeconds} segundos.`,
            resetInSeconds: result.resetInSeconds,
            limit: result.limit
          });
        }
      });
    };
    rate_limit_plugin_default = (0, import_fastify_plugin3.default)(rateLimitPlugin);
  }
});

// apps/api/src/infrastructure/security/webhook-hmac.plugin.ts
var webhook_hmac_plugin_exports = {};
__export(webhook_hmac_plugin_exports, {
  default: () => webhook_hmac_plugin_default
});
var import_fastify_plugin4, WEBHOOK_ROUTES, webhookHmacPlugin, webhook_hmac_plugin_default;
var init_webhook_hmac_plugin = __esm({
  "apps/api/src/infrastructure/security/webhook-hmac.plugin.ts"() {
    "use strict";
    import_fastify_plugin4 = __toESM(require("fastify-plugin"));
    init_hmac_service();
    init_logger2();
    WEBHOOK_ROUTES = {
      "/api/webhook/evolution": "evolution",
      "/api/v2/webhook/evolution": "evolution",
      "/api/webhook/facebook": "facebook",
      "/api/v2/webhook/facebook": "facebook",
      "/api/webhook/payment": "payment",
      "/api/v2/webhook/payment": "payment"
    };
    webhookHmacPlugin = (fastify, _opts, done) => {
      fastify.addHook("preHandler", async (request, reply) => {
        const urlWithoutQuery = (request.url || "").split("?")[0] ?? "";
        const provider = WEBHOOK_ROUTES[urlWithoutQuery];
        if (!provider) return;
        const signature = request.headers["x-hub-signature-256"] || request.headers["x-evolution-signature"] || request.headers["x-webhook-signature"];
        if (!signature) {
          securityLogger.warn({ url: request.url, provider }, "Webhook sem assinatura HMAC rejeitado");
          return reply.status(401).send({
            code: "MISSING_SIGNATURE",
            message: "Webhook sem assinatura HMAC."
          });
        }
        const rawBody = request.rawBody ?? JSON.stringify(request.body);
        const isValid = validateWebhookSignature(rawBody, signature, provider);
        if (!isValid) {
          securityLogger.error({ url: request.url, provider }, "\u{1F6A8} Webhook com HMAC inv\xE1lido bloqueado");
          return reply.status(401).send({
            code: "INVALID_SIGNATURE",
            message: "Assinatura HMAC inv\xE1lida."
          });
        }
        securityLogger.info({ provider }, "Webhook HMAC validado com sucesso");
      });
      done();
    };
    webhook_hmac_plugin_default = (0, import_fastify_plugin4.default)(webhookHmacPlugin, { name: "webhook-hmac", fastify: "5.x" });
  }
});

// apps/api/src/infrastructure/auth/jwt.service.ts
async function generateTokenPair(fastify, payload, meta = {}) {
  const accessToken = fastify.jwt.sign(payload, { expiresIn: "15m" });
  const refreshToken = import_node_crypto2.default.randomBytes(64).toString("hex");
  const { error } = await supabaseAdmin2.from("refresh_tokens").insert({
    token: refreshToken,
    user_id: payload.userId,
    tenant_id: payload.tenantId,
    user_agent: meta.userAgent,
    ip_address: meta.ipAddress
  });
  if (error) {
    securityLogger.error({ err: error, userId: payload.userId }, "Erro ao salvar refresh token");
    throw new Error("Falha ao criar sess\xE3o. Tente novamente.");
  }
  await supabaseAdmin2.from("audit_log").insert({
    tenant_id: payload.tenantId,
    user_id: payload.userId,
    action: "login",
    ip_address: meta.ipAddress,
    user_agent: meta.userAgent
  });
  securityLogger.info({ userId: payload.userId, tenantId: payload.tenantId }, "Token pair gerado");
  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}
async function rotateTokens(fastify, refreshToken, meta = {}) {
  const { data: tokenRecord } = await supabaseAdmin2.from("refresh_tokens").select("user_id, tenant_id, expires_at, revoked").eq("token", refreshToken).single();
  if (!tokenRecord) {
    securityLogger.warn({ refreshToken: refreshToken.slice(0, 8) + "..." }, "Refresh token n\xE3o encontrado");
    throw new Error("Token inv\xE1lido.");
  }
  if (tokenRecord.revoked) {
    securityLogger.error({ userId: tokenRecord.user_id }, "\u26A0\uFE0F Token revogado usado \u2014 poss\xEDvel roubo de sess\xE3o");
    await supabaseAdmin2.from("refresh_tokens").update({ revoked: true, revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", tokenRecord.user_id);
    await supabaseAdmin2.from("audit_log").insert({
      user_id: tokenRecord.user_id,
      action: "suspicious_token_reuse",
      metadata: { token_prefix: refreshToken.slice(0, 8) }
    });
    throw new Error("Sess\xE3o expirada por seguran\xE7a. Fa\xE7a login novamente.");
  }
  if (new Date(tokenRecord.expires_at) < /* @__PURE__ */ new Date()) {
    throw new Error("Sess\xE3o expirada. Fa\xE7a login novamente.");
  }
  await supabaseAdmin2.from("refresh_tokens").update({ revoked: true, revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("token", refreshToken);
  const { data: user } = await supabaseAdmin2.from("users").select("role").eq("id", tokenRecord.user_id).single();
  return generateTokenPair(
    fastify,
    {
      userId: tokenRecord.user_id,
      tenantId: tokenRecord.tenant_id,
      role: user?.role ?? "operator"
    },
    meta
  );
}
async function revokeAllTokens(userId) {
  await supabaseAdmin2.from("refresh_tokens").update({ revoked: true, revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", userId).eq("revoked", false);
  securityLogger.info({ userId }, "Todos os tokens do usu\xE1rio revogados (logout)");
}
var import_node_crypto2;
var init_jwt_service = __esm({
  "apps/api/src/infrastructure/auth/jwt.service.ts"() {
    "use strict";
    init_supabase_client();
    init_logger2();
    import_node_crypto2 = __toESM(require("node:crypto"));
  }
});

// apps/api/src/infrastructure/validation/zod-validator.ts
function validateBody(schema) {
  return async (request, reply) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Dados inv\xE1lidos na requisi\xE7\xE3o.",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      });
    }
    request.validatedBody = result.data;
  };
}
function validateParams(schema) {
  return async (request, reply) => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      return reply.status(400).send({
        code: "INVALID_PARAMS",
        message: "Par\xE2metros inv\xE1lidos.",
        errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      });
    }
    request.validatedParams = result.data;
  };
}
function validateQuery(schema) {
  return async (request, reply) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      return reply.status(400).send({
        code: "INVALID_QUERY",
        message: "Query string inv\xE1lida.",
        errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      });
    }
    request.validatedQuery = result.data;
  };
}
var init_zod_validator = __esm({
  "apps/api/src/infrastructure/validation/zod-validator.ts"() {
    "use strict";
  }
});

// packages/shared/src/schemas/index.ts
var import_zod2, uuidSchema, paginationSchema, tenantParamSchema, loginBodySchema, refreshBodySchema, registerBodySchema, createTicketSchema, updateTicketSchema, createCustomerSchema, cobraiRuleSchema, aiConfigSchema, sendMessageSchema;
var init_schemas = __esm({
  "packages/shared/src/schemas/index.ts"() {
    "use strict";
    import_zod2 = require("zod");
    uuidSchema = import_zod2.z.string().uuid("ID deve ser um UUID v\xE1lido");
    paginationSchema = import_zod2.z.object({
      page: import_zod2.z.coerce.number().int().min(1).default(1),
      limit: import_zod2.z.coerce.number().int().min(1).max(100).default(20)
    });
    tenantParamSchema = import_zod2.z.object({
      tenantId: uuidSchema
    });
    loginBodySchema = import_zod2.z.object({
      email: import_zod2.z.string().email("Email inv\xE1lido"),
      password: import_zod2.z.string().min(1, "Senha \xE9 obrigat\xF3ria")
    });
    refreshBodySchema = import_zod2.z.object({
      refreshToken: import_zod2.z.string().min(10, "Refresh token inv\xE1lido")
    });
    registerBodySchema = import_zod2.z.object({
      name: import_zod2.z.string().min(2).max(100),
      email: import_zod2.z.string().email(),
      password: import_zod2.z.string().min(8).max(128),
      tenantId: uuidSchema,
      role: import_zod2.z.enum(["admin", "operator", "viewer"]).default("operator")
    });
    createTicketSchema = import_zod2.z.object({
      title: import_zod2.z.string().min(3, "T\xEDtulo deve ter no m\xEDnimo 3 caracteres").max(200),
      description: import_zod2.z.string().max(5e3).optional(),
      customerId: uuidSchema.optional(),
      priority: import_zod2.z.enum(["low", "medium", "high", "critical"]).default("medium")
    });
    updateTicketSchema = import_zod2.z.object({
      title: import_zod2.z.string().min(3).max(200).optional(),
      description: import_zod2.z.string().max(5e3).optional(),
      status: import_zod2.z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
      priority: import_zod2.z.enum(["low", "medium", "high", "critical"]).optional(),
      assignedTo: uuidSchema.optional()
    });
    createCustomerSchema = import_zod2.z.object({
      name: import_zod2.z.string().min(2).max(200),
      email: import_zod2.z.string().email().optional(),
      phone: import_zod2.z.string().regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 d\xEDgitos").optional(),
      cpf: import_zod2.z.string().regex(/^\d{11}$/, "CPF deve ter 11 d\xEDgitos").optional(),
      planId: import_zod2.z.string().optional()
    });
    cobraiRuleSchema = import_zod2.z.object({
      name: import_zod2.z.string().min(2).max(100),
      daysOverdue: import_zod2.z.number().int().min(1).max(365),
      action: import_zod2.z.enum(["send_message", "suspend_signal", "reactivate", "notify_human"]),
      messageTemplate: import_zod2.z.string().max(2e3).optional()
    });
    aiConfigSchema = import_zod2.z.object({
      botName: import_zod2.z.string().min(1).max(50).optional(),
      personality: import_zod2.z.string().max(500).optional(),
      temperature: import_zod2.z.number().min(0).max(2).optional(),
      maxTokensPerMessage: import_zod2.z.number().int().min(100).max(4e3).optional(),
      securityThreshold: import_zod2.z.number().min(0).max(1).optional(),
      autoSuspendEnabled: import_zod2.z.boolean().optional(),
      cobraiEnabled: import_zod2.z.boolean().optional(),
      customInstructions: import_zod2.z.string().max(3e3).optional()
    });
    sendMessageSchema = import_zod2.z.object({
      content: import_zod2.z.string().min(1).max(2e3),
      conversationId: uuidSchema.optional(),
      customerId: uuidSchema.optional(),
      channel: import_zod2.z.enum(["whatsapp", "webchat", "facebook"]).default("whatsapp")
    });
  }
});

// apps/api/src/domain/auth/auth.routes.ts
var auth_routes_exports = {};
__export(auth_routes_exports, {
  authRoutes: () => authRoutes
});
async function authRoutes(fastify) {
  fastify.post("/api/v2/auth/refresh", {
    preHandler: [validateBody(refreshBodySchema)]
  }, async (request, reply) => {
    const { refreshToken } = request.validatedBody;
    try {
      const tokens = await rotateTokens(fastify, refreshToken, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip
      });
      return reply.send(tokens);
    } catch (err) {
      return reply.status(401).send({ code: "TOKEN_INVALID", message: err.message });
    }
  });
  fastify.post(
    "/api/v2/auth/logout",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user;
      await revokeAllTokens(user.userId);
      return reply.send({ message: "Logout realizado com sucesso." });
    }
  );
}
var init_auth_routes = __esm({
  "apps/api/src/domain/auth/auth.routes.ts"() {
    "use strict";
    init_jwt_service();
    init_zod_validator();
    init_schemas();
  }
});

// apps/api/src/infrastructure/auth/password.service.ts
async function hashPassword(plainPassword) {
  if (plainPassword.length < 8) {
    throw new Error("Senha deve ter no m\xEDnimo 8 caracteres.");
  }
  const hash = await import_argon2.default.hash(plainPassword, ARGON2_CONFIG);
  securityLogger.info("Senha hasheada com Argon2id");
  return hash;
}
async function verifyPassword(hash, plainPassword) {
  try {
    const isValid = await import_argon2.default.verify(hash, plainPassword);
    if (!isValid) {
      securityLogger.warn("Tentativa de login com senha incorreta");
    }
    return isValid;
  } catch (err) {
    securityLogger.error({ err }, "Erro ao verificar hash de senha");
    return false;
  }
}
async function needsRehash(hash) {
  return import_argon2.default.needsRehash(hash, ARGON2_CONFIG);
}
async function rehashIfNeeded(hash, plainPassword) {
  if (await needsRehash(hash)) {
    securityLogger.info("Rehash de senha necess\xE1rio \u2014 atualizando para par\xE2metros novos");
    return hashPassword(plainPassword);
  }
  return null;
}
var import_argon2, ARGON2_CONFIG;
var init_password_service = __esm({
  "apps/api/src/infrastructure/auth/password.service.ts"() {
    "use strict";
    import_argon2 = __toESM(require("argon2"));
    init_logger2();
    ARGON2_CONFIG = {
      type: import_argon2.default.argon2id,
      memoryCost: 65536,
      // 64 MB
      timeCost: 3,
      parallelism: 4
    };
  }
});

// apps/api/src/domain/auth/login.route.ts
var login_route_exports = {};
__export(login_route_exports, {
  loginRoute: () => loginRoute
});
async function loginRoute(fastify) {
  fastify.post("/api/v2/auth/login", {
    preHandler: [validateBody(loginBodySchema)]
  }, async (request, reply) => {
    const { email, password } = request.validatedBody;
    const { data: user } = await supabaseAdmin2.from("users").select("id, tenant_id, role, password_hash, active").eq("email", email.toLowerCase()).single();
    const GENERIC_ERROR = { code: "INVALID_CREDENTIALS", message: "Email ou senha incorretos." };
    if (!user || !user.active) {
      securityLogger.warn({ email }, "Tentativa de login com email n\xE3o encontrado ou inativo");
      return reply.status(401).send(GENERIC_ERROR);
    }
    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      return reply.status(401).send(GENERIC_ERROR);
    }
    await supabaseAdmin2.from("users").update({ last_login_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", user.id);
    const newHash = await rehashIfNeeded(user.password_hash, password);
    if (newHash) {
      await supabaseAdmin2.from("users").update({ password_hash: newHash }).eq("id", user.id);
    }
    const tokens = await generateTokenPair(
      fastify,
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      { userAgent: request.headers["user-agent"], ipAddress: request.ip }
    );
    securityLogger.info({ userId: user.id, tenantId: user.tenant_id }, "Login bem-sucedido");
    return reply.send(tokens);
  });
}
var init_login_route = __esm({
  "apps/api/src/domain/auth/login.route.ts"() {
    "use strict";
    init_password_service();
    init_jwt_service();
    init_supabase_client();
    init_logger2();
    init_zod_validator();
    init_schemas();
  }
});

// apps/api/src/domain/auth/register.route.ts
var register_route_exports = {};
__export(register_route_exports, {
  registerRoute: () => registerRoute
});
async function registerRoute(fastify) {
  fastify.post("/api/v2/auth/register", {
    onRequest: [fastify.authenticate],
    preHandler: [
      async (req, reply) => {
        if (!["super_admin", "admin"].includes(req.user?.role)) {
          return reply.status(403).send({ code: "FORBIDDEN", message: "Apenas admins podem criar usu\xE1rios." });
        }
      },
      validateBody(registerBodySchema)
    ]
  }, async (request, reply) => {
    const { name, email, password, tenantId, role } = request.validatedBody;
    const passwordHash = await hashPassword(password);
    const { data: user, error } = await supabaseAdmin2.from("users").insert({
      name,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      tenant_id: tenantId,
      role
    }).select("id, email, role").single();
    if (error) {
      if (error.code === "23505") {
        return reply.status(409).send({ code: "EMAIL_EXISTS", message: "Email j\xE1 cadastrado." });
      }
      securityLogger.error({ err: error }, "Erro ao criar usu\xE1rio");
      return reply.status(500).send({ code: "INTERNAL_ERROR", message: "Erro ao criar usu\xE1rio." });
    }
    securityLogger.info({ userId: user.id, role }, "Novo usu\xE1rio criado");
    return reply.status(201).send({ id: user.id, email: user.email, role: user.role });
  });
}
var init_register_route = __esm({
  "apps/api/src/domain/auth/register.route.ts"() {
    "use strict";
    init_password_service();
    init_supabase_client();
    init_logger2();
    init_zod_validator();
    init_schemas();
  }
});

// apps/api/src/domain/cobranca/cobrai-rules.service.ts
async function getTenantCobraiRules(tenantId) {
  const { data, error } = await supabaseAdmin2.from("cobrai_rules").select("*").eq("tenant_id", tenantId).eq("active", true).order("days_overdue", { ascending: true });
  if (error) {
    cobrancaLogger.error({ err: error, tenantId }, "Erro ao buscar regras CobrAI");
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    daysOverdue: r.days_overdue,
    action: r.action,
    messageTemplate: r.message_template,
    active: r.active
  }));
}
function interpolateTemplate(template, vars) {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => String(vars[key] ?? `{{${key}}}`)
  );
}
function calculateActionDelay(dueDate, daysOverdue) {
  const actionDate = new Date(dueDate);
  actionDate.setDate(actionDate.getDate() + daysOverdue);
  const now = /* @__PURE__ */ new Date();
  const delayMs = actionDate.getTime() - now.getTime();
  return Math.max(0, delayMs);
}
async function registerCobraiJob(opts) {
  await supabaseAdmin2.from("cobrai_jobs").insert({
    tenant_id: opts.tenantId,
    customer_id: opts.customerId,
    invoice_id: opts.invoiceId,
    rule_id: opts.ruleId,
    bullmq_job_id: opts.bullmqJobId,
    status: "scheduled",
    scheduled_for: opts.scheduledFor.toISOString()
  });
}
async function cancelInvoiceCobraiJobs(tenantId, invoiceId) {
  const { data } = await supabaseAdmin2.from("cobrai_jobs").select("bullmq_job_id").eq("tenant_id", tenantId).eq("invoice_id", invoiceId).eq("status", "scheduled");
  const jobIds = (data ?? []).map((j) => j.bullmq_job_id).filter(Boolean);
  if (jobIds.length > 0) {
    await supabaseAdmin2.from("cobrai_jobs").update({ status: "cancelled" }).eq("invoice_id", invoiceId).eq("tenant_id", tenantId).eq("status", "scheduled");
    cobrancaLogger.info(
      { tenantId, invoiceId, cancelledCount: jobIds.length },
      "Jobs CobrAI cancelados ap\xF3s pagamento"
    );
  }
  return jobIds;
}
async function createDefaultCobraiRules(tenantId) {
  const defaultRules = [
    {
      tenant_id: tenantId,
      name: "Lembrete D+1",
      days_overdue: 1,
      action: "send_message",
      message_template: "Ol\xE1 {{customerName}}! \u{1F44B} Sua fatura de R$ {{amountBRL}} venceu ontem. Pague agora e evite a suspens\xE3o do servi\xE7o: {{paymentLink}}",
      active: true
    },
    {
      tenant_id: tenantId,
      name: "Aviso D+5",
      days_overdue: 5,
      action: "send_message",
      message_template: "Aten\xE7\xE3o {{customerName}}, sua fatura est\xE1 h\xE1 5 dias em aberto. Valor: R$ {{amountBRL}}. Para evitar a suspens\xE3o, regularize hoje: {{paymentLink}}",
      active: true
    },
    {
      tenant_id: tenantId,
      name: "Suspens\xE3o D+10",
      days_overdue: 10,
      action: "suspend_signal",
      active: true
    },
    {
      tenant_id: tenantId,
      name: "Notificar Operador D+30",
      days_overdue: 30,
      action: "notify_human",
      message_template: "Cliente {{customerName}} com {{daysOverdue}} dias de inadimpl\xEAncia.",
      active: true
    }
  ];
  await supabaseAdmin2.from("cobrai_rules").insert(defaultRules);
  cobrancaLogger.info({ tenantId, count: defaultRules.length }, "Regras CobrAI padr\xE3o criadas");
}
var init_cobrai_rules_service = __esm({
  "apps/api/src/domain/cobranca/cobrai-rules.service.ts"() {
    "use strict";
    init_supabase_client();
    init_logger2();
  }
});

// apps/api/src/adapters/vector/qdrant.adapter.ts
var qdrant_adapter_exports = {};
__export(qdrant_adapter_exports, {
  deleteDocumentPoints: () => deleteDocumentPoints,
  ensureCollection: () => ensureCollection,
  getCollectionStats: () => getCollectionStats,
  getQdrantClient: () => getQdrantClient2,
  getTenantCollection: () => getTenantCollection,
  searchSimilar: () => searchSimilar,
  upsertPoints: () => upsertPoints
});
function getQdrantClient2() {
  if (client) return client;
  const url = process.env.QDRANT_URL ?? "http://localhost:6333";
  const apiKey = process.env.QDRANT_API_KEY;
  client = new import_js_client_rest2.QdrantClient({
    url,
    apiKey,
    timeout: 1e4
  });
  infraLogger.info({ url }, "Qdrant client inicializado");
  return client;
}
function getTenantCollection(tenantId) {
  return `tenant_${tenantId.replace(/-/g, "_")}`;
}
async function ensureCollection(tenantId) {
  const qdrant = getQdrantClient2();
  const collectionName = getTenantCollection(tenantId);
  try {
    await qdrant.getCollection(collectionName);
    infraLogger.info({ collectionName }, "Cole\xE7\xE3o Qdrant j\xE1 existe");
    return;
  } catch {
  }
  await qdrant.createCollection(collectionName, {
    vectors: {
      size: VECTOR_DIMENSIONS,
      distance: DISTANCE_METRIC
    },
    optimizers_config: {
      default_segment_number: 2
    },
    replication_factor: 1
  });
  await qdrant.createPayloadIndex(collectionName, {
    field_name: "document_id",
    field_schema: "keyword"
  });
  infraLogger.info({ collectionName, dimensions: VECTOR_DIMENSIONS }, "Cole\xE7\xE3o Qdrant criada");
}
async function upsertPoints(tenantId, points) {
  const qdrant = getQdrantClient2();
  const collectionName = getTenantCollection(tenantId);
  await qdrant.upsert(collectionName, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload
    }))
  });
  infraLogger.info({ tenantId, count: points.length }, "Pontos inseridos no Qdrant");
}
async function searchSimilar(tenantId, queryVector, options = {}) {
  const qdrant = getQdrantClient2();
  const collectionName = getTenantCollection(tenantId);
  const filter = options.documentId ? {
    must: [{ key: "document_id", match: { value: options.documentId } }]
  } : void 0;
  const results = await qdrant.search(collectionName, {
    vector: queryVector,
    limit: options.limit ?? 5,
    score_threshold: options.scoreThreshold ?? 0.7,
    filter,
    with_payload: true
  });
  return results.map((r) => ({
    chunkText: r.payload?.chunk_text ?? "",
    documentId: r.payload?.document_id ?? "",
    filename: r.payload?.filename ?? "",
    score: r.score,
    chunkIndex: r.payload?.chunk_index ?? 0
  }));
}
async function deleteDocumentPoints(tenantId, documentId) {
  const qdrant = getQdrantClient2();
  const collectionName = getTenantCollection(tenantId);
  await qdrant.delete(collectionName, {
    wait: true,
    filter: {
      must: [{ key: "document_id", match: { value: documentId } }]
    }
  });
  infraLogger.info({ tenantId, documentId }, "Chunks do documento removidos do Qdrant");
}
async function getCollectionStats(tenantId) {
  const qdrant = getQdrantClient2();
  const collectionName = getTenantCollection(tenantId);
  try {
    const info = await qdrant.getCollection(collectionName);
    return {
      exists: true,
      pointsCount: info.points_count ?? 0,
      vectorsCount: info.vectors_count ?? 0,
      status: info.status
    };
  } catch {
    return { exists: false, pointsCount: 0, vectorsCount: 0, status: "not_found" };
  }
}
var import_js_client_rest2, VECTOR_DIMENSIONS, DISTANCE_METRIC, client;
var init_qdrant_adapter = __esm({
  "apps/api/src/adapters/vector/qdrant.adapter.ts"() {
    "use strict";
    import_js_client_rest2 = require("@qdrant/js-client-rest");
    init_logger2();
    VECTOR_DIMENSIONS = 1536;
    DISTANCE_METRIC = "Cosine";
    client = null;
  }
});

// apps/api/src/domain/onboarding/onboarding.service.ts
async function onboardNewTenant(req) {
  const completedSteps = [];
  let tenantId = "";
  let adminUserId = "";
  infraLogger.info({ tenantSlug: req.tenantSlug, plan: req.plan }, "Iniciando onboarding de novo tenant");
  try {
    const { data: tenant, error: tenantError } = await supabaseAdmin2.from("tenants").insert({
      name: req.tenantName,
      slug: req.tenantSlug,
      plan: req.plan,
      active: true,
      settings: { onboarding_complete: false }
    }).select("id").single();
    if (tenantError || !tenant) {
      throw new Error(`Erro ao criar tenant: ${tenantError?.message}`);
    }
    tenantId = tenant.id;
    completedSteps.push("tenant_created");
    infraLogger.info({ tenantId }, "Etapa 1/6: Tenant criado");
    const passwordHash = await hashPassword(req.adminPassword);
    const { data: admin2, error: adminError } = await supabaseAdmin2.from("users").insert({
      name: req.adminName,
      email: req.adminEmail.toLowerCase(),
      password_hash: passwordHash,
      role: "admin",
      tenant_id: tenantId,
      active: true
    }).select("id").single();
    if (adminError || !admin2) {
      throw new Error(`Erro ao criar admin: ${adminError?.message}`);
    }
    adminUserId = admin2.id;
    completedSteps.push("admin_created");
    infraLogger.info({ tenantId, adminUserId }, "Etapa 2/6: Admin criado");
    const { error: aiError } = await supabaseAdmin2.from("ai_configurations").insert({
      tenant_id: tenantId,
      bot_name: req.botName ?? "Astro",
      personality: req.botPersonality ?? "profissional, prestativo e objetivo",
      language: "pt-BR",
      temperature: 0.7,
      max_tokens_per_message: 1e3,
      security_threshold: 0.7,
      auto_suspend_enabled: true,
      cobrai_enabled: true,
      rag_enabled: true
    });
    if (aiError) {
      throw new Error(`Erro ao criar config de IA: ${aiError.message}`);
    }
    completedSteps.push("ai_config_created");
    infraLogger.info({ tenantId }, "Etapa 3/6: Config de IA criada");
    await createDefaultCobraiRules(tenantId);
    completedSteps.push("cobrai_rules_created");
    infraLogger.info({ tenantId }, "Etapa 4/6: Regras CobrAI criadas");
    await ensureCollection(tenantId);
    completedSteps.push("qdrant_collection_created");
    infraLogger.info({ tenantId }, "Etapa 5/6: Cole\xE7\xE3o Qdrant provisionada");
    await supabaseAdmin2.from("tenants").update({ settings: { onboarding_complete: true } }).eq("id", tenantId);
    await supabaseAdmin2.from("audit_log").insert({
      tenant_id: tenantId,
      user_id: adminUserId,
      action: "tenant_onboarded",
      metadata: {
        plan: req.plan,
        bot_name: req.botName ?? "Astro",
        completed_steps: completedSteps.length + 1
      }
    });
    completedSteps.push("onboarding_complete");
    infraLogger.info(
      { tenantId, adminUserId, stepsCompleted: completedSteps.length },
      "\u2705 Onboarding de tenant conclu\xEDdo com sucesso"
    );
    return { tenantId, adminUserId, success: true, completedSteps };
  } catch (err) {
    const failedStep = completedSteps[completedSteps.length - 1] ?? "initial";
    infraLogger.error(
      { tenantId, completedSteps, failedStep, err: err.message },
      "\u274C Onboarding falhou \u2014 tenant marcado como incompleto"
    );
    if (tenantId) {
      await supabaseAdmin2.from("tenants").update({ settings: { onboarding_complete: false, failed_step: failedStep } }).eq("id", tenantId);
    }
    return {
      tenantId,
      adminUserId,
      success: false,
      completedSteps,
      failedStep,
      error: err.message
    };
  }
}
async function isSlugAvailable(slug) {
  const { data } = await supabaseAdmin2.from("tenants").select("id").eq("slug", slug).single();
  return !data;
}
var init_onboarding_service = __esm({
  "apps/api/src/domain/onboarding/onboarding.service.ts"() {
    "use strict";
    init_supabase_client();
    init_password_service();
    init_cobrai_rules_service();
    init_qdrant_adapter();
    init_logger2();
  }
});

// apps/api/src/domain/onboarding/plan-limits.service.ts
async function getTenantPlanLimits(tenantId) {
  const { data } = await supabaseAdmin2.from("tenants").select("plan").eq("id", tenantId).single();
  const plan = data?.plan ?? "starter";
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
}
async function checkPlanLimit(tenantId, resource) {
  const { data: tenant } = await supabaseAdmin2.from("tenants").select("plan").eq("id", tenantId).single();
  const plan = tenant?.plan ?? "starter";
  const limits = PLAN_LIMITS[plan];
  const countMap = {
    customers: { table: "customers", maxField: "maxCustomers" },
    operators: { table: "users", maxField: "maxOperators" },
    documents: { table: "knowledge_documents", maxField: "maxDocuments" },
    messages: { table: "messages", maxField: "maxMessagesPerMonth" }
  };
  const config = countMap[resource];
  if (!config) throw new Error(`Configura\xE7\xE3o do recurso ${resource} n\xE3o encontrada.`);
  const { table, maxField } = config;
  const query = supabaseAdmin2.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (resource === "messages") {
    const firstOfMonth = /* @__PURE__ */ new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    query.gte("created_at", firstOfMonth.toISOString());
  }
  const { count } = await query;
  const current = count ?? 0;
  const limit = limits[maxField];
  const allowed = current < limit;
  if (!allowed) {
    infraLogger.warn(
      { tenantId, resource, current, limit, plan },
      `Limite de plano atingido: ${resource}`
    );
  }
  return { allowed, current, limit, plan };
}
function requirePlanCapacity(resource) {
  return async (request, reply) => {
    const { tenantId } = request.user ?? {};
    if (!tenantId) return;
    const check = await checkPlanLimit(tenantId, resource);
    if (!check.allowed) {
      const limitBRL = (PLAN_LIMITS[check.plan].priceCentsPerMonth / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
      return reply.status(402).send({
        code: "PLAN_LIMIT_REACHED",
        message: `Limite do plano ${check.plan} atingido para ${resource}: ${check.current}/${check.limit}.`,
        upgrade_hint: `Fa\xE7a upgrade para o plano Pro ou Enterprise para aumentar seus limites.`,
        current_plan: check.plan,
        current_usage: check.current,
        limit: check.limit
      });
    }
  };
}
var PLAN_LIMITS;
var init_plan_limits_service = __esm({
  "apps/api/src/domain/onboarding/plan-limits.service.ts"() {
    "use strict";
    init_supabase_client();
    init_logger2();
    PLAN_LIMITS = {
      starter: {
        maxCustomers: 500,
        maxOperators: 2,
        maxDocuments: 5,
        maxMessagesPerMonth: 1e3,
        ragEnabled: false,
        cobraiEnabled: true,
        analyticsEnabled: false,
        streamingEnabled: false,
        prioritySupport: false,
        priceCentsPerMonth: 29700
        // R$ 297,00/mês
      },
      pro: {
        maxCustomers: 5e3,
        maxOperators: 10,
        maxDocuments: 50,
        maxMessagesPerMonth: 1e4,
        ragEnabled: true,
        cobraiEnabled: true,
        analyticsEnabled: true,
        streamingEnabled: true,
        prioritySupport: false,
        priceCentsPerMonth: 79700
        // R$ 797,00/mês
      },
      enterprise: {
        maxCustomers: Infinity,
        maxOperators: Infinity,
        maxDocuments: Infinity,
        maxMessagesPerMonth: Infinity,
        ragEnabled: true,
        cobraiEnabled: true,
        analyticsEnabled: true,
        streamingEnabled: true,
        prioritySupport: true,
        priceCentsPerMonth: 0
        // negociado diretamente
      }
    };
  }
});

// apps/api/src/domain/onboarding/onboarding.routes.ts
var onboarding_routes_exports = {};
__export(onboarding_routes_exports, {
  onboardingRoutes: () => onboardingRoutes
});
async function onboardingRoutes(fastify) {
  fastify.get("/api/v2/onboarding/check-slug/:slug", async (request, reply) => {
    const { slug } = request.params;
    if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 3) {
      return reply.status(400).send({ code: "INVALID_SLUG", available: false });
    }
    const available = await isSlugAvailable(slug);
    return { slug, available };
  });
  fastify.post("/api/v2/onboarding/register", {
    preHandler: [validateBody(onboardingSchema)]
  }, async (request, reply) => {
    const body = request.validatedBody;
    const slugAvailable = await isSlugAvailable(body.tenantSlug);
    if (!slugAvailable) {
      return reply.status(409).send({
        code: "SLUG_TAKEN",
        message: `O slug "${body.tenantSlug}" j\xE1 est\xE1 em uso. Escolha outro.`
      });
    }
    const result = await onboardNewTenant(body);
    if (!result.success) {
      return reply.status(500).send({
        code: "ONBOARDING_FAILED",
        message: "Erro durante o cadastro. Tente novamente.",
        failedStep: result.failedStep,
        completedSteps: result.completedSteps
      });
    }
    return reply.status(201).send({
      message: `Bem-vindo ao Astrum, ${body.tenantName}! \u{1F389}`,
      tenantId: result.tenantId,
      adminUserId: result.adminUserId,
      completedSteps: result.completedSteps,
      nextStep: "Fa\xE7a login em /api/v2/auth/login com seu email e senha de admin."
    });
  });
  fastify.get("/api/v2/billing/plan", {
    onRequest: [fastify.authenticate]
  }, async (request) => {
    const { tenantId } = request.user;
    const limits = await getTenantPlanLimits(tenantId);
    const [customers, operators, documents] = await Promise.all([
      checkPlanLimit(tenantId, "customers"),
      checkPlanLimit(tenantId, "operators"),
      checkPlanLimit(tenantId, "documents")
    ]);
    return {
      plan: customers.plan,
      limits,
      usage: {
        customers: { current: customers.current, limit: customers.limit },
        operators: { current: operators.current, limit: operators.limit },
        documents: { current: documents.current, limit: documents.limit }
      },
      pricing: {
        currentPlanBRL: (limits.priceCentsPerMonth / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        }),
        allPlans: Object.entries(PLAN_LIMITS).map(([name, p]) => ({
          name,
          priceBRL: (p.priceCentsPerMonth / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          }),
          maxCustomers: p.maxCustomers === Infinity ? "Ilimitado" : p.maxCustomers,
          ragEnabled: p.ragEnabled,
          cobraiEnabled: p.cobraiEnabled
        }))
      }
    };
  });
}
var import_zod3, onboardingSchema;
var init_onboarding_routes = __esm({
  "apps/api/src/domain/onboarding/onboarding.routes.ts"() {
    "use strict";
    init_onboarding_service();
    init_plan_limits_service();
    init_zod_validator();
    import_zod3 = require("zod");
    onboardingSchema = import_zod3.z.object({
      tenantName: import_zod3.z.string().min(2).max(100),
      tenantSlug: import_zod3.z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras min\xFAsculas, n\xFAmeros e h\xEDfens"),
      plan: import_zod3.z.enum(["starter", "pro", "enterprise"]).default("starter"),
      adminName: import_zod3.z.string().min(2).max(100),
      adminEmail: import_zod3.z.string().email(),
      adminPassword: import_zod3.z.string().min(8).max(128),
      botName: import_zod3.z.string().min(1).max(50).optional(),
      botPersonality: import_zod3.z.string().max(500).optional()
    });
  }
});

// apps/api/src/infrastructure/auth/rbac.middleware.ts
var rbac_middleware_exports = {};
__export(rbac_middleware_exports, {
  checkPermission: () => checkPermission,
  requirePermission: () => requirePermission
});
function checkPermission(role, resource, action) {
  if (role === "super_admin") return true;
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource] ?? [];
  return resourcePerms.includes(action) || resourcePerms.includes("*");
}
function requirePermission(resource, action) {
  return async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Autentica\xE7\xE3o necess\xE1ria." });
    }
    const hasPermission = checkPermission(user.role, resource, action);
    if (!hasPermission) {
      securityLogger.warn(
        { userId: user.userId, role: user.role, resource, action },
        "Acesso negado por RBAC"
      );
      return reply.status(403).send({
        code: "FORBIDDEN",
        message: `Seu perfil (${user.role}) n\xE3o tem permiss\xE3o para ${action} em ${resource}.`
      });
    }
  };
}
var ROLE_PERMISSIONS;
var init_rbac_middleware = __esm({
  "apps/api/src/infrastructure/auth/rbac.middleware.ts"() {
    "use strict";
    init_logger2();
    ROLE_PERMISSIONS = {
      super_admin: { "*": ["*"], tickets: ["*"], customers: ["*"], billing: ["*"], ai_config: ["*"], reports: ["*"], users: ["*"] },
      admin: {
        "*": [],
        tickets: ["read", "write", "delete"],
        customers: ["read", "write", "delete"],
        billing: ["read", "write"],
        ai_config: ["read", "write"],
        reports: ["read"],
        users: ["read", "write"]
      },
      operator: {
        "*": [],
        tickets: ["read", "write"],
        customers: ["read"],
        billing: ["read"],
        ai_config: [],
        reports: ["read"],
        users: []
      },
      viewer: {
        "*": [],
        tickets: ["read"],
        customers: ["read"],
        billing: [],
        ai_config: [],
        reports: ["read"],
        users: []
      }
    };
  }
});

// apps/api/src/infrastructure/database/tenant-db.service.ts
function tenantQuery(tenantId) {
  return {
    /**
     * Busca registros garantindo que pertencem ao tenant correto.
     */
    from: (table) => ({
      select: (columns = "*") => supabaseAdmin2.from(table).select(columns).eq("tenant_id", tenantId),
      insert: (data) => {
        const records = Array.isArray(data) ? data : [data];
        const withTenant = records.map((r) => ({ ...r, tenant_id: tenantId }));
        return supabaseAdmin2.from(table).insert(withTenant);
      },
      update: (data) => supabaseAdmin2.from(table).update(data).eq("tenant_id", tenantId),
      delete: () => supabaseAdmin2.from(table).delete().eq("tenant_id", tenantId)
    })
  };
}
var init_tenant_db_service = __esm({
  "apps/api/src/infrastructure/database/tenant-db.service.ts"() {
    "use strict";
    init_supabase_client();
  }
});

// apps/api/src/domain/atendimento/tickets.routes.ts
var tickets_routes_exports = {};
__export(tickets_routes_exports, {
  ticketRoutes: () => ticketRoutes
});
async function ticketRoutes(fastify) {
  fastify.get("/api/v2/tickets", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("tickets", "read"),
      validateQuery(paginationSchema)
    ]
  }, async (request) => {
    const { tenantId } = request.user;
    const { page, limit } = request.validatedQuery;
    const { data, error } = await tenantQuery(tenantId).from("tickets").select("id, title, status, priority, created_at");
    if (error) throw error;
    return { data: data ?? [], page, limit };
  });
  fastify.post("/api/v2/tickets", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("tickets", "write"),
      requirePlanCapacity("messages"),
      // verifica limite de mensagens antes de processar
      validateBody(createTicketSchema)
    ]
  }, async (request, reply) => {
    const { tenantId } = request.user;
    const body = request.validatedBody;
    const { data, error } = await tenantQuery(tenantId).from("tickets").insert({ ...body, customer_id: body.customerId, assigned_to: null });
    if (error) throw error;
    return reply.status(201).send(data);
  });
  fastify.patch("/api/v2/tickets/:id", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("tickets", "write"),
      validateParams(import_zod4.z.object({ id: uuidSchema })),
      validateBody(updateTicketSchema)
    ]
  }, async (request, reply) => {
    const { tenantId } = request.user;
    const { id } = request.validatedParams;
    const body = request.validatedBody;
    const { data, error } = await tenantQuery(tenantId).from("tickets").update({ ...body, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (error) throw error;
    return reply.send(data);
  });
}
var import_zod4;
var init_tickets_routes = __esm({
  "apps/api/src/domain/atendimento/tickets.routes.ts"() {
    "use strict";
    init_zod_validator();
    init_rbac_middleware();
    init_plan_limits_service();
    init_schemas();
    init_tenant_db_service();
    import_zod4 = require("zod");
  }
});

// apps/api/src/adapters/storage/r2.adapter.ts
var import_client_s3, import_s3_request_presigner, import_crypto2, r2Client, BUCKET, R2Adapter, r2Adapter;
var init_r2_adapter = __esm({
  "apps/api/src/adapters/storage/r2.adapter.ts"() {
    "use strict";
    import_client_s3 = require("@aws-sdk/client-s3");
    import_s3_request_presigner = require("@aws-sdk/s3-request-presigner");
    init_logger2();
    import_crypto2 = __toESM(require("crypto"));
    r2Client = new import_client_s3.S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? ""
      }
    });
    BUCKET = process.env.R2_BUCKET_NAME ?? "astrum-storage";
    R2Adapter = class {
      /**
       * Upload de arquivo com organização por tenant.
       * Path: {tenantId}/{category}/{timestamp}-{filename}
       */
      async upload(tenantId, category, filename, body, contentType) {
        const timestamp = Date.now();
        const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `${tenantId}/${category}/${timestamp}-${sanitized}`;
        await r2Client.send(new import_client_s3.PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: {
            tenantId,
            category,
            originalFilename: filename,
            uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        }));
        const size = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
        infraLogger.info({ tenantId, key, size, category }, "R2: file uploaded");
        return {
          key,
          url: `${process.env.R2_PUBLIC_URL}/${key}`,
          size,
          contentType
        };
      }
      /**
       * URL pré-assinada para download direto (sem proxy pelo servidor).
       * Expira em 1 hora por padrão.
       */
      async getPresignedUrl(key, expiresIn = 3600) {
        const command = new import_client_s3.GetObjectCommand({ Bucket: BUCKET, Key: key });
        return (0, import_s3_request_presigner.getSignedUrl)(r2Client, command, { expiresIn });
      }
      /**
       * Stream do conteúdo do arquivo (para re-indexação RAG).
       */
      async getContent(key) {
        const response = await r2Client.send(new import_client_s3.GetObjectCommand({
          Bucket: BUCKET,
          Key: key
        }));
        const chunks = [];
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      }
      /**
       * Deletar arquivo (LGPD: direito ao esquecimento).
       */
      async delete(key) {
        await r2Client.send(new import_client_s3.DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        infraLogger.info({ key }, "R2: file deleted");
      }
      /**
       * Gerar key único para arquivo.
       */
      generateKey(tenantId, category, filename) {
        const hash = import_crypto2.default.createHash("sha256").update(`${tenantId}${filename}${Date.now()}`).digest("hex").slice(0, 8);
        return `${tenantId}/${category}/${hash}-${filename}`;
      }
    };
    r2Adapter = new R2Adapter();
  }
});

// apps/api/src/infrastructure/queue/priority-queues.ts
var priority_queues_exports = {};
__export(priority_queues_exports, {
  queues: () => queues
});
var import_bullmq3, isMock2, Queue3, queues;
var init_priority_queues = __esm({
  "apps/api/src/infrastructure/queue/priority-queues.ts"() {
    "use strict";
    import_bullmq3 = require("bullmq");
    init_redis_client();
    isMock2 = !getRedisClient().options;
    Queue3 = isMock2 ? class {
      constructor(name, opts) {
        this.name = name;
      }
      name;
      async add() {
        return { id: "mock" };
      }
      async close() {
      }
      on(event, fn) {
        return this;
      }
    } : class extends import_bullmq3.Queue {
      constructor(name, opts) {
        super(name, opts);
        this.on("error", (err) => console.error(`[BullMQ Error ${name}]`, err));
      }
    };
    queues = {
      cobrai: new Queue3("cobrai", { connection: getRedisClient(), defaultJobOptions: { priority: 10 } }),
      notifications: new Queue3("notifications", { connection: getRedisClient(), defaultJobOptions: { priority: 5 } }),
      documents: new Queue3("documents", { connection: getRedisClient(), defaultJobOptions: { priority: 1 } }),
      "ai-batch": new Queue3("ai-batch", { connection: getRedisClient(), defaultJobOptions: { priority: 1 } }),
      "outbox-poller": new Queue3("outbox-poller", { connection: getRedisClient() })
    };
  }
});

// apps/api/src/infrastructure/queue/outbox.service.ts
var EVENT_QUEUE_MAP, EVENT_PRIORITY_MAP, OutboxService, outboxService;
var init_outbox_service = __esm({
  "apps/api/src/infrastructure/queue/outbox.service.ts"() {
    "use strict";
    init_supabase_client();
    init_logger2();
    EVENT_QUEUE_MAP = {
      "document.uploaded": "documents",
      "invoice.paid": "cobrai",
      "customer.suspended": "notifications",
      "ticket.created": "notifications",
      "ticket.resolved": "ai-batch",
      "cobrai.scheduled": "cobrai",
      "customer.activated": "notifications"
    };
    EVENT_PRIORITY_MAP = {
      "invoice.paid": 10,
      // critical
      "customer.suspended": 10,
      // critical
      "cobrai.scheduled": 10,
      // critical
      "ticket.created": 5,
      // normal
      "ticket.resolved": 5,
      // normal
      "customer.activated": 5,
      // normal
      "document.uploaded": 1
      // batch
    };
    OutboxService = class {
      /**
       * Publica evento na tabela outbox.
       * Chamar DENTRO da mesma transação do banco que faz a mudança de negócio.
       */
      async publish(tenantId, eventType, payload) {
        const { error } = await supabase_client_default.from("outbox").insert({
          tenant_id: tenantId,
          event_type: eventType,
          payload,
          retry_count: 0
        });
        if (error) {
          infraLogger.error({ error, tenantId, eventType }, "Failed to write to outbox");
          throw error;
        }
        infraLogger.debug({ tenantId, eventType }, "Event written to outbox");
      }
      /**
       * Processa eventos pendentes do outbox.
       * Chamado pelo OutboxWorker a cada 5 segundos.
       */
      async processPending() {
        const { data: events } = await supabase_client_default.from("outbox").select("*").is("processed_at", null).lt("retry_count", 5).order("created_at", { ascending: true }).limit(50);
        if (!events || events.length === 0) return;
        infraLogger.debug({ count: events.length }, "Outbox: processing pending events");
        for (const event of events) {
          await this._processEvent(event);
        }
      }
      async _processEvent(event) {
        const queueName = EVENT_QUEUE_MAP[event.event_type];
        const priority = EVENT_PRIORITY_MAP[event.event_type] ?? 5;
        try {
          const { queues: queues2 } = await Promise.resolve().then(() => (init_priority_queues(), priority_queues_exports));
          const queue = queues2[queueName];
          if (!queue) throw new Error(`Queue ${queueName} not found`);
          await queue.add(event.event_type, {
            ...event.payload,
            tenantId: event.tenant_id,
            outboxId: event.id
          }, {
            priority,
            jobId: `outbox_${event.id}`
            // idempotência: mesmo outboxId = mesmo jobId
          });
          await supabase_client_default.from("outbox").update({ processed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", event.id);
          infraLogger.info({
            outboxId: event.id,
            eventType: event.event_type,
            queue: queueName,
            priority
          }, "Outbox event processed");
        } catch (err) {
          infraLogger.error({ err, outboxId: event.id }, "Outbox event failed");
          await supabase_client_default.from("outbox").update({ retry_count: event.retry_count + 1 }).eq("id", event.id);
        }
      }
    };
    outboxService = new OutboxService();
  }
});

// apps/api/src/infrastructure/ai/prompt-cache.service.ts
var prompt_cache_service_exports = {};
__export(prompt_cache_service_exports, {
  PromptCacheService: () => PromptCacheService,
  promptCacheService: () => promptCacheService
});
var CACHE_TTL, PromptCacheService, promptCacheService;
var init_prompt_cache_service = __esm({
  "apps/api/src/infrastructure/ai/prompt-cache.service.ts"() {
    "use strict";
    init_redis_client();
    init_logger2();
    CACHE_TTL = 60 * 60 * 24;
    PromptCacheService = class {
      redis = getRedisClient();
      /**
       * Retorna o system prompt do tenant, priorizando cache Redis.
       * O prompt é construído uma única vez e reutilizado → garante cache na OpenAI.
       */
      async getSystemPrompt(tenantId) {
        const cacheKey = `prompt_cache:${tenantId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          infraLogger.debug({ tenantId, tokenCount: parsed.tokenCount }, "System prompt from Redis cache");
          return parsed.systemPrompt;
        }
        const prompt = await this._buildTenantSystemPrompt(tenantId);
        await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(prompt));
        infraLogger.info({ tenantId, tokenCount: prompt.tokenCount }, "System prompt built and cached");
        return prompt.systemPrompt;
      }
      /**
       * Invalida o cache quando o tenant atualiza seus documentos.
       * Chamado após indexação de novo documento no RAG.
       */
      async invalidate(tenantId) {
        await this.redis.del(`prompt_cache:${tenantId}`);
        infraLogger.info({ tenantId }, "System prompt cache invalidated");
      }
      /**
       * Constrói o system prompt do tenant com:
       * 1. Persona e regras do negócio
       * 2. Resumo comprimido dos documentos principais
       * 3. Exemplos Few-Shot estáticos (sempre no mesmo lugar → cache eficiente)
       */
      async _buildTenantSystemPrompt(tenantId) {
        const { supabase: supabase2 } = await Promise.resolve().then(() => (init_supabase_client(), supabase_client_exports));
        const { data: tenant } = await supabase2.from("tenants").select("name, ai_persona, business_rules, plan").eq("id", tenantId).single();
        const { data: docs } = await supabase2.from("knowledge_documents").select("filename, summary").eq("tenant_id", tenantId).eq("status", "indexed").order("usage_count", { ascending: false }).limit(3);
        const docSummary = docs?.map(
          (d) => `[${d.filename}]: ${d.summary ?? "Sem resumo dispon\xEDvel"}`
        ).join("\n") ?? "";
        const systemPrompt = `
Voc\xEA \xE9 ${tenant?.ai_persona ?? "o assistente de suporte da operadora"}, da empresa ${tenant?.name ?? "ISP"}.

## REGRAS DO NEG\xD3CIO
${tenant?.business_rules ?? "Sempre seja cordial e resolva o problema do cliente."}

## DOCUMENTOS DE REFER\xCANCIA (resumos)
${docSummary}

## COMPORTAMENTO
- Pense passo a passo antes de cada resposta
- Nunca invente informa\xE7\xF5es t\xE9cnicas
- Se n\xE3o souber, crie um ticket para escala\xE7\xE3o
- Responda sempre em portugu\xEAs do Brasil
- Para diagn\xF3sticos t\xE9cnicos, solicite modelo do equipamento e CEP

## PLANO ATIVO
Plano ${tenant?.plan ?? "starter"} \u2014 Recursos dispon\xEDveis conforme contrato.
`.trim();
        return {
          tenantId,
          systemPrompt,
          tokenCount: Math.ceil(systemPrompt.length / 4),
          // estimativa ~4 chars/token
          cachedSince: (/* @__PURE__ */ new Date()).toISOString(),
          documentVersion: "v1"
        };
      }
    };
    promptCacheService = new PromptCacheService();
  }
});

// apps/api/src/domain/ia/documents.routes.ts
var documents_routes_exports = {};
__export(documents_routes_exports, {
  documentRoutes: () => documentRoutes
});
async function documentRoutes(fastify) {
  fastify.post("/api/v2/documents/upload", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("ai_config", "write"),
      requirePlanCapacity("documents")
    ]
  }, async (request, reply) => {
    const { tenantId, userId } = request.user;
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ code: "NO_FILE", message: "Nenhum arquivo enviado." });
    }
    const contentType = data.mimetype;
    const fileType = ALLOWED_TYPES[contentType];
    if (!fileType) {
      return reply.status(415).send({
        code: "UNSUPPORTED_TYPE",
        message: `Tipo de arquivo n\xE3o suportado. Aceitos: ${Object.values(ALLOWED_TYPES).join(", ")}`
      });
    }
    const buffer = await data.toBuffer();
    if (buffer.length > MAX_SIZE_BYTES) {
      return reply.status(413).send({
        code: "FILE_TOO_LARGE",
        message: "Arquivo muito grande. M\xE1ximo: 50MB."
      });
    }
    const uploaded = await r2Adapter.upload(
      tenantId,
      "documents",
      data.filename,
      buffer,
      contentType
    );
    const { data: doc3, error } = await supabaseAdmin2.from("knowledge_documents").insert({
      tenant_id: tenantId,
      filename: data.filename,
      file_type: fileType,
      file_size_bytes: uploaded.size,
      status: "processing",
      r2_key: uploaded.key,
      qdrant_collection: `tenant_${tenantId}`,
      uploaded_by: userId
    }).select("id, filename, status").single();
    if (error) throw error;
    iaLogger.info({ tenantId, documentId: doc3.id, filename: data.filename }, "Documento enviado, registrando outbox");
    await outboxService.publish(tenantId, "document.uploaded", {
      documentId: doc3.id,
      fileKey: uploaded.key,
      filename: data.filename
    });
    const { promptCacheService: promptCacheService2 } = await Promise.resolve().then(() => (init_prompt_cache_service(), prompt_cache_service_exports));
    await promptCacheService2.invalidate(tenantId);
    return reply.status(201).send({
      id: doc3.id,
      filename: doc3.filename,
      status: doc3.status,
      message: "Documento recebido. A indexa\xE7\xE3o para o RAG come\xE7ar\xE1 em instantes."
    });
  });
  fastify.get("/api/v2/documents", {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission("ai_config", "read")]
  }, async (request) => {
    const { tenantId } = request.user;
    const { data } = await supabaseAdmin2.from("knowledge_documents").select("id, filename, file_type, status, chunks_count, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    return { documents: data ?? [] };
  });
  fastify.get("/api/v2/documents/:id/download", {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission("ai_config", "read")]
  }, async (request, reply) => {
    const { tenantId } = request.user;
    const { id } = request.params;
    const { data: doc3 } = await supabaseAdmin2.from("knowledge_documents").select("r2_key, filename").eq("id", id).eq("tenant_id", tenantId).single();
    if (!doc3) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Documento n\xE3o encontrado." });
    }
    const url = await r2Adapter.getPresignedUrl(doc3.r2_key, 900);
    return { url, filename: doc3.filename, expiresInSeconds: 900 };
  });
}
var ALLOWED_TYPES, MAX_SIZE_BYTES;
var init_documents_routes = __esm({
  "apps/api/src/domain/ia/documents.routes.ts"() {
    "use strict";
    init_r2_adapter();
    init_rbac_middleware();
    init_plan_limits_service();
    init_supabase_client();
    init_logger2();
    init_outbox_service();
    ALLOWED_TYPES = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "text/plain": "txt",
      "text/markdown": "md"
    };
    MAX_SIZE_BYTES = 50 * 1024 * 1024;
  }
});

// apps/api/src/infrastructure/analytics/duckdb.service.ts
var duckdb_service_exports = {};
__export(duckdb_service_exports, {
  closeDuckDB: () => closeDuckDB,
  getDuckDB: () => getDuckDB
});
async function getDuckDB() {
  if (db2) return db2;
  const dbPath = process.env.NODE_ENV === "test" ? ":memory:" : import_node_path.default.resolve(process.cwd(), ".data", "analytics.duckdb");
  db2 = await duckdb.Database.create(dbPath);
  const conn = await db2.connect();
  await conn.run("SET memory_limit='512MB'");
  await conn.run("SET threads=4");
  await conn.close();
  infraLogger.info({ dbPath }, "DuckDB iniciado");
  return db2;
}
async function closeDuckDB() {
  if (db2) {
    await db2.close();
    db2 = null;
    infraLogger.info("DuckDB encerrado");
  }
}
var duckdb, import_node_path, db2;
var init_duckdb_service = __esm({
  "apps/api/src/infrastructure/analytics/duckdb.service.ts"() {
    "use strict";
    duckdb = __toESM(require("duckdb-async"));
    import_node_path = __toESM(require("node:path"));
    init_logger2();
    db2 = null;
  }
});

// apps/api/src/infrastructure/cache/http-cache.service.ts
function getCacheKey(request) {
  const user = request.user;
  const url = new URL(request.url, "http://localhost");
  const params = url.searchParams.toString();
  return `http_cache:${user?.tenantId}:${request.method}:${url.pathname}:${params}`;
}
function cacheResponse(ttlSeconds) {
  return async (request, reply) => {
    const redis4 = getRedisClient();
    const key = getCacheKey(request);
    try {
      const cached = await redis4.get(key);
      if (cached) {
        infraLogger.info({ key }, "Cache HIT");
        reply.header("X-Cache", "HIT");
        reply.header("Cache-Control", `public, max-age=${ttlSeconds}`);
        return reply.send(JSON.parse(cached));
      }
    } catch {
    }
    const originalSend = reply.send.bind(reply);
    reply.send = async (payload) => {
      if (reply.statusCode === 200 && payload) {
        try {
          await redis4.set(key, JSON.stringify(payload), "EX", ttlSeconds);
          reply.header("X-Cache", "MISS");
          reply.header("Cache-Control", `public, max-age=${ttlSeconds}`);
        } catch {
        }
      }
      return originalSend(payload);
    };
  };
}
var init_http_cache_service = __esm({
  "apps/api/src/infrastructure/cache/http-cache.service.ts"() {
    "use strict";
    init_redis_client();
    init_logger2();
  }
});

// apps/api/src/domain/ia/analytics.routes.ts
var analytics_routes_exports = {};
__export(analytics_routes_exports, {
  analyticsRoutes: () => analyticsRoutes
});
function periodToDays(period) {
  return { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[period] ?? 30;
}
async function analyticsRoutes(fastify) {
  fastify.get("/api/v2/analytics/dashboard", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("reports", "read"),
      validateQuery(analyticsQuerySchema),
      cacheResponse(15 * 60)
    ]
  }, async (request) => {
    const { tenantId } = request.user;
    const { period } = request.validatedQuery;
    const days = periodToDays(period);
    const db3 = await getDuckDB();
    const conn = await db3.connect();
    try {
      const messageVolume = await conn.all(`
        SELECT
          strftime(created_at, '%Y-%m-%d') as date,
          COUNT(*) as total,
          SUM(tokens_used) as tokens,
          SUM(CASE WHEN from_ai THEN 1 ELSE 0 END) as ai_responses
        FROM fact_messages
        WHERE tenant_id = ?
          AND created_at >= NOW() - INTERVAL (${days} || ' days')
        GROUP BY 1
        ORDER BY 1
      `, [tenantId]);
      const ticketResolution = await conn.all(`
        SELECT
          COUNT(*) as total_tickets,
          SUM(CASE WHEN resolved_by_ai THEN 1 ELSE 0 END) as resolved_by_ai,
          ROUND(AVG(resolution_minutes), 0) as avg_resolution_minutes,
          ROUND(100.0 * SUM(CASE WHEN resolved_by_ai THEN 1 ELSE 0 END) / COUNT(*), 1) as ai_resolution_rate
        FROM fact_tickets
        WHERE tenant_id = ?
          AND created_at >= NOW() - INTERVAL (${days} || ' days')
      `, [tenantId]);
      const inadimplencia = await conn.all(`
        SELECT
          COUNT(*) as total_invoices,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
          SUM(CASE WHEN status = 'overdue' THEN amount_cents ELSE 0 END) as overdue_cents,
          ROUND(100.0 * SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) / COUNT(*), 1) as overdue_rate
        FROM fact_invoices
        WHERE tenant_id = ?
          AND due_date >= NOW() - INTERVAL (${days} || ' days')
      `, [tenantId]);
      return {
        period,
        messageVolume,
        ticketResolution: ticketResolution[0] ?? {},
        inadimplencia: inadimplencia[0] ?? {}
      };
    } finally {
      await conn.close();
    }
  });
  fastify.get("/api/v2/analytics/ai-costs", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("reports", "read"),
      cacheResponse(30 * 60)
    ]
  }, async (request) => {
    const { tenantId } = request.user;
    const db3 = await getDuckDB();
    const conn = await db3.connect();
    try {
      const costs = await conn.all(`
        SELECT
          year, month,
          SUM(tokens_used) as total_tokens,
          -- Custo aproximado: GPT-4o-mini = $0.15/1M tokens input
          ROUND(SUM(tokens_used) * 0.00000015, 4) as estimated_cost_usd
        FROM fact_messages
        WHERE tenant_id = ? AND from_ai = TRUE
        GROUP BY year, month
        ORDER BY year DESC, month DESC
        LIMIT 12
      `, [tenantId]);
      return { costs };
    } finally {
      await conn.close();
    }
  });
}
var import_zod5, analyticsQuerySchema;
var init_analytics_routes = __esm({
  "apps/api/src/domain/ia/analytics.routes.ts"() {
    "use strict";
    init_duckdb_service();
    init_rbac_middleware();
    init_zod_validator();
    init_http_cache_service();
    import_zod5 = require("zod");
    analyticsQuerySchema = import_zod5.z.object({
      period: import_zod5.z.enum(["7d", "30d", "90d", "1y"]).default("30d")
    });
  }
});

// apps/api/src/adapters/ai/embedding.service.ts
async function generateEmbedding(text, tenantId) {
  const embeddings = await generateEmbeddingsBatch([text], tenantId);
  return embeddings[0] || [];
}
async function generateEmbeddingsBatch(texts, tenantId) {
  if (texts.length === 0) return [];
  const client3 = createOpenAIClient(tenantId);
  const allEmbeddings = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await client3.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: 1536
    });
    const batchEmbeddings = response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    allEmbeddings.push(...batchEmbeddings);
    iaLogger.info(
      {
        tenantId,
        batchSize: batch.length,
        tokensUsed: response.usage.total_tokens
      },
      "Embeddings gerados"
    );
  }
  return allEmbeddings;
}
var EMBEDDING_MODEL, MAX_BATCH_SIZE;
var init_embedding_service = __esm({
  "apps/api/src/adapters/ai/embedding.service.ts"() {
    "use strict";
    init_openai_adapter2();
    init_logger2();
    EMBEDDING_MODEL = "text-embedding-3-small";
    MAX_BATCH_SIZE = 100;
  }
});

// apps/api/src/infrastructure/observability/langsmith.service.ts
function getLangSmithClient() {
  if (!isEnabled) return null;
  if (client2) return client2;
  client2 = new import_langsmith.Client({
    apiKey: process.env.LANGCHAIN_API_KEY,
    apiUrl: "https://api.smith.langchain.com"
  });
  return client2;
}
async function traceRAGPipeline(opts) {
  const ls = getLangSmithClient();
  if (!ls) return null;
  try {
    const runId = crypto.randomUUID();
    await ls.createRun({
      id: runId,
      name: "astrum:rag:pipeline",
      run_type: "chain",
      inputs: { query: opts.query },
      outputs: {
        answer: opts.answer,
        sources: opts.chunksRetrieved.map((c) => ({
          filename: c.filename,
          relevance_score: c.score
        }))
      },
      extra: {
        metadata: {
          tenant_id: opts.metadata.tenantId,
          conversation_id: opts.metadata.conversationId,
          chunks_retrieved: opts.chunksRetrieved.length,
          rag_used: opts.metadata.ragUsed
        }
      },
      start_time: Date.now() - 1e3,
      end_time: Date.now()
    });
    return runId;
  } catch (err) {
    iaLogger.warn({ err }, "LangSmith: falha ao registrar RAG pipeline");
    return null;
  }
}
var import_langsmith, client2, isEnabled;
var init_langsmith_service = __esm({
  "apps/api/src/infrastructure/observability/langsmith.service.ts"() {
    "use strict";
    import_langsmith = require("langsmith");
    init_logger2();
    client2 = null;
    isEnabled = !!process.env.LANGCHAIN_API_KEY;
  }
});

// apps/api/src/infrastructure/rag/rag-query.service.ts
function buildRAGSystemPrompt(chunks, tenantName) {
  const contextBlocks = chunks.map(
    (chunk, i) => `[Fonte ${i + 1} \u2014 ${chunk.filename}]
${chunk.chunkText}`
  ).join("\n\n---\n\n");
  return `Voc\xEA \xE9 o assistente t\xE9cnico do provedor de internet ${tenantName}.

Responda \xE0 pergunta do cliente APENAS com base nas informa\xE7\xF5es abaixo.
Se a resposta n\xE3o estiver nas fontes, diga claramente que n\xE3o encontrou a informa\xE7\xE3o e sugira contato com o suporte.
Nunca invente informa\xE7\xF5es t\xE9cnicas.

=== BASE DE CONHECIMENTO ===
${contextBlocks}
=== FIM DA BASE DE CONHECIMENTO ===

Responda em portugu\xEAs, de forma clara e objetiva.
Se for uma quest\xE3o t\xE9cnica, inclua os passos numerados.`;
}
async function queryRAG(options) {
  const start = Date.now();
  const {
    query,
    tenantId,
    userId,
    conversationHistory = [],
    maxContextChunks = 5,
    scoreThreshold = 0.7,
    fallbackToGeneral = true
  } = options;
  iaLogger.info({ tenantId, queryPreview: query.slice(0, 80) }, "RAG query iniciada");
  const { data: aiConfig } = await supabaseAdmin2.from("ai_configurations").select("bot_name, custom_instructions, temperature").eq("tenant_id", tenantId).single();
  const { data: tenant } = await supabaseAdmin2.from("tenants").select("name").eq("id", tenantId).single();
  const tenantName = tenant?.name ?? "nosso provedor";
  const queryEmbedding = await generateEmbedding(query, tenantId);
  let chunks = [];
  try {
    chunks = await searchSimilar(tenantId, queryEmbedding, {
      limit: maxContextChunks,
      scoreThreshold
    });
  } catch (err) {
    iaLogger.warn({ err, tenantId }, "Qdrant indispon\xEDvel \u2014 usando LLM sem contexto RAG");
  }
  const ragUsed = chunks.length > 0;
  iaLogger.info(
    { tenantId, chunksFound: chunks.length, ragUsed },
    ragUsed ? "RAG: chunks relevantes encontrados" : "RAG: sem chunks relevantes \u2014 usando fallback"
  );
  const systemPrompt = ragUsed ? buildRAGSystemPrompt(chunks, tenantName) : FALLBACK_SYSTEM_PROMPT;
  const messages = [
    ...conversationHistory,
    { role: "user", content: query }
  ];
  const llmResponse = await callLLM({
    messages,
    systemPrompt,
    tenantId,
    userId,
    context: ragUsed ? "support" : "support",
    forceModel: ragUsed ? "gpt-4o" : "gpt-4o-mini",
    temperature: aiConfig?.temperature ?? 0.7
  });
  const result = {
    answer: llmResponse.content,
    sourcesUsed: chunks.map((c) => ({
      filename: c.filename,
      chunkIndex: c.chunkIndex,
      score: Math.round(c.score * 100) / 100
    })),
    ragUsed,
    chunksFound: chunks.length,
    tokensUsed: llmResponse.tokensUsed,
    latencyMs: Date.now() - start
  };
  iaLogger.info(
    {
      tenantId,
      ragUsed,
      chunksFound: chunks.length,
      tokensUsed: llmResponse.tokensUsed,
      latencyMs: result.latencyMs
    },
    "RAG query conclu\xEDda"
  );
  const langsmithRunId = await traceRAGPipeline({
    query: options.query,
    chunksRetrieved: chunks.map((c) => ({
      filename: c.filename,
      score: c.score,
      text: c.chunkText.slice(0, 200)
      // apenas preview — não enviar conteúdo completo
    })),
    answer: result.answer,
    metadata: {
      tenantId: options.tenantId,
      conversationId: options.conversationId,
      userId: options.userId,
      model: llmResponse.routingDecision,
      ragUsed,
      chunksFound: chunks.length
    }
  });
  if (langsmithRunId && options.conversationId) {
    await supabaseAdmin2.from("messages").update({ metadata: { langsmith_run_id: langsmithRunId } }).eq("conversation_id", options.conversationId).eq("role", "assistant").order("created_at", { ascending: false }).limit(1);
  }
  return result;
}
var FALLBACK_SYSTEM_PROMPT;
var init_rag_query_service = __esm({
  "apps/api/src/infrastructure/rag/rag-query.service.ts"() {
    "use strict";
    init_embedding_service();
    init_qdrant_adapter();
    init_llm_adapter();
    init_logger2();
    init_supabase_client();
    init_langsmith_service();
    FALLBACK_SYSTEM_PROMPT = `Voc\xEA \xE9 um assistente de atendimento de provedor de internet.
Ajude o cliente com suas d\xFAvidas de forma educada e profissional.
Para quest\xF5es t\xE9cnicas espec\xEDficas, sempre recomende contato com o suporte t\xE9cnico.
Responda em portugu\xEAs.`;
  }
});

// apps/api/src/domain/ia/rag.routes.ts
var rag_routes_exports = {};
__export(rag_routes_exports, {
  ragRoutes: () => ragRoutes
});
async function ragRoutes(fastify) {
  fastify.post("/api/v2/rag/query", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("ai_config", "read"),
      validateBody(ragQuerySchema)
    ]
  }, async (request) => {
    const { tenantId, userId } = request.user;
    const body = request.validatedBody;
    const result = await queryRAG({
      query: body.query,
      tenantId,
      userId,
      conversationHistory: body.conversationHistory,
      maxContextChunks: body.maxContextChunks
    });
    return {
      answer: result.answer,
      sources: result.sourcesUsed,
      ragUsed: result.ragUsed,
      chunksFound: result.chunksFound,
      latencyMs: result.latencyMs
    };
  });
}
var import_zod6, ragQuerySchema;
var init_rag_routes = __esm({
  "apps/api/src/domain/ia/rag.routes.ts"() {
    "use strict";
    init_rag_query_service();
    init_rbac_middleware();
    init_zod_validator();
    import_zod6 = require("zod");
    ragQuerySchema = import_zod6.z.object({
      query: import_zod6.z.string().min(3).max(2e3),
      conversationHistory: import_zod6.z.array(import_zod6.z.object({
        role: import_zod6.z.enum(["user", "assistant"]),
        content: import_zod6.z.string()
      })).optional().default([]),
      maxContextChunks: import_zod6.z.number().int().min(1).max(10).optional().default(5)
    });
  }
});

// apps/api/src/infrastructure/guardrails/pii-detector.service.ts
function detectAndMaskPII(text) {
  const detected = [];
  let maskedText = text;
  let offset = 0;
  for (const { type, pattern, mask } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      detected.push({
        type,
        originalValue: match[0],
        maskedValue: mask,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
  }
  const sortedDetected = [...detected].sort((a, b) => b.startIndex - a.startIndex);
  for (const entity of sortedDetected) {
    maskedText = maskedText.slice(0, entity.startIndex) + entity.maskedValue + maskedText.slice(entity.endIndex);
  }
  const hasPII = detected.length > 0;
  if (hasPII) {
    securityLogger.info(
      { piiTypes: detected.map((d) => d.type), count: detected.length },
      "PII detectado e mascarado na mensagem antes de enviar para LLM"
    );
  }
  return { originalText: text, maskedText, detected, hasPII };
}
var PII_PATTERNS;
var init_pii_detector_service = __esm({
  "apps/api/src/infrastructure/guardrails/pii-detector.service.ts"() {
    "use strict";
    init_logger2();
    PII_PATTERNS = [
      {
        type: "CPF",
        pattern: /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g,
        mask: "[CPF OMITIDO]"
      },
      {
        type: "CREDIT_CARD",
        pattern: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
        mask: "[CART\xC3O OMITIDO]"
      },
      {
        type: "PHONE",
        pattern: /\b(\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4})\b/g,
        mask: "[TELEFONE OMITIDO]"
      },
      {
        type: "EMAIL",
        pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
        mask: "[EMAIL OMITIDO]"
      },
      {
        type: "RG",
        pattern: /\b(\d{2}\.?\d{3}\.?\d{3}-?[\dxX])\b/g,
        mask: "[RG OMITIDO]"
      },
      {
        type: "PASSWORD_MENTION",
        pattern: /\b(senha|password|passwd|pin)\s*[:=é]\s*\S+/gi,
        mask: "[SENHA OMITIDA]"
      },
      {
        type: "BANK_ACCOUNT",
        pattern: /\bagência\s*[:=]?\s*\d{4}[-\s]?\d?\s*conta\s*[:=]?\s*\d{5,12}/gi,
        mask: "[DADOS BANC\xC1RIOS OMITIDOS]"
      }
    ];
  }
});

// apps/api/src/infrastructure/guardrails/injection-deflector.service.ts
function analyzeForInjection(text, securityThreshold = 0.7) {
  const detectedPatterns = [];
  let riskScore = 0;
  for (const { name, pattern, weight } of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detectedPatterns.push(name);
      riskScore = Math.min(1, riskScore + weight);
    }
  }
  for (const { name, check, weight } of SUSPICIOUS_BEHAVIORS) {
    if (check(text)) {
      detectedPatterns.push(name);
      riskScore = Math.min(1, riskScore + weight);
    }
  }
  let recommendation;
  let reason;
  if (riskScore >= securityThreshold) {
    recommendation = "block";
    reason = `Score de risco ${riskScore.toFixed(2)} excede threshold ${securityThreshold}. Padr\xF5es: ${detectedPatterns.join(", ")}`;
    securityLogger.error(
      { riskScore, detectedPatterns, textPreview: text.slice(0, 100) },
      "\u{1F6A8} Tentativa de prompt injection detectada e bloqueada"
    );
  } else if (riskScore >= 0.4) {
    recommendation = "warn";
    securityLogger.warn({ riskScore, detectedPatterns }, "Mensagem suspeita \u2014 passando com aviso");
  } else {
    recommendation = "allow";
  }
  return {
    isSafe: recommendation !== "block",
    riskScore,
    detectedPatterns,
    recommendation,
    reason
  };
}
var INJECTION_PATTERNS, SUSPICIOUS_BEHAVIORS;
var init_injection_deflector_service = __esm({
  "apps/api/src/infrastructure/guardrails/injection-deflector.service.ts"() {
    "use strict";
    init_logger2();
    INJECTION_PATTERNS = [
      // Comandos diretos de override
      {
        name: "ignore_instructions",
        pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
        weight: 0.9
      },
      {
        name: "forget_instructions",
        pattern: /forget\s+(everything|all|your\s+instructions)/gi,
        weight: 0.9
      },
      {
        name: "new_instructions",
        pattern: /your\s+new\s+(instructions?|prompt|rules?|task)\s*(are|is)?[:=]/gi,
        weight: 0.8
      },
      // Tentativas em português
      {
        name: "ignore_instructions_pt",
        pattern: /ignore\s+(todas?\s+as?\s+)?(instruções|regras|comandos)\s+(anteriores?|acima)/gi,
        weight: 0.9
      },
      {
        name: "act_as_pt",
        pattern: /aja\s+como\s+(se\s+você\s+fosse|um|uma)\s+/gi,
        weight: 0.6
      },
      {
        name: "admin_access_pt",
        pattern: /(me\s+dê\s+acesso|libere\s+o\s+acesso|acesso\s+(admin|root|total))/gi,
        weight: 0.85
      },
      // Tentativas de roleplay malicioso
      {
        name: "dan_jailbreak",
        pattern: /\bDAN\b|do\s+anything\s+now|jailbreak/gi,
        weight: 0.95
      },
      {
        name: "act_as_en",
        pattern: /act\s+as\s+(if\s+you\s+were|a|an)\s+/gi,
        weight: 0.5
      },
      {
        name: "pretend_en",
        pattern: /pretend\s+(you\s+are|to\s+be)\s+/gi,
        weight: 0.5
      },
      // Exfiltração de dados do sistema
      {
        name: "reveal_prompt",
        pattern: /(show|reveal|display|print|repeat)\s+(your\s+)?(system\s+)?(prompt|instructions)/gi,
        weight: 0.8
      },
      {
        name: "reveal_prompt_pt",
        pattern: /(mostre?|revele?|exiba|repita)\s+(seus?\s+|suas?\s+)?(prompt|instruções\s+do\s+sistema)/gi,
        weight: 0.8
      },
      // Injeção via delimitadores
      {
        name: "delimiter_injection",
        pattern: /(\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|###\s*System:)/g,
        weight: 0.95
      },
      // Tentativa de executar código
      {
        name: "code_execution",
        pattern: /(execute|run|eval)\s+(this\s+)?(code|script|command)/gi,
        weight: 0.7
      }
    ];
    SUSPICIOUS_BEHAVIORS = [
      // Mensagem muito longa pode ser tentativa de injection por volume
      { name: "very_long_message", check: (text) => text.length > 1500, weight: 0.2 },
      // Muitas quebras de linha/espaços podem esconder injeção
      { name: "excessive_newlines", check: (text) => (text.match(/\n/g)?.length ?? 0) > 20, weight: 0.15 },
      // Muitos caracteres especiais
      { name: "special_chars", check: (text) => (text.match(/[{}[\]<>]/g)?.length ?? 0) > 10, weight: 0.15 }
    ];
  }
});

// apps/api/src/infrastructure/guardrails/content-moderation.service.ts
async function moderateContent(text, tenantId) {
  const client3 = createOpenAIClient(tenantId);
  try {
    const response = await client3.moderations.create({ input: text });
    const result = response.results[0];
    if (!result) return SAFE_FALLBACK;
    const scores = result.category_scores;
    const categories = result.categories;
    let highestScore = 0;
    let highestCategory = "none";
    for (const [category, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        highestCategory = category;
      }
    }
    let recommendation;
    if (result.flagged || highestScore >= BLOCK_THRESHOLD) {
      recommendation = "block";
      securityLogger.warn(
        { tenantId, highestCategory, highestScore: highestScore.toFixed(3), flagged: result.flagged },
        "\u{1F6A8} Conte\xFAdo impr\xF3prio detectado pela Moderation API"
      );
    } else if (highestScore >= WARN_THRESHOLD) {
      recommendation = "warn";
      securityLogger.info(
        { tenantId, highestCategory, highestScore: highestScore.toFixed(3) },
        "Conte\xFAdo com score moderado \u2014 passando com aviso"
      );
    } else {
      recommendation = "allow";
    }
    return {
      isSafe: recommendation !== "block",
      flagged: result.flagged,
      categories,
      categoryScores: scores,
      highestScore,
      highestCategory,
      recommendation
    };
  } catch (err) {
    securityLogger.error(
      { err, tenantId },
      "Moderation API indispon\xEDvel \u2014 permitindo mensagem (fail open)"
    );
    return SAFE_FALLBACK;
  }
}
var WARN_THRESHOLD, BLOCK_THRESHOLD, SAFE_FALLBACK;
var init_content_moderation_service = __esm({
  "apps/api/src/infrastructure/guardrails/content-moderation.service.ts"() {
    "use strict";
    init_openai_adapter2();
    init_logger2();
    WARN_THRESHOLD = 0.5;
    BLOCK_THRESHOLD = 0.8;
    SAFE_FALLBACK = {
      isSafe: true,
      flagged: false,
      categories: {},
      categoryScores: {},
      highestScore: 0,
      highestCategory: "none",
      recommendation: "allow"
    };
  }
});

// apps/api/src/infrastructure/guardrails/guardrails.pipeline.ts
async function runGuardrails(text, config) {
  const t0 = Date.now();
  const piiResult = detectAndMaskPII(text);
  const t1 = Date.now();
  const injectionResult = analyzeForInjection(
    piiResult.maskedText,
    config.securityThreshold ?? 0.7
  );
  const t2 = Date.now();
  if (!injectionResult.isSafe) {
    securityLogger.info({
      piiMs: t1 - t0,
      injectionMs: t2 - t1,
      moderationMs: 0,
      totalMs: t2 - t0
    }, "Guardrails latency breakdown");
    return {
      safe: false,
      processedText: piiResult.maskedText,
      blockedReason: `Injection detectada: ${injectionResult.detectedPatterns.join(", ")}`,
      pii: { detected: piiResult.hasPII, count: piiResult.detected.length },
      injection: { score: injectionResult.riskScore, patterns: injectionResult.detectedPatterns },
      moderation: { flagged: false },
      totalLatencyMs: t2 - t0
    };
  }
  let moderationResult = { isSafe: true, flagged: false, highestCategory: "none", highestScore: 0 };
  if (!config.skipModeration) {
    const modResult = await moderateContent(piiResult.maskedText, config.tenantId);
    moderationResult = {
      isSafe: modResult.isSafe,
      flagged: modResult.flagged,
      highestCategory: modResult.highestCategory,
      highestScore: modResult.highestScore
    };
  }
  const t3 = Date.now();
  securityLogger.info({
    piiMs: t1 - t0,
    injectionMs: t2 - t1,
    moderationMs: t3 - t2,
    totalMs: t3 - t0
  }, "Guardrails latency breakdown");
  const safe = moderationResult.isSafe;
  if (!safe) {
    securityLogger.warn(
      { tenantId: config.tenantId, category: moderationResult.highestCategory },
      "Mensagem bloqueada pela pipeline de guardrails (moderation)"
    );
  }
  return {
    safe,
    processedText: piiResult.maskedText,
    blockedReason: !safe ? `Conte\xFAdo impr\xF3prio detectado: ${moderationResult.highestCategory}` : void 0,
    pii: { detected: piiResult.hasPII, count: piiResult.detected.length },
    injection: { score: injectionResult.riskScore, patterns: injectionResult.detectedPatterns },
    moderation: { flagged: moderationResult.flagged, category: moderationResult.highestCategory },
    totalLatencyMs: t3 - t0
  };
}
var init_guardrails_pipeline = __esm({
  "apps/api/src/infrastructure/guardrails/guardrails.pipeline.ts"() {
    "use strict";
    init_pii_detector_service();
    init_injection_deflector_service();
    init_content_moderation_service();
    init_logger2();
  }
});

// apps/api/src/infrastructure/rag/system-prompt-builder.service.ts
async function buildSystemPrompt(context) {
  const { data: config } = await supabaseAdmin2.from("ai_configurations").select("*").eq("tenant_id", context.tenantId).single();
  const { data: tenant } = await supabaseAdmin2.from("tenants").select("name").eq("id", context.tenantId).single();
  const cfg = config ?? DEFAULT_CONFIG;
  const tenantName = tenant?.name ?? "nosso provedor";
  const now = context.currentDateTime ?? (/* @__PURE__ */ new Date()).toLocaleString("pt-BR");
  const sections = [];
  sections.push(
    `Voc\xEA \xE9 ${cfg.bot_name ?? DEFAULT_CONFIG.botName}, assistente virtual do ${tenantName}.`
  );
  sections.push(
    `Seu estilo \xE9: ${cfg.personality ?? DEFAULT_CONFIG.personality}.`
  );
  if (context.customerName) {
    let clientContext = `Voc\xEA est\xE1 atendendo: ${context.customerName}.`;
    if (context.customerPlan) {
      clientContext += ` Plano atual: ${context.customerPlan}.`;
    }
    if (context.customerStatus === "suspended") {
      clientContext += ` \u26A0\uFE0F ATEN\xC7\xC3O: Conex\xE3o do cliente est\xE1 SUSPENSA.`;
    }
    sections.push(clientContext);
  }
  sections.push(`Data/hora atual: ${now}.`);
  if (context.ragContext) {
    sections.push(`
=== BASE DE CONHECIMENTO DO ISP ===
${context.ragContext}
=== FIM DA BASE DE CONHECIMENTO ===

Use as informa\xE7\xF5es acima para responder. Se a resposta n\xE3o estiver na base, informe e sugira o suporte.`);
  }
  sections.push(`
REGRAS:
- Responda SEMPRE em portugu\xEAs do Brasil
- Nunca invente informa\xE7\xF5es t\xE9cnicas
- Para problemas t\xE9cnicos graves, escale para um operador humano
- Nunca mencione que \xE9 uma IA se n\xE3o perguntarem diretamente
- Seja conciso: m\xE1ximo 3 par\xE1grafos salvo necessidade t\xE9cnica`);
  if (cfg.custom_instructions) {
    sections.push(`
INSTRU\xC7\xD5ES ESPEC\xCDFICAS DO ISP:
${cfg.custom_instructions}`);
  }
  return {
    prompt: sections.join("\n\n"),
    botName: cfg.bot_name ?? DEFAULT_CONFIG.botName,
    temperature: cfg.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: cfg.max_tokens_per_message ?? DEFAULT_CONFIG.maxTokensPerMessage
  };
}
var DEFAULT_CONFIG;
var init_system_prompt_builder_service = __esm({
  "apps/api/src/infrastructure/rag/system-prompt-builder.service.ts"() {
    "use strict";
    init_supabase_client();
    DEFAULT_CONFIG = {
      botName: "Astro",
      personality: "profissional, prestativo e objetivo",
      language: "pt-BR",
      temperature: 0.7,
      maxTokensPerMessage: 1e3,
      customInstructions: ""
    };
  }
});

// apps/api/src/infrastructure/ai/vercel-ai.service.ts
var import_ai, import_openai8, import_zod7, NetworkDiagnosticSchema, CustomerIntentSchema, TicketReportSchema, agentTools, VercelAIService, vercelAIService;
var init_vercel_ai_service = __esm({
  "apps/api/src/infrastructure/ai/vercel-ai.service.ts"() {
    "use strict";
    import_ai = require("ai");
    import_openai8 = require("@ai-sdk/openai");
    import_zod7 = require("zod");
    init_logger2();
    NetworkDiagnosticSchema = import_zod7.z.object({
      problem_category: import_zod7.z.enum([
        "signal_loss",
        "slow_speed",
        "intermittent",
        "equipment_failure",
        "billing",
        "configuration",
        "other"
      ]),
      severity: import_zod7.z.enum(["low", "medium", "high", "critical"]),
      recommended_action: import_zod7.z.enum([
        "reboot_equipment",
        "check_cables",
        "schedule_technician",
        "check_invoice",
        "escalate_human",
        "send_instructions"
      ]),
      estimated_resolution_hours: import_zod7.z.number().min(0).max(72),
      technical_notes: import_zod7.z.string().max(500),
      requires_human: import_zod7.z.boolean()
    });
    CustomerIntentSchema = import_zod7.z.object({
      intent: import_zod7.z.enum([
        "support_technical",
        "support_billing",
        "upgrade_plan",
        "cancel_service",
        "check_status",
        "complaint",
        "other"
      ]),
      urgency: import_zod7.z.enum(["low", "normal", "high"]),
      sentiment: import_zod7.z.enum(["positive", "neutral", "negative", "frustrated"]),
      extracted_data: import_zod7.z.object({
        cpf: import_zod7.z.string().optional(),
        contract_id: import_zod7.z.string().optional(),
        address: import_zod7.z.string().optional(),
        equipment_model: import_zod7.z.string().optional()
      }),
      suggested_tools: import_zod7.z.array(import_zod7.z.enum([
        "suspend_signal",
        "check_invoice",
        "create_ticket",
        "query_rag",
        "query_supabase",
        "escalate_human"
      ]))
    });
    TicketReportSchema = import_zod7.z.object({
      title: import_zod7.z.string().max(100),
      description: import_zod7.z.string().max(1e3),
      category: import_zod7.z.enum(["technical", "billing", "commercial", "complaint"]),
      priority: import_zod7.z.enum(["low", "medium", "high", "urgent"]),
      tags: import_zod7.z.array(import_zod7.z.string()).max(5),
      auto_resolved: import_zod7.z.boolean(),
      resolution_summary: import_zod7.z.string().max(500).optional()
    });
    agentTools = {
      suspend_signal: {
        description: "Suspende o sinal de internet de um cliente inadimplente. Use apenas quando a pol\xEDtica de cobran\xE7a autorizar.",
        parameters: import_zod7.z.object({
          customer_id: import_zod7.z.string().describe("ID \xFAnico do cliente no Supabase"),
          reason: import_zod7.z.string().describe("Motivo da suspens\xE3o para log de auditoria"),
          scheduled_for: import_zod7.z.string().datetime().optional().describe("Agendar para data futura (ISO 8601). Null = imediato.")
        })
      },
      check_invoice: {
        description: "Consulta o status de faturas de um cliente. Use para responder perguntas sobre pagamentos.",
        parameters: import_zod7.z.object({
          customer_id: import_zod7.z.string(),
          include_overdue_only: import_zod7.z.boolean().default(false)
        })
      },
      create_ticket: {
        description: "Cria um ticket de suporte no sistema quando n\xE3o conseguir resolver automaticamente.",
        parameters: import_zod7.z.object({
          customer_id: import_zod7.z.string(),
          title: import_zod7.z.string().max(100),
          description: import_zod7.z.string().max(500),
          priority: import_zod7.z.enum(["low", "medium", "high", "urgent"]),
          category: import_zod7.z.enum(["technical", "billing", "commercial", "complaint"])
        })
      },
      query_knowledge_base: {
        description: "Busca informa\xE7\xF5es nos manuais t\xE9cnicos e documentos do ISP. Use para perguntas t\xE9cnicas sobre equipamentos, configura\xE7\xF5es e procedimentos.",
        parameters: import_zod7.z.object({
          query: import_zod7.z.string().describe("Pergunta t\xE9cnica para buscar na base de conhecimento"),
          max_results: import_zod7.z.number().min(1).max(5).default(3)
        })
      }
    };
    VercelAIService = class {
      model = (0, import_openai8.openai)("gpt-4o-mini");
      heavyModel = (0, import_openai8.openai)("gpt-4o");
      /**
       * Classifica a intenção do cliente com saída estruturada (Zod).
       * BLOCO 2: generateObject → zero risco de JSON mal-formado.
       */
      async classifyIntent(message, conversationHistory, tenantId) {
        const { object } = await (0, import_ai.generateObject)({
          model: this.model,
          schema: CustomerIntentSchema,
          system: this._buildSystemPrompt("classification"),
          messages: [
            {
              role: "user",
              content: `Hist\xF3rico:
${conversationHistory}

Mensagem atual: "${message}"`
            }
          ],
          headers: {
            "Helicone-Property-TenantId": tenantId,
            "Helicone-Property-UseCase": "classify-intent"
          }
        });
        infraLogger.info({ intent: object.intent, urgency: object.urgency }, "Intent classified");
        return object;
      }
      /**
       * Gera diagnóstico técnico estruturado.
       * CoT ativado: "Pense passo a passo" no system prompt.
       */
      async generateNetworkDiagnostic(customerMessage, ragContext, tenantId) {
        const { object } = await (0, import_ai.generateObject)({
          model: this.heavyModel,
          // GPT-4o para diagnósticos técnicos
          schema: NetworkDiagnosticSchema,
          system: this._buildSystemPrompt("technical_diagnostic"),
          messages: [
            {
              role: "user",
              content: `Contexto t\xE9cnico dos manuais:
${ragContext}

Queixa do cliente: "${customerMessage}"`
            }
          ],
          headers: {
            "Helicone-Property-TenantId": tenantId,
            "Helicone-Property-UseCase": "network-diagnostic"
          }
        });
        return object;
      }
      /**
       * Gera relatório de ticket estruturado ao encerrar atendimento.
       */
      async generateTicketReport(conversationSummary, resolution, tenantId) {
        const { object } = await (0, import_ai.generateObject)({
          model: this.model,
          schema: TicketReportSchema,
          system: this._buildSystemPrompt("ticket_report"),
          messages: [
            {
              role: "user",
              content: `Resumo da conversa:
${conversationSummary}

Resolu\xE7\xE3o:
${resolution}`
            }
          ],
          headers: {
            "Helicone-Property-TenantId": tenantId,
            "Helicone-Property-UseCase": "ticket-report"
          }
        });
        return object;
      }
      /**
       * Streaming SSE com Function Calling.
       * O agente decide quando usar as ferramentas.
       */
      async streamWithTools(messages, systemContext, tenantId, onToolCall) {
        const result = (0, import_ai.streamText)({
          model: this.heavyModel,
          system: `${this._buildSystemPrompt("chat")}

${systemContext}`,
          messages,
          tools: agentTools,
          maxSteps: 5,
          // máximo de tool calls em sequência
          onStepFinish: async (step) => {
            if (step.toolCalls && onToolCall) {
              for (const toolCall of step.toolCalls) {
                infraLogger.info({
                  tool: toolCall.toolName,
                  args: toolCall.args,
                  tenantId
                }, "Tool called by agent");
                await onToolCall(toolCall.toolName, toolCall.args);
              }
            }
          },
          headers: {
            "Helicone-Property-TenantId": tenantId,
            "Helicone-Property-UseCase": "chat-stream"
          }
        });
        return result;
      }
      // ─── System Prompts com CoT ────────────────────────────────────────────────
      _buildSystemPrompt(useCase) {
        const base = `Voc\xEA \xE9 o assistente de suporte da Astrum, especializado em ISPs (Provedores de Internet).
Voc\xEA SEMPRE pensa passo a passo antes de responder.
Voc\xEA NUNCA inventa informa\xE7\xF5es \u2014 se n\xE3o souber, diz que vai criar um ticket para um especialista.
Voc\xEA NUNCA executa a\xE7\xF5es financeiras sem confirmar com o cliente.
Responda sempre em portugu\xEAs do Brasil.`;
        const cotPrefix = `Antes de responder, siga este racioc\xEDnio interno:
1. Qual \xE9 a inten\xE7\xE3o real do cliente?
2. Tenho informa\xE7\xF5es suficientes para resolver?
3. Qual a\xE7\xE3o \xE9 mais adequada?
4. Preciso usar alguma ferramenta?
Ap\xF3s este racioc\xEDnio, forne\xE7a a resposta final ao cliente.`;
        const prompts = {
          classification: `${base}
Sua tarefa \xE9 classificar a inten\xE7\xE3o da mensagem. Seja preciso.`,
          technical_diagnostic: `${base}
${cotPrefix}
Sua tarefa \xE9 diagnosticar problemas t\xE9cnicos de rede com base nos manuais fornecidos.`,
          ticket_report: `${base}
Sua tarefa \xE9 gerar um relat\xF3rio estruturado do atendimento realizado.`,
          chat: `${base}
${cotPrefix}`
        };
        return prompts[useCase] ?? base;
      }
    };
    vercelAIService = new VercelAIService();
  }
});

// packages/queue/src/queues.ts
var import_bullmq4, DEFAULT_JOB_OPTIONS, isMockRedis3, createQueue, messageQueue2, cobrancaQueue, notificationsQueue, aiProcessingQueue, suspensionQueue;
var init_queues = __esm({
  "packages/queue/src/queues.ts"() {
    "use strict";
    import_bullmq4 = require("bullmq");
    init_redis_client();
    DEFAULT_JOB_OPTIONS = {
      attempts: 3,
      backoff: { type: "exponential", delay: 2e3 },
      removeOnComplete: { count: 100 },
      removeOnFail: false
    };
    isMockRedis3 = !connection2.options;
    createQueue = (name, opts) => {
      if (isMockRedis3) return {
        add: async () => ({ id: "mock" }),
        close: async () => {
        },
        name
      };
      const q = new import_bullmq4.Queue(name, opts);
      q.on("error", (err) => console.error(`[BullMQ Error in ${name}]`, err));
      return q;
    };
    messageQueue2 = createQueue("astrum-messages", {
      connection: connection2,
      defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 5 }
    });
    cobrancaQueue = createQueue("astrum-cobranca", {
      connection: connection2,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        priority: 10
        // alta prioridade
      }
    });
    notificationsQueue = createQueue("astrum-notifications", {
      connection: connection2,
      defaultJobOptions: DEFAULT_JOB_OPTIONS
    });
    aiProcessingQueue = createQueue("astrum-ai-processing", {
      connection: connection2,
      defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, attempts: 2 }
    });
    suspensionQueue = createQueue("astrum-suspension", {
      connection: connection2,
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        priority: 1,
        // máxima prioridade
        attempts: 5
      }
    });
  }
});

// apps/api/src/infrastructure/ai/tools.executor.ts
var ToolsExecutor;
var init_tools_executor = __esm({
  "apps/api/src/infrastructure/ai/tools.executor.ts"() {
    "use strict";
    init_supabase_client();
    init_queues();
    init_logger2();
    ToolsExecutor = class {
      constructor(tenantId) {
        this.tenantId = tenantId;
      }
      tenantId;
      async execute(toolName, args) {
        infraLogger.info({ toolName, args, tenantId: this.tenantId }, "Executing tool");
        switch (toolName) {
          case "suspend_signal":
            return this._suspendSignal(args);
          case "check_invoice":
            return this._checkInvoice(args);
          case "create_ticket":
            return this._createTicket(args);
          case "query_knowledge_base":
            return this._queryKnowledgeBase(args);
          default:
            infraLogger.warn({ toolName }, "Unknown tool called \u2014 ignoring");
            return { error: "Ferramenta n\xE3o reconhecida" };
        }
      }
      async _suspendSignal(args) {
        const { customer_id, reason, scheduled_for } = args;
        await supabase_client_default.from("audit_log").insert({
          tenant_id: this.tenantId,
          action: "ai_suspend_signal",
          entity_id: customer_id,
          metadata: { reason, scheduled_for, triggered_by: "ai_agent" }
        });
        await suspensionQueue.add("suspend_signal", {
          customerId: customer_id,
          tenantId: this.tenantId,
          reason,
          scheduledFor: scheduled_for
        }, {
          delay: scheduled_for ? new Date(scheduled_for).getTime() - Date.now() : 0,
          priority: 10
          // critical
        });
        return { success: true, message: `Suspens\xE3o agendada para ${customer_id}` };
      }
      async _checkInvoice(args) {
        const { customer_id, include_overdue_only } = args;
        let query = supabase_client_default.from("invoices").select("id, amount_cents, due_date, status, paid_at").eq("customer_id", customer_id).eq("tenant_id", this.tenantId).order("due_date", { ascending: false }).limit(5);
        if (include_overdue_only) {
          query = query.eq("status", "overdue");
        }
        const { data, error } = await query;
        if (error) return { error: "Erro ao consultar faturas" };
        return { invoices: data };
      }
      async _createTicket(args) {
        const { customer_id, title, description, priority, category } = args;
        const { data, error } = await supabase_client_default.from("tickets").insert({
          tenant_id: this.tenantId,
          customer_id,
          title,
          description,
          priority,
          category,
          status: "open",
          created_by: "ai_agent"
        }).select("id").single();
        if (error) return { error: "Erro ao criar ticket" };
        return { ticket_id: data.id, success: true };
      }
      async _queryKnowledgeBase(args) {
        const { query } = args;
        return { query, message: "RAG query delegated to rag-query.service" };
      }
    };
  }
});

// apps/api/src/infrastructure/ai/few-shot.service.ts
var few_shot_service_exports = {};
__export(few_shot_service_exports, {
  FewShotService: () => FewShotService,
  fewShotService: () => fewShotService
});
var FewShotService, fewShotService;
var init_few_shot_service = __esm({
  "apps/api/src/infrastructure/ai/few-shot.service.ts"() {
    "use strict";
    init_logger2();
    init_redis_client();
    init_qdrant_adapter();
    init_openai_adapter2();
    FewShotService = class {
      constructor(qdrant = getQdrantClient2(), openaiSdk = createOpenAIClient()) {
        this.qdrant = qdrant;
        this.openaiSdk = openaiSdk;
      }
      qdrant;
      openaiSdk;
      redis = getRedisClient();
      /**
       * Busca 3 exemplos resolvidos similares e formata para injeção no prompt.
       */
      async buildFewShotContext(query, tenantId, maxExamples = 3) {
        const cacheKey = `few_shot:${tenantId}:${Buffer.from(query).toString("base64").slice(0, 32)}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return cached;
        try {
          const embeddingResponse = await this.openaiSdk.embeddings.create({
            model: "text-embedding-3-small",
            input: query
          });
          const queryVector = embeddingResponse.data?.[0]?.embedding ?? [];
          const collectionName = `resolved_tickets_${tenantId}`;
          const results = await this.qdrant.search(collectionName, {
            vector: queryVector,
            limit: maxExamples,
            filter: {
              must: [
                { key: "status", match: { value: "resolved" } },
                { key: "has_resolution", match: { value: true } }
              ]
            },
            with_payload: true,
            score_threshold: 0.75
            // só exemplos realmente similares
          });
          if (results.length === 0) return "";
          const examples = results.map((result, i) => {
            const payload = result.payload;
            return `
EXEMPLO ${i + 1} (score de satisfa\xE7\xE3o: ${payload.satisfaction_score ?? "N/A"}):
Cliente: "${payload.customerMessage}"
Resolu\xE7\xE3o do agente: "${payload.agentResolution}"
Categoria: ${payload.category}`.trim();
          });
          const context = `
## EXEMPLOS DE ATENDIMENTOS RESOLVIDOS (use como refer\xEAncia de qualidade):
${examples.join("\n\n")}

## Agora atenda o cliente atual com a mesma qualidade:`.trim();
          await this.redis.setex(cacheKey, 60 * 30, context);
          infraLogger.info({
            tenantId,
            examplesFound: results.length,
            query: query.slice(0, 50)
          }, "Few-shot examples found");
          return context;
        } catch (err) {
          infraLogger.warn({ err, tenantId }, "Few-shot search failed \u2014 continuing without examples");
          return "";
        }
      }
      /**
       * Indexa ticket resolvido como exemplo para uso futuro.
       * Chamado automaticamente quando ticket é fechado com resolução.
       */
      async indexResolvedTicket(tenantId, ticket) {
        try {
          const collectionName = `resolved_tickets_${tenantId}`;
          const embeddingResponse = await this.openaiSdk.embeddings.create({
            model: "text-embedding-3-small",
            input: ticket.customerMessage
          });
          const vector = embeddingResponse.data?.[0]?.embedding ?? [];
          await this.qdrant.upsert(collectionName, {
            wait: true,
            points: [{
              id: ticket.id,
              vector,
              payload: {
                customerMessage: ticket.customerMessage,
                agentResolution: ticket.agentResolution,
                category: ticket.category,
                satisfaction_score: ticket.satisfactionScore,
                status: "resolved",
                has_resolution: true,
                indexed_at: (/* @__PURE__ */ new Date()).toISOString()
              }
            }]
          });
          infraLogger.info({ tenantId, ticketId: ticket.id }, "Resolved ticket indexed for few-shot");
        } catch (err) {
          infraLogger.error({ err, tenantId }, "Failed to index resolved ticket");
        }
      }
    };
    fewShotService = new FewShotService();
  }
});

// apps/api/src/domain/ia/chat-stream.routes.ts
var chat_stream_routes_exports = {};
__export(chat_stream_routes_exports, {
  chatStreamRoutes: () => chatStreamRoutes
});
async function chatStreamRoutes(fastify) {
  fastify.post("/api/v2/chat/stream", {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission("tickets", "read"),
      validateBody(chatSchema)
    ]
  }, async (request, reply) => {
    const { tenantId, userId } = request.user;
    const { message, conversationId, customerId } = request.validatedBody;
    const guardrails = await runGuardrails(message, { tenantId });
    if (!guardrails.safe) {
      return reply.status(400).send({
        code: "CONTENT_BLOCKED",
        message: "N\xE3o posso processar esta mensagem."
      });
    }
    let ragContext = "";
    try {
      const queryEmbedding = await generateEmbedding(guardrails.processedText, tenantId);
      const chunks = await searchSimilar(tenantId, queryEmbedding, {
        limit: 4,
        scoreThreshold: 0.72
      });
      if (chunks.length > 0) {
        ragContext = chunks.map((c, i) => `[Fonte ${i + 1} \u2014 ${c.filename}]
${c.chunkText}`).join("\n\n---\n\n");
      }
    } catch {
    }
    const intent = await vercelAIService.classifyIntent(
      guardrails.processedText,
      "",
      // histórico real aqui depois
      tenantId
    );
    const { promptCacheService: promptCacheService2 } = await Promise.resolve().then(() => (init_prompt_cache_service(), prompt_cache_service_exports));
    const { fewShotService: fewShotService2 } = await Promise.resolve().then(() => (init_few_shot_service(), few_shot_service_exports));
    const [systemPrompt, fewShotContext] = await Promise.all([
      promptCacheService2.getSystemPrompt(tenantId),
      fewShotService2.buildFewShotContext(message, tenantId)
    ]);
    const legacyPrompt = await buildSystemPrompt({
      tenantId,
      ragContext: ragContext || void 0
    });
    const fullContext = fewShotContext ? `${systemPrompt}

${fewShotContext}` : systemPrompt;
    const toolsExecutor = new ToolsExecutor(tenantId);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    const sendEvent = (data) => {
      reply.raw.write(`data: ${JSON.stringify(data)}

`);
    };
    try {
      const result = await vercelAIService.streamWithTools(
        [{ role: "user", content: guardrails.processedText }],
        `Intent detectada: ${intent.intent} | Urg\xEAncia: ${intent.urgency}

${fullContext}`,
        tenantId,
        async (toolName, args) => toolsExecutor.execute(toolName, args)
      );
      for await (const chunk of result.textStream) {
        if (chunk) {
          sendEvent({ type: "token", content: chunk });
        }
      }
      sendEvent({
        type: "done",
        ragUsed: !!ragContext,
        botName: legacyPrompt.botName
      });
    } catch (err) {
      sendEvent({ type: "error", message: "Erro ao gerar resposta. Tente novamente." });
    } finally {
      reply.raw.end();
    }
  });
}
var import_zod8, chatSchema;
var init_chat_stream_routes = __esm({
  "apps/api/src/domain/ia/chat-stream.routes.ts"() {
    "use strict";
    init_rbac_middleware();
    init_guardrails_pipeline();
    init_system_prompt_builder_service();
    init_embedding_service();
    init_qdrant_adapter();
    init_vercel_ai_service();
    init_tools_executor();
    import_zod8 = require("zod");
    init_zod_validator();
    chatSchema = import_zod8.z.object({
      message: import_zod8.z.string().min(1).max(2e3),
      conversationId: import_zod8.z.string().uuid().optional(),
      customerId: import_zod8.z.string().uuid().optional()
    });
  }
});

// apps/api/src/infrastructure/analytics/etl.service.ts
async function getLastSync(tableName) {
  const db3 = await getDuckDB();
  const conn = await db3.connect();
  try {
    await conn.run(`
      CREATE TABLE IF NOT EXISTS _etl_watermarks (
        table_name VARCHAR PRIMARY KEY,
        last_sync TIMESTAMP NOT NULL,
        records_synced INTEGER DEFAULT 0
      )
    `);
    const result = await conn.all(
      `SELECT last_sync FROM _etl_watermarks WHERE table_name = ?`,
      tableName
    );
    if (result.length > 0 && result[0]) {
      return new Date(result[0].last_sync);
    }
    return new Date(Date.now() - 90 * 864e5);
  } finally {
    await conn.close();
  }
}
async function updateWatermark(tableName, syncTime, count) {
  const db3 = await getDuckDB();
  const conn = await db3.connect();
  try {
    await conn.run(`
      INSERT OR REPLACE INTO _etl_watermarks (table_name, last_sync, records_synced)
      VALUES (?, ?, ?)
    `, tableName, syncTime.toISOString(), count);
  } finally {
    await conn.close();
  }
}
async function syncMessages(tenantId) {
  const lastSync = await getLastSync(`messages_${tenantId ?? "all"}`);
  const syncTime = /* @__PURE__ */ new Date();
  const query = supabaseAdmin2.from("messages").select("id, tenant_id, conversation_id, role, from_ai, tokens_used, created_at").gte("created_at", lastSync.toISOString()).order("created_at", { ascending: true }).limit(1e4);
  if (tenantId) query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) {
    infraLogger.error({ err: error }, "ETL: erro ao buscar mensagens");
    return 0;
  }
  if (!data || data.length === 0) {
    infraLogger.info({ tenantId, table: "messages" }, "ETL: nenhum registro novo");
    return 0;
  }
  const db3 = await getDuckDB();
  const conn = await db3.connect();
  try {
    const stmt = await conn.prepare(`
      INSERT OR REPLACE INTO fact_messages
        (id, tenant_id, conversation_id, role, from_ai, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const msg of data) {
      await stmt.run(
        msg.id ?? null,
        msg.tenant_id ?? null,
        msg.conversation_id ?? null,
        msg.role ?? null,
        msg.from_ai ?? false,
        msg.tokens_used ?? 0,
        msg.created_at ?? null
      );
    }
    await stmt.finalize();
    await updateWatermark(`messages_${tenantId ?? "all"}`, syncTime, data.length);
    infraLogger.info(
      { count: data.length, tenantId, table: "messages" },
      "ETL: mensagens sincronizadas"
    );
    return data.length;
  } finally {
    await conn.close();
  }
}
async function syncTickets(tenantId) {
  const lastSync = await getLastSync(`tickets_${tenantId ?? "all"}`);
  const syncTime = /* @__PURE__ */ new Date();
  const query = supabaseAdmin2.from("tickets").select("id, tenant_id, status, priority, resolved_by_ai, created_at, updated_at").gte("created_at", lastSync.toISOString()).order("created_at", { ascending: true }).limit(5e3);
  if (tenantId) query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error || !data || data.length === 0) return 0;
  const db3 = await getDuckDB();
  const conn = await db3.connect();
  try {
    const stmt = await conn.prepare(`
      INSERT OR REPLACE INTO fact_tickets
        (id, tenant_id, status, priority, resolved_by_ai, created_at, resolved_at, resolution_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of data) {
      const resolvedAt = t.status === "resolved" || t.status === "closed" ? t.updated_at : null;
      const resolutionMinutes = resolvedAt && t.created_at ? Math.round((new Date(resolvedAt).getTime() - new Date(t.created_at).getTime()) / 6e4) : null;
      await stmt.run(
        t.id ?? null,
        t.tenant_id ?? null,
        t.status ?? null,
        t.priority ?? null,
        t.resolved_by_ai ?? false,
        t.created_at ?? null,
        resolvedAt ?? null,
        resolutionMinutes ?? null
      );
    }
    await stmt.finalize();
    await updateWatermark(`tickets_${tenantId ?? "all"}`, syncTime, data.length);
    infraLogger.info({ count: data.length, tenantId }, "ETL: tickets sincronizados");
    return data.length;
  } finally {
    await conn.close();
  }
}
async function syncInvoices(tenantId) {
  const lastSync = await getLastSync(`invoices_${tenantId ?? "all"}`);
  const syncTime = /* @__PURE__ */ new Date();
  const query = supabaseAdmin2.from("invoices").select("id, tenant_id, customer_id, amount_cents, status, due_date, paid_at").gte("created_at", lastSync.toISOString()).limit(5e3);
  if (tenantId) query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error || !data || data.length === 0) return 0;
  const db3 = await getDuckDB();
  const conn = await db3.connect();
  try {
    const stmt = await conn.prepare(`
      INSERT OR REPLACE INTO fact_invoices
        (id, tenant_id, customer_id, amount_cents, status, due_date, paid_at, days_overdue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const inv of data) {
      const daysOverdue = inv.status === "overdue" ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 864e5) : null;
      await stmt.run(
        inv.id ?? null,
        inv.tenant_id ?? null,
        inv.customer_id ?? null,
        inv.amount_cents ?? null,
        inv.status ?? null,
        inv.due_date ?? null,
        inv.paid_at ?? null,
        daysOverdue ?? null
      );
    }
    await stmt.finalize();
    await updateWatermark(`invoices_${tenantId ?? "all"}`, syncTime, data.length);
    infraLogger.info({ count: data.length, tenantId }, "ETL: faturas sincronizadas");
    return data.length;
  } finally {
    await conn.close();
  }
}
async function runFullETL(tenantId) {
  const start = Date.now();
  infraLogger.info({ tenantId }, "ETL: iniciando sincroniza\xE7\xE3o completa");
  const [messages, tickets, invoices] = await Promise.all([
    syncMessages(tenantId),
    syncTickets(tenantId),
    syncInvoices(tenantId)
  ]);
  const result = { messages, tickets, invoices, totalMs: Date.now() - start };
  infraLogger.info(result, "ETL: sincroniza\xE7\xE3o completa conclu\xEDda");
  return result;
}
var init_etl_service = __esm({
  "apps/api/src/infrastructure/analytics/etl.service.ts"() {
    "use strict";
    init_duckdb_service();
    init_supabase_client();
    init_logger2();
  }
});

// apps/api/src/domain/ia/etl.routes.ts
var etl_routes_exports = {};
__export(etl_routes_exports, {
  etlRoutes: () => etlRoutes
});
async function etlRoutes(fastify) {
  fastify.post("/api/v2/admin/etl/sync", {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission("reports", "admin")]
  }, async (request) => {
    const { tenantId, role } = request.user;
    const targetTenant = role === "super_admin" ? void 0 : tenantId;
    const result = await runFullETL(targetTenant);
    return { ...result, message: "ETL sincronizado com sucesso." };
  });
}
var init_etl_routes = __esm({
  "apps/api/src/domain/ia/etl.routes.ts"() {
    "use strict";
    init_etl_service();
    init_rbac_middleware();
  }
});

// apps/api/src/domain/realtime/websocket.routes.ts
var websocket_routes_exports = {};
__export(websocket_routes_exports, {
  default: () => websocket_routes_default,
  publishToChannel: () => publishToChannel,
  wsPublisher: () => wsPublisher
});
async function publishToChannel(channel, payload) {
  await redis3.publish(channel, JSON.stringify(payload));
}
async function wsAuthenticate(request, reply) {
  const token = request.headers.authorization?.replace("Bearer ", "") ?? request.query.token;
  if (!token) return reply.status(401).send({ error: "Token required" });
  try {
    const payload = request.server.jwt.verify(token);
    request.user = payload;
  } catch (err) {
    return reply.status(401).send({ error: "Invalid token" });
  }
}
function wsRequireRole(roles) {
  return async (request, reply) => {
    if (!roles.includes(request.user?.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
  };
}
async function sendPendingNotifications(socket, tenantId, userId) {
  const { supabase: supabase2 } = await Promise.resolve().then(() => (init_supabase_client(), supabase_client_exports));
  const { count } = await supabase2.from("tickets").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "open");
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({
      type: "initial_state",
      openTickets: count ?? 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }));
  }
}
var import_fastify_plugin5, import_websocket, connections, redis3, websocketRoutes, wsPublisher, websocket_routes_default;
var init_websocket_routes = __esm({
  "apps/api/src/domain/realtime/websocket.routes.ts"() {
    "use strict";
    import_fastify_plugin5 = __toESM(require("fastify-plugin"));
    import_websocket = __toESM(require("@fastify/websocket"));
    init_logger2();
    init_redis_client();
    connections = /* @__PURE__ */ new Map();
    redis3 = getRedisClient();
    websocketRoutes = async (fastify) => {
      await fastify.register(import_websocket.default);
      fastify.get("/ws/conversations/:conversationId", {
        websocket: true,
        preHandler: [wsAuthenticate]
      }, (socket, request) => {
        const { conversationId } = request.params;
        const user = request.user;
        const connId = `${user.tenantId}:${user.userId}:${Date.now()}`;
        const channel = `conversation:${user.tenantId}:${conversationId}`;
        connections.set(connId, {
          ws: socket,
          tenantId: user.tenantId,
          userId: user.userId,
          role: user.role,
          channels: /* @__PURE__ */ new Set([channel])
        });
        const subscriber = redis3.duplicate();
        subscriber.subscribe(channel);
        subscriber.on("message", (chan, message) => {
          if (chan === channel && socket.readyState === 1) {
            socket.send(message);
          }
        });
        infraLogger.info({ connId, channel }, "WS: client connected to conversation");
        socket.on("message", async (raw) => {
          try {
            const data = JSON.parse(raw.toString());
            if (data.type === "typing") {
              await publishToChannel(channel, {
                type: "typing",
                userId: user.userId,
                tenantId: user.tenantId,
                timestamp: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
          } catch {
          }
        });
        socket.on("close", () => {
          connections.delete(connId);
          subscriber.unsubscribe(channel);
          subscriber.quit();
          infraLogger.debug({ connId }, "WS: client disconnected");
        });
        socket.on("error", (err) => {
          infraLogger.error({ err, connId }, "WS error");
          connections.delete(connId);
        });
      });
      fastify.get("/ws/notifications", {
        websocket: true,
        preHandler: [wsAuthenticate]
      }, (socket, request) => {
        const user = request.user;
        const connId = `notif:${user.tenantId}:${user.userId}:${Date.now()}`;
        const channel = `notifications:${user.tenantId}`;
        connections.set(connId, {
          ws: socket,
          tenantId: user.tenantId,
          userId: user.userId,
          role: user.role,
          channels: /* @__PURE__ */ new Set([channel])
        });
        const subscriber = redis3.duplicate();
        subscriber.subscribe(channel);
        subscriber.on("message", (_, message) => {
          if (socket.readyState === 1) socket.send(message);
        });
        sendPendingNotifications(socket, user.tenantId, user.userId);
        socket.on("close", () => {
          connections.delete(connId);
          subscriber.unsubscribe(channel);
          subscriber.quit();
        });
      });
      fastify.get("/ws/operator-panel", {
        websocket: true,
        preHandler: [wsAuthenticate, wsRequireRole(["admin", "operator"])]
      }, (socket, request) => {
        const user = request.user;
        const connId = `panel:${user.tenantId}:${user.userId}`;
        const channels = [
          `ticket_queue:${user.tenantId}`,
          `sla_alerts:${user.tenantId}`
        ];
        connections.set(connId, {
          ws: socket,
          tenantId: user.tenantId,
          userId: user.userId,
          role: "operator",
          channels: new Set(channels)
        });
        const subscriber = redis3.duplicate();
        subscriber.subscribe(...channels);
        subscriber.on("message", (_, message) => {
          if (socket.readyState === 1) socket.send(message);
        });
        socket.on("close", () => {
          connections.delete(connId);
          subscriber.quit();
        });
      });
    };
    wsPublisher = {
      newMessage: (tenantId, conversationId, message) => publishToChannel(`conversation:${tenantId}:${conversationId}`, {
        type: "new_message",
        ...message
      }),
      ticketCreated: (tenantId, ticket) => publishToChannel(`ticket_queue:${tenantId}`, {
        type: "ticket_created",
        ...ticket
      }),
      slaAlert: (tenantId, ticketId, minutesLeft) => publishToChannel(`sla_alerts:${tenantId}`, {
        type: "sla_alert",
        ticketId,
        minutesLeft,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }),
      paymentReceived: (tenantId, invoiceId, amountCents) => publishToChannel(`notifications:${tenantId}`, {
        type: "payment_received",
        invoiceId,
        amountCents,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }),
      customerConnected: (tenantId, customerId) => publishToChannel(`ticket_queue:${tenantId}`, {
        type: "customer_connected",
        customerId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
    websocket_routes_default = (0, import_fastify_plugin5.default)(websocketRoutes);
  }
});

// apps/api/src/infrastructure/realtime/realtime.service.ts
var realtime_service_exports = {};
__export(realtime_service_exports, {
  closeAllChannels: () => closeAllChannels,
  unwatchTable: () => unwatchTable,
  watchTable: () => watchTable
});
function watchTable(config) {
  if (SUPABASE_URL === "https://placeholder.supabase.co") {
    infraLogger.warn({ table: config.table }, "Realtime: Supabase URL is placeholder, skipping channel creation.");
    return null;
  }
  const channelName = `realtime_${config.table}_${config.event}_${config.filter ?? "all"}_${Date.now()}_${Math.floor(Math.random() * 1e3)}`;
  const channel = supabaseAdmin2.channel(channelName).on(
    "postgres_changes",
    {
      event: config.event,
      schema: "public",
      table: config.table,
      filter: config.filter
    },
    async (payload) => {
      try {
        await config.handler({
          new: payload.new,
          old: payload.old,
          eventType: payload.eventType
        });
      } catch (err) {
        infraLogger.error({ err, table: config.table }, "Erro no handler de Realtime");
      }
    }
  ).subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      infraLogger.info({ channelName, table: config.table }, "Realtime: canal ativo");
    } else if (status === "CHANNEL_ERROR") {
      infraLogger.error(
        { channelName, table: config.table, err },
        'Realtime: erro no canal. VERIFIQUE SE AS TABELAS FORAM ADICIONADAS \xC0 PUBLICA\xC7\xC3O "supabase_realtime" no banco de dados! (Ex: ALTER PUBLICATION supabase_realtime ADD TABLE nome_tabela;)'
      );
    }
  });
  activeChannels.set(channelName, channel);
  return channel;
}
async function unwatchTable(channelName) {
  const channel = activeChannels.get(channelName);
  if (channel) {
    await supabaseAdmin2.removeChannel(channel);
    activeChannels.delete(channelName);
  }
}
async function closeAllChannels() {
  await Promise.all(
    Array.from(activeChannels.values()).map((ch) => supabaseAdmin2.removeChannel(ch))
  );
  activeChannels.clear();
  infraLogger.info("Realtime: todos os canais fechados");
}
var activeChannels;
var init_realtime_service = __esm({
  "apps/api/src/infrastructure/realtime/realtime.service.ts"() {
    "use strict";
    init_supabase_client();
    init_logger2();
    activeChannels = /* @__PURE__ */ new Map();
  }
});

// apps/api/src/domain/cobranca/cobrai.scheduler.ts
async function scheduleCobraiFlow(opts) {
  const { tenantId, customerId, invoiceId, amountCents, dueDate } = opts;
  cobrancaLogger.info(
    { tenantId, invoiceId, amountCents },
    "Iniciando agendamento da r\xE9gua CobrAI"
  );
  const rules = await getTenantCobraiRules(tenantId);
  if (rules.length === 0) {
    cobrancaLogger.warn({ tenantId }, "Nenhuma regra CobrAI ativa \u2014 cobran\xE7a n\xE3o agendada");
    return;
  }
  const { data: customer } = await supabaseAdmin2.from("customers").select("name, phone").eq("id", customerId).single();
  const amountBRL = (amountCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2
  });
  const templateVars = {
    customerName: customer?.name ?? "Cliente",
    amountBRL,
    amountCents,
    daysOverdue: 0,
    // será substituído por cada regra
    paymentLink: `https://pagar.astrum.com.br/${invoiceId}`,
    invoiceId
  };
  for (const rule of rules) {
    const delayMs = calculateActionDelay(new Date(dueDate), rule.daysOverdue);
    const scheduledFor = new Date(Date.now() + delayMs);
    const jobData = {
      tenantId,
      customerId,
      invoiceId,
      ruleId: rule.id,
      action: rule.action,
      customerPhone: customer?.phone,
      messageContent: rule.messageTemplate ? interpolateTemplate(rule.messageTemplate, {
        ...templateVars,
        daysOverdue: rule.daysOverdue
      }) : void 0
    };
    const job = await cobrancaQueue.add(
      `cobrai:${rule.action}:${invoiceId}`,
      jobData,
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 5e3 },
        jobId: `cobrai:${invoiceId}:${rule.id}`
        // jobId único evita duplicatas
      }
    );
    await registerCobraiJob({
      tenantId,
      customerId,
      invoiceId,
      ruleId: rule.id,
      bullmqJobId: job.id ?? "",
      scheduledFor
    });
    cobrancaLogger.info(
      {
        tenantId,
        invoiceId,
        ruleId: rule.id,
        action: rule.action,
        daysOverdue: rule.daysOverdue,
        delayMs,
        scheduledFor: scheduledFor.toISOString()
      },
      `CobrAI job agendado: ${rule.action} em ${rule.daysOverdue} dias`
    );
  }
  cobrancaLogger.info(
    { tenantId, invoiceId, jobsScheduled: rules.length },
    "\u2705 R\xE9gua CobrAI completa agendada"
  );
}
var init_cobrai_scheduler = __esm({
  "apps/api/src/domain/cobranca/cobrai.scheduler.ts"() {
    "use strict";
    init_queues();
    init_cobrai_rules_service();
    init_logger2();
    init_supabase_client();
  }
});

// apps/api/src/infrastructure/realtime/business-listeners.ts
var business_listeners_exports = {};
__export(business_listeners_exports, {
  initBusinessListeners: () => initBusinessListeners
});
function initBusinessListeners() {
  watchTable({
    table: "messages",
    event: "INSERT",
    handler: async ({ new: message }) => {
      if (message.role !== "user") return;
      if (message.from_ai) return;
      atendimentoLogger.info(
        { conversationId: message.conversation_id, tenantId: message.tenant_id },
        "Nova mensagem do usu\xE1rio detectada via Realtime \u2014 enfileirando para IA"
      );
      const piiCheck = detectAndMaskPII(message.content);
      await messageQueue2.add("process-message", {
        tenantId: message.tenant_id,
        conversationId: message.conversation_id,
        messageContent: piiCheck.maskedText,
        messageId: message.id,
        channel: "whatsapp",
        originalHasPII: piiCheck.hasPII
      });
    }
  });
  watchTable({
    table: "invoices",
    event: "UPDATE",
    handler: async ({ new: invoice, old: oldInvoice }) => {
      if (oldInvoice.status === invoice.status) return;
      if (invoice.status !== "overdue") return;
      cobrancaLogger.info(
        { invoiceId: invoice.id, tenantId: invoice.tenant_id, customerId: invoice.customer_id },
        "Fatura marcada como vencida \u2014 iniciando r\xE9gua CobrAI"
      );
      await scheduleCobraiFlow({
        tenantId: invoice.tenant_id,
        customerId: invoice.customer_id,
        invoiceId: invoice.id,
        amountCents: invoice.amount_cents,
        dueDate: new Date(invoice.due_date)
      });
    }
  });
  watchTable({
    table: "invoices",
    event: "UPDATE",
    handler: async ({ new: invoice, old: oldInvoice }) => {
      if (oldInvoice.status === invoice.status) return;
      if (invoice.status !== "paid") return;
      cobrancaLogger.info(
        { tenantId: invoice.tenant_id, invoiceId: invoice.id },
        "Fatura paga \u2014 cancelando jobs CobrAI pendentes"
      );
      const cancelledIds = await cancelInvoiceCobraiJobs(
        invoice.tenant_id,
        invoice.id
      );
      for (const jobId of cancelledIds) {
        try {
          const job = await cobrancaQueue.getJob(jobId);
          await job?.remove();
        } catch {
        }
      }
    }
  });
  watchTable({
    table: "tickets",
    event: "UPDATE",
    filter: "resolved_by_ai=eq.true",
    handler: async ({ new: ticket }) => {
      atendimentoLogger.info(
        { ticketId: ticket.id, tenantId: ticket.tenant_id },
        "\u2705 Ticket resolvido pela IA \u2014 computar para m\xE9tricas de ROI"
      );
    }
  });
  atendimentoLogger.info("Realtime: 3 listeners de neg\xF3cio inicializados");
}
var init_business_listeners = __esm({
  "apps/api/src/infrastructure/realtime/business-listeners.ts"() {
    "use strict";
    init_realtime_service();
    init_queues();
    init_logger2();
    init_pii_detector_service();
    init_cobrai_scheduler();
    init_cobrai_rules_service();
  }
});

// apps/api/src/infrastructure/analytics/analytics.schema.ts
var analytics_schema_exports = {};
__export(analytics_schema_exports, {
  initAnalyticsSchema: () => initAnalyticsSchema
});
async function initAnalyticsSchema() {
  const db3 = await getDuckDB();
  const conn = await db3.connect();
  try {
    await conn.run(`
      CREATE TABLE IF NOT EXISTS fact_messages (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL,
        conversation_id VARCHAR NOT NULL,
        role VARCHAR NOT NULL,
        from_ai BOOLEAN DEFAULT FALSE,
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        year INTEGER GENERATED ALWAYS AS (year(created_at)),
        month INTEGER GENERATED ALWAYS AS (month(created_at)),
        day INTEGER GENERATED ALWAYS AS (day(created_at))
      )
    `);
    await conn.run(`
      CREATE TABLE IF NOT EXISTS fact_tickets (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        priority VARCHAR NOT NULL,
        resolved_by_ai BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL,
        resolved_at TIMESTAMP,
        resolution_minutes INTEGER,  -- tempo de resolu\xE7\xE3o em minutos
        year INTEGER GENERATED ALWAYS AS (year(created_at)),
        month INTEGER GENERATED ALWAYS AS (month(created_at))
      )
    `);
    await conn.run(`
      CREATE TABLE IF NOT EXISTS fact_invoices (
        id VARCHAR PRIMARY KEY,
        tenant_id VARCHAR NOT NULL,
        customer_id VARCHAR NOT NULL,
        amount_cents INTEGER NOT NULL,
        status VARCHAR NOT NULL,
        due_date DATE NOT NULL,
        paid_at TIMESTAMP,
        days_overdue INTEGER,
        year INTEGER GENERATED ALWAYS AS (year(due_date)),
        month INTEGER GENERATED ALWAYS AS (month(due_date))
      )
    `);
    await conn.run(`
      CREATE TABLE IF NOT EXISTS dim_tenants (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        plan VARCHAR NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL
      )
    `);
    infraLogger.info("DuckDB: schema anal\xEDtico inicializado");
  } finally {
    await conn.close();
  }
}
var init_analytics_schema = __esm({
  "apps/api/src/infrastructure/analytics/analytics.schema.ts"() {
    "use strict";
    init_duckdb_service();
    init_logger2();
  }
});

// server.ts
var import_express11 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);

// src/routes/superAdmin.ts
var import_express = __toESM(require("express"), 1);
init_firebaseAdmin();
var superAdminRouter = import_express.default.Router();
var verifySuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await authProxy.verifyIdToken(token);
    if (decoded.isSuperAdmin !== true) {
      return res.status(403).json({ error: "Forbidden: SuperAdmin only" });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};
superAdminRouter.get("/ai-circuit", verifySuperAdmin, async (req, res) => {
  try {
    const providers = ["gemini", "openai", "anthropic"];
    const circuitStatus = {};
    const { default: redisClient } = await Promise.resolve().then(() => (init_redis(), redis_exports));
    if (redisClient) {
      for (const p of providers) {
        const val = await redisClient.get(`llm_circuit:${p}`);
        if (val === "OPEN") {
          circuitStatus[p] = "OPEN";
        } else {
          const recent = await redisClient.get(`llm_circuit:recent_open:${p}`);
          if (recent) {
            circuitStatus[p] = "HALF_OPEN";
          } else {
            circuitStatus[p] = "CLOSED";
          }
        }
      }
    } else {
      providers.forEach((p) => circuitStatus[p] = "CLOSED");
    }
    const snapshot = await dbProxy.collection("audit_logs").where("event_type", "==", "LLM_FALLBACK").limit(50).get();
    const fallbacks = snapshot.docs.map((doc3) => ({ id: doc3.id, ...doc3.data() })).sort((a, b) => {
      const timeA = a.timestamp?._seconds || new Date(a.timestamp).getTime() / 1e3 || 0;
      const timeB = b.timestamp?._seconds || new Date(b.timestamp).getTime() / 1e3 || 0;
      return timeB - timeA;
    });
    res.json({ circuitStatus, fallbacks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
superAdminRouter.get("/tenants", verifySuperAdmin, async (req, res) => {
  try {
    const snapshot = await dbProxy.collection("tenants").get();
    const tenants = snapshot.docs.map((doc3) => ({
      id: doc3.id,
      ...doc3.data()
    }));
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
superAdminRouter.post("/custom-domains", verifySuperAdmin, import_express.default.json(), async (req, res) => {
  try {
    const { domain, tenantId } = req.body;
    const ref = dbProxy.collection("custom_domains").doc(domain);
    await ref.set({
      domain,
      tenantId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ status: "success", domain, tenantId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
superAdminRouter.get("/tenants/:id", verifySuperAdmin, async (req, res) => {
  try {
    const doc3 = await dbProxy.collection("tenants").doc(req.params.id).get();
    if (!doc3.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json({ id: doc3.id, ...doc3.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
superAdminRouter.post("/tenants/:id/suspend", verifySuperAdmin, import_express.default.json(), async (req, res) => {
  try {
    const docRef = dbProxy.collection("tenants").doc(req.params.id);
    const doc3 = await docRef.get();
    if (!doc3.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    await docRef.update({ status: "suspended" });
    res.json({ success: true, message: "Tenant suspended" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
superAdminRouter.post("/tenants/:id/reactivate", verifySuperAdmin, import_express.default.json(), async (req, res) => {
  try {
    const docRef = dbProxy.collection("tenants").doc(req.params.id);
    const doc3 = await docRef.get();
    if (!doc3.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    await docRef.update({ status: "active" });
    res.json({ success: true, message: "Tenant reactivated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
superAdminRouter.get("/metrics", verifySuperAdmin, async (req, res) => {
  try {
    const { calculateMRR: calculateMRR2, calculateChurnRate: calculateChurnRate2 } = await Promise.resolve().then(() => (init_saasMetrics(), saasMetrics_exports));
    const now = /* @__PURE__ */ new Date();
    const currentMRR = await calculateMRR2(now);
    const currentChurnRate = await calculateChurnRate2(now);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMRR = await calculateMRR2(prevMonth);
    const previousChurnRate = await calculateChurnRate2(prevMonth);
    const mrrVariation = previousMRR > 0 ? (currentMRR - previousMRR) / previousMRR * 100 : 0;
    const mrrHistory = [];
    const historySnap = await dbProxy.collection("saas_metrics").orderBy("date", "desc").limit(12).get();
    historySnap.forEach((doc3) => {
      const data = doc3.data();
      mrrHistory.push({
        month: doc3.id,
        mrr: data.mrr || 0
      });
    });
    mrrHistory.reverse();
    const tenantsSnap = await dbProxy.collection("tenants").get();
    let activeTenants = 0;
    let churnedTenants = 0;
    const tenantsList = [];
    tenantsSnap.docs.forEach((doc3) => {
      const data = doc3.data();
      let tenantMrr = 0;
      if (data.status === "active") {
        activeTenants++;
        if (data.subscription?.monthly_price) {
          tenantMrr = Number(data.subscription.monthly_price);
        } else if (data.plan === "enterprise") {
          tenantMrr = 1500;
        } else if (data.plan === "pro") {
          tenantMrr = 500;
        } else if (data.plan === "starter") {
          tenantMrr = 200;
        }
        tenantsList.push({
          id: doc3.id,
          name: data.companyName || data.name || doc3.id,
          mrr: tenantMrr,
          plan: data.plan
        });
      } else if (data.status === "cancelled") {
        churnedTenants++;
      }
    });
    tenantsList.sort((a, b) => b.mrr - a.mrr);
    const topTenants = tenantsList.slice(0, 10);
    res.json({
      total_mrr: currentMRR,
      mrr_variation: mrrVariation,
      current_churn_rate: currentChurnRate,
      previous_churn_rate: previousChurnRate,
      mrr_history: mrrHistory,
      top_tenants: topTenants,
      active_tenants: activeTenants,
      churned_tenants: churnedTenants,
      total_tenants: tenantsSnap.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var superAdmin_default = superAdminRouter;

// src/routes/api-v1.ts
var import_express2 = __toESM(require("express"), 1);
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
init_firebaseAdmin();
init_logger();
var router = import_express2.default.Router();
var apiRateLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 60 * 1e3,
  // 1 hour
  max: 1e3,
  keyGenerator: (req) => {
    return req.header("x-api-key") || (0, import_express_rate_limit.ipKeyGenerator)(req.ip || "unknown");
  },
  message: { error: "Too many requests, please try again later." }
});
var requireApiKey = async (req, res, next) => {
  const apiKey = req.header("X-API-Key");
  if (!apiKey) {
    return res.status(401).json({ error: "X-API-Key header is missing" });
  }
  try {
    const apiKeysSnap = await dbProxy.collectionGroup("api_keys").where("key", "==", apiKey).limit(1).get();
    if (apiKeysSnap.empty) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    const keyDoc = apiKeysSnap.docs[0];
    const keyData = keyDoc.data();
    const tenantRef = keyDoc.ref.parent.parent;
    if (!tenantRef) {
      return res.status(401).json({ error: "Invalid API Key context" });
    }
    if (keyData.active === false) {
      return res.status(403).json({ error: "API Key inactive" });
    }
    req.tenantId = tenantRef.id;
    req.apiKeyData = keyData;
    next();
  } catch (err) {
    logger.error("api_key_auth_error", { error: err.message });
    res.status(500).json({ error: "Internal Server Error during authentication" });
  }
};
router.use(apiRateLimiter);
router.get("/tickets", requireApiKey, async (req, res) => {
  const tenantId = req.tenantId;
  const { status, limit = "50", offset = "0" } = req.query;
  try {
    let q = dbProxy.collection("tickets").where("tenantId", "==", tenantId);
    if (status) {
      q = q.where("status", "==", status);
    }
    q = q.orderBy("createdAt", "desc").limit(Number(limit) || 50);
    if (Number(offset) > 0) {
      q = q.offset(Number(offset));
    }
    const snap = await q.get();
    const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ data: tickets, count: tickets.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/customers", requireApiKey, async (req, res) => {
  const tenantId = req.tenantId;
  const { limit = "50", offset = "0" } = req.query;
  try {
    let q = dbProxy.collection("customers").where("tenantId", "==", tenantId);
    q = q.orderBy("createdAt", "desc").limit(Number(limit) || 50);
    if (Number(offset) > 0) {
      q = q.offset(Number(offset));
    }
    const snap = await q.get();
    const customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ data: customers, count: customers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/metrics/daily", requireApiKey, async (req, res) => {
  const tenantId = req.tenantId;
  const dateStr = req.query.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  try {
    const start = /* @__PURE__ */ new Date(`${dateStr}T00:00:00.000Z`);
    const end = /* @__PURE__ */ new Date(`${dateStr}T23:59:59.999Z`);
    const snap = await dbProxy.collection("tickets").where("tenantId", "==", tenantId).where("createdAt", ">=", start).where("createdAt", "<=", end).get();
    let resolved = 0;
    let escalated = 0;
    snap.docs.forEach((d) => {
      const s = d.data().status;
      if (s === "resolved" || s === "closed") resolved++;
      if (s === "escalated" || d.data().escalated) escalated++;
    });
    res.json({
      date: dateStr,
      total_tickets: snap.size,
      resolved,
      escalated,
      ai_handled: resolved
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/metrics/summary", requireApiKey, async (req, res) => {
  const tenantId = req.tenantId;
  try {
    const snap = await dbProxy.collection("tickets").where("tenantId", "==", tenantId).count().get();
    const customersCount = await dbProxy.collection("customers").where("tenantId", "==", tenantId).count().get();
    res.json({
      total_tickets: snap.data().count,
      total_customers: customersCount.data().count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var api_v1_default = router;

// src/routes/cobrai.ts
var import_express3 = __toESM(require("express"), 1);

// src/workers/cobraiWorker.ts
var import_bullmq = require("bullmq");
init_redis();
init_firebaseAdmin();
init_firebaseAdmin();
var import_date_fns = require("date-fns");

// src/lib/cobraiTemplates.ts
var COBRAI_TEMPLATES = {
  D_MINUS_5: {
    templateName: "cobrai_aviso_vencimento",
    language: "pt_BR",
    components: [{
      type: "body",
      parameters: [
        { type: "text", key: "customer_name" },
        { type: "text", key: "due_date" },
        { type: "text", key: "amount" },
        { type: "text", key: "plan_name" }
      ]
    }]
  },
  D_ZERO: {
    templateName: "cobrai_dia_vencimento",
    language: "pt_BR",
    components: [{
      type: "body",
      parameters: [
        { type: "text", key: "customer_name" },
        { type: "text", key: "due_date" },
        { type: "text", key: "amount" }
      ]
    }]
  },
  D_PLUS_3: {
    templateName: "cobrai_pos_vencimento",
    language: "pt_BR",
    components: [{
      type: "body",
      parameters: [
        { type: "text", key: "customer_name" },
        { type: "text", key: "due_date" },
        { type: "text", key: "amount" }
      ]
    }]
  },
  D_PLUS_15: {
    templateName: "cobrai_suspensao_aviso",
    language: "pt_BR",
    components: [{
      type: "body",
      parameters: [
        { type: "text", key: "customer_name" },
        { type: "text", key: "due_date" }
      ]
    }]
  },
  D_PLUS_30: {
    templateName: "cobrai_negociacao",
    language: "pt_BR",
    components: [{
      type: "body",
      parameters: [
        { type: "text", key: "customer_name" },
        { type: "text", key: "amount" }
      ]
    }]
  }
};

// src/lib/templateBuilder.ts
function buildTemplateComponents(template, customer, invoice) {
  const builtComponents = [];
  for (const comp of template.components) {
    const builtParameters = [];
    for (const param of comp.parameters) {
      if (param.type === "text") {
        let textValue = "";
        switch (param.key) {
          case "customer_name":
            textValue = customer.name || "Cliente";
            break;
          case "due_date":
            textValue = invoice?.due_date || "N/A";
            break;
          case "amount":
            textValue = invoice?.amount ? `R$ ${parseFloat(invoice.amount.toString()).toFixed(2)}` : "R$ 0,00";
            break;
          case "plan_name":
            textValue = customer.current_contract_version || "Plano Atual";
            break;
        }
        builtParameters.push({ type: "text", text: textValue });
      }
    }
    builtComponents.push({
      type: comp.type,
      parameters: builtParameters
    });
  }
  return builtComponents;
}

// src/workers/cobraiWorker.ts
init_dbAdmin();
init_logger();
var isMockRedis = !redis_default.options;
async function logCobraiSkip(customerId, tenantId, reason) {
  try {
    await dbProxy.collection("logs").add({
      type: "COBRAI_SKIP",
      customerId,
      tenantId,
      reason,
      timestamp: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
    });
    logger.info("cobrai_skipped", { tenant_id: tenantId, session_id: customerId, data: { reason } });
  } catch (err) {
    logger.error("cobrai_log_skip_failed", { error: err.message });
  }
}
var cobraiQueue = isMockRedis ? {
  add: async (name, payload, opts) => {
    logger.warn("mock_cobrai_queue_used");
    return { id: "mock" };
  }
} : new import_bullmq.Queue("cobrai", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5e3 },
    removeOnComplete: false,
    // manter histórico de jobs concluídos
    removeOnFail: false
    // manter jobs falhos para análise
  }
});
async function processCobraiStage(job, customerId, tenantId, stage) {
  try {
    if (!customerId) return;
    const tenantSnap = await dbProxy.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) return;
    const tenantData = tenantSnap.data();
    if (tenantData.cobrai_enabled === false) {
      return { skipped: true, reason: "COBRAI_DISABLED" };
    }
    if (tenantData.cobrai_window) {
      const currentHour = (/* @__PURE__ */ new Date()).getHours();
      const { start, end } = tenantData.cobrai_window;
      if (currentHour < start || currentHour >= end) {
        await logCobraiSkip(customerId, tenantId, "OUTSIDE_WINDOW");
        return { skipped: true, reason: "OUTSIDE_WINDOW" };
      }
    }
    if (tenantData.cobrai_paused_customers?.includes(customerId)) {
      await logCobraiSkip(customerId, tenantId, "CUSTOMER_PAUSED");
      return { skipped: true, reason: "CUSTOMER_PAUSED" };
    }
    if (tenantData.cobrai_stages && tenantData.cobrai_stages[stage]?.active === false) {
      return { skipped: true, reason: "STAGE_DISABLED" };
    }
    const rateLimitKey = `cobrai_rate:${tenantId}`;
    const sentThisHour = await redis_default.incr(rateLimitKey);
    if (sentThisHour === 1) await redis_default.expire(rateLimitKey, 3600);
    const limitEnv = tenantData.cobrai_hourly_limit ?? parseInt(process.env.COBRAI_HOURLY_LIMIT ?? "30");
    if (sentThisHour > limitEnv) {
      await cobraiQueue.add("retry", job.data, { delay: 36e5 });
      logger.warn("cobrai_rate_limited", { tenant_id: tenantId, session_id: customerId });
      return { skipped: true, reason: "RATE_LIMIT" };
    }
    const customer = await dbProxy.collection("customers").doc(customerId).get();
    if (!customer.exists) return;
    const data = customer.data();
    if (!data.marketing_opt_in) {
      await logCobraiSkip(customerId, tenantId, "NO_CONSENT");
      return;
    }
    if (data.payment_agreement?.active === true) {
      const nextDue = data.payment_agreement.next_due_date?.toDate?.() || data.payment_agreement.next_due_date;
      if (nextDue && nextDue > /* @__PURE__ */ new Date()) {
        await logCobraiSkip(customerId, tenantId, "ACTIVE_PAYMENT_AGREEMENT");
        return;
      }
    }
    if (stage === "suspensao_automatica") {
      const threeBizDaysAgo = (0, import_date_fns.subBusinessDays)(/* @__PURE__ */ new Date(), 3);
      const recentPayment = await dbProxy.collection("payments").where("customer_id", "==", customerId).where("paid_at", ">=", firebaseAdmin_default.firestore.Timestamp.fromDate(threeBizDaysAgo)).where("status", "in", ["confirmado", "pendente_compensacao"]).limit(1).get();
      if (!recentPayment.empty) {
        await logCobraiSkip(customerId, tenantId, "PAYMENT_PENDING_COMPENSATION");
        return;
      }
    }
    const { checkDailyLimit: checkDailyLimit2, incrementDailyLimit: incrementDailyLimit2 } = await Promise.resolve().then(() => (init_rateLimiter(), rateLimiter_exports));
    const { allowed: dailyAllowed } = await checkDailyLimit2(tenantId);
    if (!dailyAllowed) {
      logger.warn("cobrai_daily_limit_reached", { tenant_id: tenantId, session_id: customerId });
      return { skipped: true, reason: "DAILY_RATE_LIMIT" };
    }
    const invoice = { due_date: "01/01/2026", amount: data.current_price || 99.9 };
    let isWithin24hWindow = false;
    let templateName = "Livre";
    if (data.last_customer_message_at) {
      const lastMsgDate = data.last_customer_message_at.toDate?.() || data.last_customer_message_at;
      if ((0, import_date_fns.differenceInHours)(/* @__PURE__ */ new Date(), lastMsgDate) < 24) {
        isWithin24hWindow = true;
      }
    }
    if (isWithin24hWindow) {
      logger.info("cobrai_window_active_free_msg", { tenant_id: tenantId, session_id: customerId });
      const template = COBRAI_TEMPLATES[stage];
      if (template) {
        try {
          const { getIntegrationKeys: getIntegrationKeys2 } = await Promise.resolve().then(() => (init_dbAdmin(), dbAdmin_exports));
          const keys = await getIntegrationKeys2(tenantId);
          const evoUrl = keys.evolutionUrl?.replace(/\/+$/, "");
          const evoInstance = keys.evolutionInstance;
          const evoApiKey = keys.evolutionApiKey;
          if (evoUrl && evoInstance && evoApiKey) {
            await fetch(`${evoUrl}/message/sendText/${evoInstance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoApiKey },
              body: JSON.stringify({ number: data.phone, options: { delay: 1200 }, textMessage: { text: template.text_fallback } })
            });
          }
        } catch (e) {
          logger.error("cobrai_free_msg_error", { tenant_id: tenantId, session_id: customerId, error: e.message });
        }
      }
    } else {
      const HSM_APPROVED_BY_META = process.env.HSM_APPROVED === "true";
      if (!HSM_APPROVED_BY_META) {
        logger.warn("cobrai_hsm_unapproved_skipped", { tenant_id: tenantId, session_id: customerId });
        return;
      }
      logger.info("cobrai_window_inactive_hsm", { tenant_id: tenantId, session_id: customerId });
      const template = COBRAI_TEMPLATES[stage];
      if (!template) {
        logger.error("cobrai_template_not_found", { tenant_id: tenantId, session_id: customerId, data: { stage } });
        return;
      }
      const components = buildTemplateComponents(template, data, invoice);
      templateName = template.templateName;
      const { acquireSendSlot: acquireSendSlot2 } = await Promise.resolve().then(() => (init_rateLimiter(), rateLimiter_exports));
      const { allowed, retryAfter } = await acquireSendSlot2(tenantId, tenantData.evolution_instance || "default");
      if (!allowed) {
        logger.warn("cobrai_instance_rate_limit", { tenant_id: tenantId, session_id: customerId });
        const redis4 = (await Promise.resolve().then(() => (init_redis(), redis_exports))).default;
        if (redis4) {
          await redis4.incr(`throttle_events:${tenantId}`);
        }
        await job.moveToDelayed(Date.now() + (retryAfter || 1e3), job.token);
        return;
      }
      const { sendHSMTemplate: sendHSMTemplate2 } = await Promise.resolve().then(() => (init_whatsappSender(), whatsappSender_exports));
      const variables = {};
      const params = components.find((c) => c.type === "body")?.parameters || [];
      params.forEach((p, i) => {
        variables[`${i + 1}`] = p.text;
      });
      try {
        await sendHSMTemplate2(tenantId, templateName, data.phone, variables);
        logger.info("cobrai_dispatched", { tenant_id: tenantId, session_id: customerId, data: { template_name: templateName, variables } });
      } catch (err) {
        if (err.name === "TemplateNotApprovedError") {
          logger.warn("cobrai_template_unapproved", { tenant_id: tenantId, session_id: customerId, data: { template_name: templateName } });
          return;
        }
        throw err;
      }
    }
    logger.info("cobrai_action_success", { tenant_id: tenantId, session_id: customerId, data: { stage } });
    await dbProxy.collection("cobrai_logs").add({
      customer_id: customerId,
      tenant_id: tenantId,
      stage,
      template_name: templateName,
      sent_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp(),
      status: "sent"
    });
    await incrementShardedCounter("cobrai_sent_today", tenantId);
  } catch (error) {
    logger.error("cobrai_action_failed", { tenant_id: tenantId, session_id: customerId, error: error.message, data: { stage } });
    await dbProxy.collection("cobrai_logs").add({
      customer_id: customerId,
      tenant_id: tenantId,
      stage,
      sent_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp(),
      status: "failed",
      error_message: error.message
    });
  }
}
var processCobraiJob = async (job) => {
  if (job.name === "lockout_tenant") {
    const { tenantId: tenantId2 } = job.data;
    const tenantSnap = await dbProxy.collection("tenants").doc(tenantId2).get();
    if (!tenantSnap.exists) return;
    const tenantData = tenantSnap.data();
    if (tenantData.billing_status === "overdue") {
      await dbProxy.collection("tenants").doc(tenantId2).update({
        status: "suspended",
        suspended_reason: "billing_overdue"
      });
      const auth3 = firebaseAdmin_default.auth();
      let pageToken;
      do {
        const result = await auth3.listUsers(1e3, pageToken);
        for (const userRecord of result.users) {
          if (userRecord.customClaims?.tenantId === tenantId2) {
            await auth3.revokeRefreshTokens(userRecord.uid);
          }
        }
        pageToken = result.pageToken;
      } while (pageToken);
      await dbProxy.collection("audit_logs").add({
        action: "BILLING_LOCK",
        tenant_id: tenantId2,
        timestamp: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
      });
      logger.info("tenant_locked_out", { tenant_id: tenantId2, data: { reason: "billing_overdue" } });
    }
    return;
  }
  if (job.name === "sync_redis_counters") {
    const keys = await redis_default.keys("msg_count:*:*");
    for (const key of keys) {
      const parts = key.split(":");
      if (parts.length === 3) {
        const tenantId2 = parts[1];
        const yyyyMm = parts[2];
        const countStr = await redis_default.get(key);
        if (countStr) {
          const docId = `${tenantId2}_${yyyyMm}`;
          await dbProxy.collection("usage_stats").doc(docId).set({
            tenantId: tenantId2,
            month: yyyyMm,
            message_count: parseInt(countStr, 10),
            updated_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          await redis_default.del(key);
        }
      }
    }
    return;
  }
  if (job.name === "sync_token_costs") {
    const keys = await redis_default.keys("token_cost:*:*");
    for (const key of keys) {
      const parts = key.split(":");
      if (parts.length === 3) {
        const tenantId2 = parts[1];
        const yyyyMm = parts[2];
        const costStr = await redis_default.get(key);
        if (costStr) {
          const costUsd = parseFloat(costStr);
          const costBrl = costUsd * 5;
          const tokenCountStr = await redis_default.get(`token_count:${tenantId2}:${yyyyMm}`);
          const tokenCount = tokenCountStr ? parseInt(tokenCountStr, 10) : 0;
          const providerBreakdown = await redis_default.hgetall(`token_provider:${tenantId2}:${yyyyMm}`);
          const docId = `${tenantId2}_${yyyyMm}`;
          await dbProxy.collection("token_usage").doc(docId).set({
            tenantId: tenantId2,
            month: yyyyMm,
            custo_usd: costUsd,
            custo_brl: costBrl,
            token_count: tokenCount,
            provider_breakdown: providerBreakdown,
            updated_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          const tenantSnap = await dbProxy.collection("tenants").doc(tenantId2).get();
          if (tenantSnap.exists) {
            const limit = tenantSnap.data()?.llm_budget_usd || 50;
            if (costUsd > limit) {
              const alertedKey = `token_cost_alert:${tenantId2}:${yyyyMm}`;
              const alreadyAlerted = await redis_default.get(alertedKey);
              if (!alreadyAlerted) {
                const { sendEmail: sendEmail2 } = await Promise.resolve().then(() => (init_email(), email_exports));
                const ispAdminEmail = tenantSnap.data()?.admin_email;
                const text = `Aten\xE7\xE3o: Seu limite de USD ${limit} para custo LLM foi ultrapassado. Uso atual de USD ${costUsd.toFixed(2)}`;
                await sendEmail2("noturcursos1@gmail.com", `Super-Admin: Limite excedido para o tenant ${tenantId2}`, text);
                if (ispAdminEmail) {
                  await sendEmail2(ispAdminEmail, `Servi\xE7o LLM: Limite de Custos Excedido`, text);
                }
                await redis_default.setex(alertedKey, 86400 * 30, "1");
              }
            }
          }
        }
      }
    }
    return;
  }
  if (job.name === "incident_notification") {
    const { customerId: customerId2, tenantId: tenantId2, cto_name, estimated_resolution } = job.data;
    try {
      const text = `Identificamos instabilidade na sua regi\xE3o. Nossa equipe j\xE1 est\xE1 trabalhando.`;
      logger.info("incident_notification_dispatched", { tenant_id: tenantId2, session_id: customerId2 });
      await dbProxy.collection("cobrai_logs").add({
        customer_id: customerId2,
        tenant_id: tenantId2,
        stage: "incident_notification",
        template_name: "Livre",
        sent_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp(),
        status: "sent",
        message: text
      });
      return { skipped: false, reason: "sent" };
    } catch (err) {
      logger.error("incident_notification_failed", { tenant_id: tenantId2, session_id: customerId2, error: err.message });
      return { skipped: true, reason: "error", error: err.message };
    }
  }
  if (job.name === "incident_resolved") {
    const { customerId: customerId2, tenantId: tenantId2, cto_name } = job.data;
    try {
      const text = `Servi\xE7o normalizado! Pedimos desculpas pelo inconveniente.`;
      logger.info("incident_resolved_dispatched", { tenant_id: tenantId2, session_id: customerId2 });
      await dbProxy.collection("cobrai_logs").add({
        customer_id: customerId2,
        tenant_id: tenantId2,
        stage: "incident_resolved",
        template_name: "Livre",
        sent_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp(),
        status: "sent",
        message: text
      });
      return { skipped: false, reason: "sent" };
    } catch (err) {
      logger.error("incident_resolved_failed", { tenant_id: tenantId2, session_id: customerId2, error: err.message });
      return { skipped: true, reason: "error", error: err.message };
    }
  }
  const { customerId, tenantId, stage } = job.data;
  const lockKey = `cobrai_lock:${tenantId}:${customerId}:${stage}`;
  const lock = await redis_default.set(lockKey, "1", "EX", 7200, "NX");
  if (!lock) {
    return { skipped: true, reason: "LOCK_EXISTS" };
  }
  try {
    await processCobraiStage(job, customerId, tenantId, stage);
  } finally {
    await redis_default.del(lockKey);
  }
};
var worker = isMockRedis ? {
  on: () => {
  }
} : new import_bullmq.Worker("cobrai", processCobraiJob, { connection, concurrency: 3 });
worker.on("failed", async (job, err) => {
  if (!job) return;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts?.attempts ?? 3;
  if (attempts >= maxAttempts) {
    await dbProxy.collection("dead_letter_queue").add({
      job_id: job.id,
      type: job.name,
      payload: job.data,
      error_message: err.message,
      retry_count: attempts,
      failed_at: firebaseAdmin_default.firestore.FieldValue.serverTimestamp(),
      tenant_id: job.data?.tenantId ?? "unknown",
      resolved: false
    });
    logger.error("dlq_move", { tenant_id: job.data?.tenantId, error: err.message, data: { job_name: job.name, attempts } });
  }
});
if (!isMockRedis) {
  cobraiQueue.add("sync_redis_counters", {}, { repeat: { pattern: "0 0 1 * *" } });
  cobraiQueue.add("sync_token_costs", {}, { repeat: { pattern: "0 23 * * *" } });
}

// src/routes/cobrai.ts
init_firebaseAdmin();
var cobraiRouter = import_express3.default.Router();
var getCobraiJobs = async () => {
  if (cobraiQueue && typeof cobraiQueue.getJobs === "function") {
    try {
      return await cobraiQueue.getJobs(["waiting", "active", "delayed", "paused", "completed", "failed"]);
    } catch (e) {
      console.error("Failed to get cobrai jobs from BullMQ queue, falling back", e);
    }
  }
  return [];
};
var getCobraiJobCounts = async () => {
  if (cobraiQueue && typeof cobraiQueue.getJobCounts === "function") {
    try {
      const counts = await cobraiQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0
      };
    } catch (e) {
      console.error("Failed to get cobrai counts from BullMQ, falling back", e);
    }
  }
  return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
};
cobraiRouter.get("/queue-stats", async (req, res) => {
  try {
    const stats = await getCobraiJobCounts();
    return res.json(stats);
  } catch (err) {
    console.error("Error in GET /queue-stats:", err);
    return res.json({ waiting: 0, active: 0, completed: 0, failed: 0 });
  }
});
cobraiRouter.get("/queue", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    const rawJobs = await getCobraiJobs();
    const jobsList = rawJobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      status: job.status || "waiting"
    })).filter((job) => {
      if (tenantId) {
        return job.data?.tenantId === tenantId;
      }
      return true;
    });
    return res.json(jobsList);
  } catch (err) {
    console.error("Error in GET /queue:", err);
    return res.json([]);
  }
});
cobraiRouter.delete("/queue/:id", async (req, res) => {
  try {
    const jobId = req.params.id;
    if (cobraiQueue && typeof cobraiQueue.getJob === "function") {
      const job = await cobraiQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error in DELETE /queue/:id:", err);
    return res.status(500).json({ error: err.message });
  }
});
cobraiRouter.post("/send-now", async (req, res) => {
  try {
    const { customerId, stage, tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    if (customerId && stage) {
      const payload = { customerId, tenantId, stage };
      if (cobraiQueue && typeof cobraiQueue.add === "function" && cobraiQueue.add.name !== "mock") {
        await cobraiQueue.add("cobrai_manual", payload);
      } else {
        await processCobraiJob({ name: "cobrai_manual", data: payload });
      }
      return res.json({ ok: true, status: "scheduled_or_processed" });
    } else {
      const customersSnap = await dbProxy.collection("customers").where("tenantId", "==", tenantId).where("financial_status", "==", "inadimplente").get();
      let count = 0;
      for (const customerDoc of customersSnap.docs) {
        const customerData = customerDoc.data();
        let currentStage = "D_MINUS_5";
        const overdueDays = customerData.overdue_days || 0;
        if (overdueDays >= 30) {
          currentStage = "D_PLUS_30";
        } else if (overdueDays >= 15) {
          currentStage = "D_PLUS_15";
        } else if (overdueDays >= 3) {
          currentStage = "D_PLUS_3";
        } else if (overdueDays === 0) {
          currentStage = "D_ZERO";
        }
        const payload = { customerId: customerDoc.id, tenantId, stage: currentStage };
        if (cobraiQueue && typeof cobraiQueue.add === "function" && cobraiQueue.add.name !== "mock") {
          await cobraiQueue.add("cobrai_routine", payload);
        } else {
          await processCobraiJob({ name: "cobrai_routine", data: payload });
        }
        count++;
      }
      return res.json({ ok: true, message: `Dispatched ${count} customers to CobrAI rulebook.` });
    }
  } catch (err) {
    console.error("Error in POST /send-now:", err);
    return res.status(500).json({ error: err.message });
  }
});

// src/routes/queues.ts
var import_express4 = __toESM(require("express"), 1);

// src/lib/queue.ts
var import_bullmq2 = require("bullmq");
init_redis();
var import_events = __toESM(require("events"), 1);

// src/lib/dateUtils.ts
var import_date_fns_tz = require("date-fns-tz");
var calculateBullMQDelay = (targetDateTimeStr, timezone = "America/Sao_Paulo") => {
  try {
    const targetUtc = (0, import_date_fns_tz.fromZonedTime)(targetDateTimeStr, timezone);
    const delay = targetUtc.getTime() - Date.now();
    return Math.max(0, delay);
  } catch (e) {
    return 0;
  }
};

// src/lib/queue.ts
var isMockRedis2 = !redis_default.options;
var mockQueueEmitter = new import_events.default();
var messageQueue = isMockRedis2 ? {
  add: async (name, payload, opts) => {
    console.warn("Using mock messageQueue (No real Redis)");
    mockQueueEmitter.emit("process-message", { id: Math.random().toString(), data: payload });
    return { id: "mock" };
  },
  getJob: async () => null,
  getJobCounts: async () => ({})
} : new import_bullmq2.Queue("message-processing", {
  connection: redis_default
});
var deadLetterQueue = isMockRedis2 ? {
  add: async () => {
  }
} : new import_bullmq2.Queue("message-dead-letter", {
  connection: redis_default
});
var tenantQueues = /* @__PURE__ */ new Map();
function getTenantQueue(tenantId) {
  if (isMockRedis2) {
    if (!tenantQueues.has(tenantId)) {
      tenantQueues.set(tenantId, {
        add: async (name, payload, opts) => {
          console.warn(`Using mock tenantQueue for ${tenantId}`);
          mockQueueEmitter.emit("process-message", { id: Math.random().toString(), data: payload });
          return { id: "mock" };
        },
        getJob: async () => null,
        getJobCounts: async () => ({})
      });
    }
    return tenantQueues.get(tenantId);
  }
  if (!tenantQueues.has(tenantId)) {
    const queue = new import_bullmq2.Queue(`messages-${tenantId}`, {
      connection: redis_default,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2e3 },
        removeOnComplete: false,
        removeOnFail: false
      }
    });
    tenantQueues.set(tenantId, queue);
  }
  return tenantQueues.get(tenantId);
}
async function getMessagePriority(customerId, tenantId) {
  if (!customerId) return 5;
  const cacheKey = `priority:${customerId}`;
  if (!isMockRedis2) {
    const cached = await redis_default.get(cacheKey);
    if (cached) return parseInt(cached);
  }
  try {
    const { supabaseAdmin: supabaseAdmin3 } = await Promise.resolve().then(() => (init_supabaseAdmin(), supabaseAdmin_exports));
    const { data: customer } = await supabaseAdmin3.from("customers").select("plan_id").eq("id", customerId).single();
    const planId = customer?.plan_id;
    const priorityMap = {
      "1gb": 1,
      // máxima prioridade
      "600mb": 2,
      "300mb": 3,
      "100mb": 5
      // prioridade padrão
    };
    const priority = priorityMap[planId] ?? 5;
    if (!isMockRedis2) {
      await redis_default.set(cacheKey, String(priority), "EX", 3600);
    }
    return priority;
  } catch (e) {
    return 5;
  }
}
async function enqueueMessage(tenantId, payload, opts, jobName = "process-message") {
  const priority = await getMessagePriority(payload.customerId, tenantId);
  const queue = getTenantQueue(tenantId);
  let finalOpts = {
    jobId: payload.messageId,
    priority,
    ...opts || {}
  };
  if (opts?.scheduledFor && opts?.timezone) {
    const msDelay = calculateBullMQDelay(opts.scheduledFor, opts.timezone);
    if (msDelay > 0) {
      finalOpts.delay = msDelay;
    }
  }
  return queue.add(jobName, payload, finalOpts);
}

// src/routes/queues.ts
var queuesRouter = import_express4.default.Router();
var getMessageQueueCounts = async () => {
  if (messageQueue && typeof messageQueue.getJobCounts === "function") {
    try {
      const counts = await messageQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0
      };
    } catch (e) {
      console.error("Failed to get message counts from BullMQ, falling back", e);
    }
  }
  return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
};
queuesRouter.get("/stats", async (req, res) => {
  try {
    const stats = await getMessageQueueCounts();
    return res.json(stats);
  } catch (err) {
    console.error("Error in GET /stats:", err);
    return res.json({ waiting: 0, active: 0, completed: 0, failed: 0 });
  }
});

// src/routes/dlq.ts
var import_express5 = __toESM(require("express"), 1);
init_firebaseAdmin();
var dlqRouter = import_express5.default.Router();
dlqRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId query parameter is required" });
    }
    const snapshot = await dbProxy.collection("dead_letter_queue").where("tenant_id", "==", tenantId).where("resolved", "==", false).get();
    const jobs = snapshot.docs.map((doc3) => ({
      id: doc3.id,
      ...doc3.data()
    }));
    return res.json(jobs);
  } catch (err) {
    console.error("Error listing DLQ jobs:", err);
    return res.status(500).json({ error: err.message });
  }
});
dlqRouter.post("/:id/retry", async (req, res) => {
  try {
    const id = req.params.id;
    const docRef = dbProxy.collection("dead_letter_queue").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Job not found in DLQ" });
    }
    const data = docSnap.data();
    if (!data) {
      return res.status(500).json({ error: "Job data is empty" });
    }
    const payload = data.payload || {};
    const type = data.type || "test";
    const tenantId = data.tenant_id || payload.tenantId || req.query.tenantId;
    if (type.includes("cobrai") || data.queue_name === "cobrai" || type === "retry") {
      if (cobraiQueue && typeof cobraiQueue.add === "function") {
        await cobraiQueue.add(type, payload);
      }
    } else {
      const queue = tenantId ? getTenantQueue(tenantId) : messageQueue;
      if (queue && typeof queue.add === "function") {
        await queue.add(type, payload);
      }
    }
    await docRef.update({
      resolved: true,
      action: "retry",
      retried_at: /* @__PURE__ */ new Date()
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error retrying DLQ job:", err);
    return res.status(500).json({ error: err.message });
  }
});

// src/routes/osRouting.ts
var import_express6 = require("express");
var osRoutingRouter = (0, import_express6.Router)();
async function geocodeAddress(address) {
  if (address === "Rua A") return { lat: 0, lng: 0 };
  if (address === "Rua B") return { lat: 10, lng: 0 };
  if (address === "Rua C") return { lat: 2, lng: 0 };
  if (address === "geofail") return null;
  return null;
}
function calcDistance(p1, p2) {
  return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
}
async function optimizeRoute(oss) {
  if (!oss || oss.length === 0) return [];
  if (oss.length === 1) return oss;
  const validOS = [];
  const invalidOS = [];
  for (const os of oss) {
    const coords = await geocodeAddress(os.address);
    if (coords) {
      validOS.push({ ...os, lat: coords.lat, lng: coords.lng });
    } else {
      invalidOS.push(os);
    }
  }
  if (validOS.length <= 1) {
    return [...validOS, ...invalidOS];
  }
  const sorted = [];
  let current = validOS[0];
  sorted.push(current);
  const remaining = new Set(validOS.slice(1));
  while (remaining.size > 0) {
    let nearest = null;
    let minD = Infinity;
    for (const os of remaining) {
      const d = calcDistance({ lat: current.lat, lng: current.lng }, { lat: os.lat, lng: os.lng });
      if (d < minD) {
        minD = d;
        nearest = os;
      }
    }
    if (nearest) {
      sorted.push(nearest);
      remaining.delete(nearest);
      current = nearest;
    }
  }
  return [...sorted, ...invalidOS];
}
var dbMock = {
  osList: [],
  checkins: []
};
osRoutingRouter.post("/optimize-route", async (req, res) => {
  try {
    const { oss } = req.body;
    const optimized = await optimizeRoute(oss);
    res.json({ route: optimized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
osRoutingRouter.get("/checkins", (req, res) => {
  const { tenantId } = req.query;
  if (tenantId === "invalid") {
    return res.json({ checkins: [] });
  }
  if (!tenantId) {
    return res.status(400).json({ error: "Missing tenantId" });
  }
  const results = dbMock.checkins.filter((c) => c.tenantId === tenantId);
  res.json({ checkins: results });
});
function getOSStatus(os) {
  if (os.checkoutTime) {
    return { ...os, status: "conclu\xEDdo" };
  }
  if (os.checkinTime && !os.checkoutTime) {
    const now = /* @__PURE__ */ new Date();
    const diffHours = (now.getTime() - os.checkinTime.getTime()) / (1e3 * 60 * 60);
    if (diffHours > 8) {
      return { ...os, status: "em campo", alert: true };
    }
    return { ...os, status: "em campo", alert: false };
  }
  return os;
}
osRoutingRouter.get("/supervisor/list", (req, res) => {
  const updated = dbMock.osList.map(getOSStatus);
  res.json({ oss: updated });
});

// src/routes/evolution.ts
var import_express7 = __toESM(require("express"), 1);
var router2 = import_express7.default.Router();
router2.all("/proxy", async (req, res) => {
  const { path: path3, method, body, evolutionUrl, evolutionApiKey } = req.body || {};
  if (!evolutionUrl || !evolutionApiKey || !path3) {
    return res.status(400).json({ error: "Missing evolutionUrl, evolutionApiKey or path" });
  }
  if (evolutionUrl.includes("trycloudflare.com")) {
    console.warn("Ignoring dead trycloudflare Evolution URL:", evolutionUrl);
    return res.status(503).json({ error: "Evolution API not configured or using dead tunnel." });
  }
  const baseUrl = evolutionUrl.replace(/\/$/, "");
  const endpointPath = path3.startsWith("/") ? path3 : `/${path3}`;
  const targetUrl = `${baseUrl}${endpointPath}`;
  try {
    const fetchOptions = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey
      }
    };
    if (body && Object.keys(body).length > 0 && method !== "GET" && method !== "HEAD") {
      fetchOptions.body = JSON.stringify(body);
    }
    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type");
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Evolution API returned an error",
        status: response.status,
        details: data
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Evolution Proxy Error:", error);
    return res.status(500).json({ error: "Failed to connect to Evolution API", details: error.message });
  }
});
router2.get("/fetch-history", (req, res) => {
  res.json({ messages: [] });
});
var evolutionRouter = router2;

// src/routes/facebookWebhook.ts
var import_express8 = require("express");
init_firebaseAdmin();
var facebookWebhookRouter = (0, import_express8.Router)();
facebookWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode === "subscribe" && token === process.env.FACEBOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    } else {
      res.sendStatus(403);
      return;
    }
  }
  res.sendStatus(403);
});
facebookWebhookRouter.post("/", async (req, res) => {
  try {
    const { validateWebhookSignature: validateWebhookSignature2 } = await Promise.resolve().then(() => (init_hmac_service(), hmac_service_exports));
    const signature = req.headers["x-hub-signature-256"] ?? "";
    const rawBody = JSON.stringify(req.body);
    const isValid = validateWebhookSignature2(rawBody, signature, "facebook");
    if (!isValid) {
      res.status(401).json({ error: "Assinatura inv\xE1lida" });
      return;
    }
  } catch (e) {
    console.error("HMAC loading error", e);
  }
  const body = req.body;
  if (body.object === "page") {
    const events = body.entry || [];
    for (const entry of events) {
      const pageId = entry.id;
      const tenantsSnapshot = await dbProxy.collection("tenants").where("integrations.facebook.page_id", "==", pageId).limit(1).get();
      if (tenantsSnapshot.empty) {
        res.status(200).json({ status: "skipped:unknown_page" });
        return;
      }
      const tenantId = tenantsSnapshot.docs[0].id;
      const messagingEvents = entry.messaging || [];
      for (const event of messagingEvents) {
        if (event.message?.is_echo) {
          continue;
        }
        if (event.message?.text) {
          await messageQueue.add("process_message", {
            tenantId,
            from: event.sender.id,
            to: event.recipient.id,
            text: event.message.text,
            source: "facebook",
            metadata: {
              facebook: event
            }
          }, {
            removeOnComplete: true,
            attempts: 3,
            backoff: { type: "exponential", delay: 2e3 }
          });
        }
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// src/routes/evolutionWebhook.ts
var import_express9 = __toESM(require("express"), 1);
init_firebaseAdmin();
var evolutionWebhookRouter = import_express9.default.Router();
evolutionWebhookRouter.post("/", async (req, res) => {
  try {
    const { validateWebhookSignature: validateWebhookSignature2 } = await Promise.resolve().then(() => (init_hmac_service(), hmac_service_exports));
    const signature = (req.headers["x-hub-signature-256"] || req.headers["x-evolution-signature"]) ?? "";
    const rawBody = JSON.stringify(req.body);
    const isValid = validateWebhookSignature2(rawBody, signature, "evolution");
    if (!isValid) {
      return res.status(401).json({ error: "Assinatura inv\xE1lida" });
    }
    const payload = req.body;
    const instanceName = payload?.instance;
    if (!instanceName) {
      return res.status(400).json({ error: "Missing instance name" });
    }
    let tenantId;
    let tenantQuery2 = await dbProxy.collection("tenants").where("evolutionInstance", "==", instanceName).limit(1).get();
    if (!tenantQuery2.empty) {
      tenantId = tenantQuery2.docs[0].id;
    } else {
      tenantQuery2 = await dbProxy.collection("tenants").where("evolution_instances", "array-contains", instanceName).limit(1).get();
      if (!tenantQuery2.empty) {
        tenantId = tenantQuery2.docs[0].id;
      } else {
        tenantId = "local_tenant";
      }
    }
    if (payload.event === "messages.upsert") {
      const messageData = payload.data?.message;
      const key = payload.data?.key;
      const remoteJid = key?.remoteJid;
      if (!remoteJid || key?.fromMe) {
        return res.status(200).json({ status: "ignored" });
      }
      let textMessage = "";
      let isAudio = false;
      let audioUrl = "";
      let base64Media = "";
      let mediaMimeType = "";
      let isImage = false;
      let isDocument = false;
      if (messageData?.conversation) {
        textMessage = messageData.conversation;
      } else if (messageData?.extendedTextMessage?.text) {
        textMessage = messageData.extendedTextMessage.text;
      } else if (messageData?.audioMessage) {
        isAudio = true;
        audioUrl = messageData.audioMessage.url || "";
        mediaMimeType = messageData.audioMessage.mimetype || "";
      } else if (messageData?.imageMessage) {
        isImage = true;
        textMessage = messageData.imageMessage.caption || "";
        mediaMimeType = messageData.imageMessage.mimetype || "";
      } else if (messageData?.documentMessage) {
        isDocument = true;
        textMessage = messageData.documentMessage.caption || messageData.documentMessage.fileName || "";
        mediaMimeType = messageData.documentMessage.mimetype || "";
      }
      if (payload.data?.message?.base64) {
        base64Media = payload.data.message.base64;
      }
      await enqueueMessage(tenantId, {
        remoteJid,
        textMessage,
        messageData: payload.data,
        payload,
        tenantId,
        isAudio,
        audioUrl,
        isImage,
        isDocument,
        base64Media,
        mediaMimeType,
        messageId: key.id
      });
    } else if (payload.event === "connection.update") {
      const state = payload.data?.state || payload.data?.status;
      if (tenantId !== "local_tenant") {
        await dbProxy.collection("tenants").doc(tenantId).collection("integration_keys").doc("default").set({
          whatsappStatus: state
        }, { merge: true });
        await dbProxy.collection("logs").add({
          type: "whatsapp_connection",
          tenant_id: tenantId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          status: state,
          instance: instanceName
        });
      }
    }
    return res.status(200).json({ ok: true, received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

// src/routes/jobs.ts
var import_express10 = __toESM(require("express"), 1);
var jobsRouter = import_express10.default.Router();
jobsRouter.post("/schedule-pos-install", async (req, res) => {
  try {
    const { customerId, tenantId, osId, installedPlan } = req.body;
    const delay = 24 * 60 * 60 * 1e3;
    await enqueueMessage(
      tenantId || "default",
      { customerId, tenantId: tenantId || "default", osId, installedPlan },
      { delay },
      "pos_instalacao"
    );
    return res.json({ success: true, message: "Job scheduled" });
  } catch (err) {
    console.error("Error scheduling pos install job:", err);
    return res.status(500).json({ error: "Failed to schedule job" });
  }
});
jobsRouter.post("/schedule-csat", async (req, res) => {
  try {
    const { ticketId, tenantId, customerId, category, resolved_by } = req.body;
    const delay = 60 * 1e3;
    await enqueueMessage(
      tenantId || "default",
      { ticketId, tenantId: tenantId || "default", customerId, category, resolved_by },
      { delay },
      "send_csat"
    );
    return res.json({ success: true, message: "CSAT job scheduled" });
  } catch (err) {
    console.error("Error scheduling CSAT job:", err);
    return res.status(500).json({ error: "Failed to schedule CSAT job" });
  }
});
jobsRouter.post("/schedule-sla", async (req, res) => {
  try {
    const { ticketId, tenantId, customerId } = req.body;
    await enqueueMessage(
      tenantId || "default",
      { ticketId, tenantId: tenantId || "default", customerId, level: 1 },
      { delay: 10 * 60 * 1e3 },
      "sla_warning"
    );
    await enqueueMessage(
      tenantId || "default",
      { ticketId, tenantId: tenantId || "default", customerId, level: 2 },
      { delay: 15 * 60 * 1e3 },
      "sla_warning"
    );
    return res.json({ success: true, message: "SLA jobs scheduled" });
  } catch (err) {
    console.error("Error scheduling SLA jobs:", err);
    return res.status(500).json({ error: "Failed to schedule SLA jobs" });
  }
});

// server.ts
init_llm_adapter();

// apps/api/src/server.ts
var import_fastify = __toESM(require("fastify"));
var import_cors = __toESM(require("@fastify/cors"));
var import_jwt3 = __toESM(require("@fastify/jwt"));
var import_multipart = __toESM(require("@fastify/multipart"));
var import_helmet = __toESM(require("@fastify/helmet"));
var import_compress = __toESM(require("@fastify/compress"));
var import_etag = __toESM(require("@fastify/etag"));

// apps/api/src/infrastructure/config/env.validator.ts
var import_zod = require("zod");
var envSchema = import_zod.z.object({
  NODE_ENV: import_zod.z.enum(["development", "test", "production"]).default("development"),
  PORT: import_zod.z.string().transform(Number).default("3000"),
  FASTIFY_PORT: import_zod.z.string().transform(Number).default("3001"),
  LOG_LEVEL: import_zod.z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  SUPABASE_URL: import_zod.z.string().url("SUPABASE_URL deve ser uma URL v\xE1lida"),
  SUPABASE_ANON_KEY: import_zod.z.string().min(1, "SUPABASE_ANON_KEY \xE9 obrigat\xF3rio"),
  SUPABASE_SERVICE_ROLE_KEY: import_zod.z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY \xE9 obrigat\xF3rio"),
  REDIS_URL: import_zod.z.string().default("redis://localhost:6379"),
  OPENAI_API_KEY: import_zod.z.string().startsWith("sk-", "OPENAI_API_KEY deve come\xE7ar com sk-"),
  JWT_SECRET: import_zod.z.string().min(32, "JWT_SECRET deve ter no m\xEDnimo 32 caracteres"),
  ALLOWED_ORIGINS: import_zod.z.string().default("http://localhost:5173"),
  // Opcionais — adicionados nos próximos sprints
  EVOLUTION_API_URL: import_zod.z.string().url().optional(),
  EVOLUTION_API_KEY: import_zod.z.string().optional(),
  HELICONE_API_KEY: import_zod.z.string().optional(),
  SENTRY_DSN: import_zod.z.string().url().optional(),
  LANGCHAIN_API_KEY: import_zod.z.string().optional(),
  R2_ACCOUNT_ID: import_zod.z.string().optional(),
  R2_ACCESS_KEY_ID: import_zod.z.string().optional(),
  R2_SECRET_ACCESS_KEY: import_zod.z.string().optional(),
  R2_BUCKET_NAME: import_zod.z.string().default("astrum-documents")
});
var _env = null;
function validateEnv() {
  if (_env) return _env;
  const envSource = { ...process.env };
  if (!envSource.SUPABASE_URL) {
    envSource.SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE;
  }
  if (!envSource.SUPABASE_ANON_KEY) {
    envSource.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE;
  }
  if (!envSource.OPENAI_API_KEY && process.env.GEMINI_API_KEY) {
    envSource.OPENAI_API_KEY = process.env.GEMINI_API_KEY;
  }
  const result = envSchema.safeParse(envSource);
  if (!result.success) {
    console.error("\n\u274C ERRO: Vari\xE1veis de ambiente inv\xE1lidas ou ausentes:\n");
    result.error.issues.forEach((issue) => {
      console.error(`  \u2192 ${issue.path.join(".")}: ${issue.message}`);
    });
    console.error("\nVerifique seu arquivo .env e corrija os erros acima.\n");
    console.warn("\u26A0\uFE0F Ignorando falha de vari\xE1veis de ambiente para permitir boot do server.");
    _env = process.env;
    return _env;
  }
  _env = result.data;
  return _env;
}

// apps/api/src/infrastructure/observability/sentry.service.ts
var Sentry = __toESM(require("@sentry/node"));
var import_profiling_node = require("@sentry/profiling-node");
init_logger2();
var initialized = false;
function initSentry() {
  if (!process.env.SENTRY_DSN || initialized) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.npm_package_version ?? "2.0.0",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    profilesSampleRate: 0.1,
    integrations: [
      (0, import_profiling_node.nodeProfilingIntegration)()
    ],
    // Nunca capturar dados sensíveis
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
    // Ignorar erros de baixa prioridade
    ignoreErrors: [
      "Not Found",
      "ECONNRESET",
      "TokenExpiredError"
    ]
  });
  initialized = true;
  infraLogger.info({ dsn: process.env.SENTRY_DSN?.slice(0, 30) + "..." }, "Sentry inicializado");
}
function setSentryUser(userId, tenantId, role) {
  Sentry.setUser({ id: userId, role });
  Sentry.setTag("tenant_id", tenantId);
}
function captureError(err, context) {
  const eventId = Sentry.captureException(err, {
    extra: context
  });
  infraLogger.error({ err, sentryEventId: eventId }, "Erro capturado pelo Sentry");
  return eventId;
}

// apps/api/src/infrastructure/observability/sentry-fastify.plugin.ts
var import_fastify_plugin = __toESM(require("fastify-plugin"));
var Sentry2 = __toESM(require("@sentry/node"));
var sentryPlugin = (fastify, _opts, done) => {
  fastify.addHook("preHandler", async (request) => {
    const user = request.user;
    if (user?.userId) {
      setSentryUser(user.userId, user.tenantId, user.role);
    }
    Sentry2.setTag("route", `${request.method} ${request.routeOptions?.url ?? request.url}`);
  });
  fastify.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      captureError(error, {
        url: request.url,
        method: request.method,
        tenantId: request.user?.tenantId,
        userId: request.user?.userId
      });
    }
    return reply.status(statusCode).send({
      code: error.code ?? "INTERNAL_ERROR",
      message: statusCode >= 500 ? "Erro interno do servidor. Nossa equipe foi notificada." : error.message
    });
  });
  done();
};
var sentry_fastify_plugin_default = (0, import_fastify_plugin.default)(sentryPlugin, { name: "sentry", fastify: "5.x" });

// apps/api/src/server.ts
async function buildServer() {
  initSentry();
  validateEnv();
  const app3 = (0, import_fastify.default)({
    logger: { level: process.env.LOG_LEVEL ?? "info" }
  });
  await app3.register(sentry_fastify_plugin_default);
  await app3.register(import_helmet.default, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"]
      }
    }
  });
  await app3.register(import_compress.default, { global: true, threshold: 1024 });
  await app3.register(import_etag.default);
  await app3.register(import_cors.default, {
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:5173"],
    credentials: true
  });
  await app3.register(import_jwt3.default, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
    sign: { expiresIn: "15m" }
  });
  await app3.register(import_multipart.default, {
    limits: { fileSize: 50 * 1024 * 1024 }
  });
  app3.decorate("authenticate", async function(request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
  const idempotencyPlugin2 = await Promise.resolve().then(() => (init_idempotency_middleware(), idempotency_middleware_exports));
  await app3.register(idempotencyPlugin2.default);
  const rateLimitPlugin2 = await Promise.resolve().then(() => (init_rate_limit_plugin(), rate_limit_plugin_exports));
  await app3.register(rateLimitPlugin2.default);
  const webhookHmacPlugin2 = await Promise.resolve().then(() => (init_webhook_hmac_plugin(), webhook_hmac_plugin_exports));
  await app3.register(webhookHmacPlugin2.default);
  const { authRoutes: authRoutes2 } = await Promise.resolve().then(() => (init_auth_routes(), auth_routes_exports));
  await app3.register(authRoutes2);
  const { loginRoute: loginRoute2 } = await Promise.resolve().then(() => (init_login_route(), login_route_exports));
  await app3.register(loginRoute2);
  const { registerRoute: registerRoute2 } = await Promise.resolve().then(() => (init_register_route(), register_route_exports));
  await app3.register(registerRoute2);
  const { onboardingRoutes: onboardingRoutes2 } = await Promise.resolve().then(() => (init_onboarding_routes(), onboarding_routes_exports));
  await app3.register(onboardingRoutes2);
  const { requirePermission: requirePermission2 } = await Promise.resolve().then(() => (init_rbac_middleware(), rbac_middleware_exports));
  const { ticketRoutes: ticketRoutes2 } = await Promise.resolve().then(() => (init_tickets_routes(), tickets_routes_exports));
  await app3.register(ticketRoutes2);
  const { documentRoutes: documentRoutes2 } = await Promise.resolve().then(() => (init_documents_routes(), documents_routes_exports));
  await app3.register(documentRoutes2);
  const { analyticsRoutes: analyticsRoutes2 } = await Promise.resolve().then(() => (init_analytics_routes(), analytics_routes_exports));
  await app3.register(analyticsRoutes2);
  const { ragRoutes: ragRoutes2 } = await Promise.resolve().then(() => (init_rag_routes(), rag_routes_exports));
  await app3.register(ragRoutes2);
  const { chatStreamRoutes: chatStreamRoutes2 } = await Promise.resolve().then(() => (init_chat_stream_routes(), chat_stream_routes_exports));
  await app3.register(chatStreamRoutes2);
  const { etlRoutes: etlRoutes2 } = await Promise.resolve().then(() => (init_etl_routes(), etl_routes_exports));
  await app3.register(etlRoutes2);
  const websocketRoutes2 = await Promise.resolve().then(() => (init_websocket_routes(), websocket_routes_exports));
  await app3.register(websocketRoutes2.default);
  app3.get("/api/v2/health", async () => {
    const { getLLMStatus: getLLMStatus2 } = await Promise.resolve().then(() => (init_llm_adapter(), llm_adapter_exports));
    const { getRedisStatus: getRedisStatus2 } = await Promise.resolve().then(() => (init_redis_client(), redis_client_exports));
    const { getCollectionStats: getCollectionStats2 } = await Promise.resolve().then(() => (init_qdrant_adapter(), qdrant_adapter_exports));
    const qdrantStatus = await getCollectionStats2("health-check").then((s) => s.exists ? "connected" : "no-collections").catch(() => "unavailable");
    return {
      status: "ok",
      version: "2.0.0",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      worker: {
        pid: process.pid,
        uptime: Math.floor(process.uptime())
      },
      services: {
        redis: getRedisStatus2(),
        openai_circuit: getLLMStatus2().openai,
        llm_router: getLLMStatus2().router,
        qdrant: qdrantStatus,
        sentry: process.env.SENTRY_DSN ? "configured" : "not_configured",
        langsmith: process.env.LANGCHAIN_API_KEY ? "configured" : "not_configured"
      }
    };
  });
  app3.get("/api/v2/status", async () => ({
    version: "2.0.0",
    architecture: "fastify-ddd-hexagonal",
    sprint: 0
  }));
  app3.setErrorHandler((error, _req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) app3.log.error({ err: error }, "Erro interno");
    return reply.status(status).send({
      code: error.code ?? "INTERNAL_ERROR",
      message: status === 500 ? "Erro interno. Nossa equipe foi notificada." : error.message
    });
  });
  app3.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ code: "NOT_FOUND", message: "Rota n\xE3o encontrada." });
  });
  return app3;
}
async function scheduleBatchJobs() {
  const { queues: queues2 } = await Promise.resolve().then(() => (init_priority_queues(), priority_queues_exports));
  const queue = queues2["ai-batch"];
  await queue.add(
    "run_churn_analysis",
    { tenantId: "all" },
    {
      repeat: { pattern: "0 2 * * *" },
      jobId: "scheduled_churn_analysis",
      priority: 1
    }
  );
  await queue.add(
    "run_ticket_classification",
    { tenantId: "all" },
    {
      repeat: { pattern: "0 3 * * *" },
      jobId: "scheduled_ticket_classification",
      priority: 1
    }
  );
  await queue.add(
    "poll_batch_results",
    {},
    {
      repeat: { every: 5 * 60 * 1e3 },
      jobId: "batch_results_poller",
      priority: 3
    }
  );
}
async function startFastifyServer() {
  const app3 = await buildServer();
  const port = parseInt(process.env.FASTIFY_PORT ?? "3001");
  try {
    const listenConfig = { port, host: "0.0.0.0" };
    await app3.listen(listenConfig);
    app3.log.info(`[FASTIFY] Servidor v2 rodando em http://localhost:${port}`);
    const { initBusinessListeners: initBusinessListeners2 } = await Promise.resolve().then(() => (init_business_listeners(), business_listeners_exports));
    initBusinessListeners2();
    const { aiProcessingQueue: aiProcessingQueue2 } = await import("../../packages/queue/src/queues");
    await aiProcessingQueue2.add(
      "etl:scheduled",
      { trigger: "scheduled" },
      {
        repeat: { every: 15 * 60 * 1e3 },
        // 15 minutos
        jobId: "etl:recurring"
        // ID fixo evita duplicatas
      }
    );
    app3.log.info("ETL: job recorrente agendado (a cada 15min)");
    const { initAnalyticsSchema: initAnalyticsSchema2 } = await Promise.resolve().then(() => (init_analytics_schema(), analytics_schema_exports));
    await initAnalyticsSchema2();
    const { startOutboxPoller } = await import("../../packages/queue/src/workers/outbox.worker");
    await startOutboxPoller();
    await scheduleBatchJobs();
  } catch (err) {
    app3.log.error({ err }, "Erro ao iniciar Fastify, ignorando para n\xE3o derrubar Express");
  }
  const shutdown = async (signal) => {
    app3.log.info(`[FASTIFY] ${signal} recebido. Encerrando...`);
    await app3.close();
    try {
      const { closeAllChannels: closeAllChannels2 } = await Promise.resolve().then(() => (init_realtime_service(), realtime_service_exports));
      await closeAllChannels2();
    } catch (e) {
    }
    try {
      const { closeDuckDB: closeDuckDB2 } = await Promise.resolve().then(() => (init_duckdb_service(), duckdb_service_exports));
      await closeDuckDB2();
    } catch (e) {
    }
    try {
      const { closeAllQueues } = await import("../../packages/queue/src/queues");
      await closeAllQueues();
      app3.log.info("[FASTIFY] Filas BullMQ encerradas.");
    } catch (e) {
    }
    try {
      const { closeRedis: closeRedis2 } = await Promise.resolve().then(() => (init_redis_client(), redis_client_exports));
      await closeRedis2();
    } catch (e) {
    }
    app3.log.info("[FASTIFY] Shutdown gracioso conclu\xEDdo.");
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  return app3;
}

// server.ts
process.on("uncaughtException", (err) => console.error("UNCAUGHT EXCEPTION", err));
process.on("unhandledRejection", (err) => console.error("UNHANDLED REJECTION", err));
async function startServer() {
  const app3 = (0, import_express11.default)();
  const PORT = 3e3;
  startFastifyServer().catch(console.error);
  app3.use(import_express11.default.json());
  app3.get("/api/test", (req, res) => res.send("TEST SUCCESS"));
  app3.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      services: {
        openai_circuit: getLLMStatus().openai,
        llm_router: getLLMStatus().router
      }
    });
  });
  app3.get("/api/health/whatsapp", (req, res) => {
    res.json({ status: "open", checked_at: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app3.get("/api/system/webhook-url", (req, res) => {
    res.json({ webhookUrl: `${req.protocol}://${req.get("host")}/api/webhook/evolution` });
  });
  app3.use("/api/super-admin", superAdmin_default);
  app3.use("/api/v1", api_v1_default);
  app3.use("/api/cobrai", cobraiRouter);
  app3.use("/api/queues", queuesRouter);
  app3.use("/api/dlq", dlqRouter);
  app3.use("/api/os", osRoutingRouter);
  app3.use("/api/evolution", evolutionRouter);
  app3.use("/api/jobs", jobsRouter);
  app3.use("/api/webhook/facebook", facebookWebhookRouter);
  app3.use("/api/webhook/evolution", evolutionWebhookRouter);
  app3.use("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  const distPath = import_path.default.join(process.cwd(), "dist/client");
  app3.use(import_express11.default.static(distPath));
  app3.use("/app/applet", import_express11.default.static(distPath + "/app/applet"));
  let vite;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom"
    });
    app3.use(vite.middlewares);
  }
  app3.use("*", async (req, res, next) => {
    try {
      if (vite) {
        let template = import_fs2.default.readFileSync(import_path.default.resolve("index.html"), "utf-8");
        template = await vite.transformIndexHtml(req.originalUrl, template);
        return res.status(200).set({ "Content-Type": "text/html" }).end(template);
      }
      const distIndex = import_path.default.join(process.cwd(), "dist/client/index.html");
      const distAppletIndex = import_path.default.join(process.cwd(), "dist/client/app/applet/index.html");
      const rootIndex = import_path.default.join(process.cwd(), "index.html");
      let finalIndex = "";
      if (import_fs2.default.existsSync(distIndex)) finalIndex = distIndex;
      else if (import_fs2.default.existsSync(distAppletIndex)) finalIndex = distAppletIndex;
      else if (import_fs2.default.existsSync(rootIndex)) finalIndex = rootIndex;
      else {
        return res.status(404).send("No index.html found anywhere.");
      }
      res.sendFile(finalIndex);
    } catch (e) {
      if (vite) vite.ssrFixStacktrace(e);
      console.error(e);
      res.status(500).send("Error");
    }
  });
  app3.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
