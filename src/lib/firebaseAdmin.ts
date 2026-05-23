import { initializeApp, getApps, cert, App, applicationDefault } from "firebase-admin/app";
import { getFirestore, Firestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import * as adminNamespace from "firebase-admin";
import fs from "fs";

let app: App | null = null;

function ensureInitialized(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  if (app) return app;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      app = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("[FirebaseAdmin] Status: Initialized using FIREBASE_SERVICE_ACCOUNT_JSON from environment");
      return app;
    } else {
      console.log("[FirebaseAdmin] Status: Trying applicationDefault()...");
      try {
        app = initializeApp({
          credential: applicationDefault(),
        });
        return app;
      } catch (err: any) {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_JSON não configurada. " +
          "Por favor, adicione o JSON da conta de serviço do Firebase " +
          "no menu Configurações (Settings) -> Secrets do AI Studio."
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

let dbIdFromConfig: string | undefined;
try {
  if (fs.existsSync('./firebase-applet-config.json')) {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    dbIdFromConfig = config.firestoreDatabaseId;
  }
} catch (e) {}

const dbProxy = new Proxy({} as Firestore, {
  get(_, prop) {
    const db = getFirestore(ensureInitialized(), dbIdFromConfig);
    const value = (db as any)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  }
});

const authProxy = new Proxy({} as Auth, {
  get(_, prop) {
    const auth = getAuth(ensureInitialized());
    const value = (auth as any)[prop];
    return typeof value === 'function' ? value.bind(auth) : value;
  }
});

const storageProxy = new Proxy({} as any, {
  get(_, prop) {
    const storage = getStorage(ensureInitialized());
    const value = (storage as any)[prop];
    return typeof value === 'function' ? value.bind(storage) : value;
  }
});

export { dbProxy as adminDb, authProxy as adminAuth, storageProxy as adminStorage };

const firestoreApi = function() {
  return getFirestore(ensureInitialized(), dbIdFromConfig);
};
firestoreApi.Timestamp = Timestamp;
firestoreApi.FieldValue = FieldValue;

const customAdmin = {
  ...adminNamespace,
  firestore: firestoreApi,
  auth: function() {
    return getAuth(ensureInitialized());
  }
};

export default customAdmin;
