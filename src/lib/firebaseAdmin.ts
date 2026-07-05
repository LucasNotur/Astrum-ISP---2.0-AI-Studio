/**
 * FZ-2 — SEAM DO BACKEND: este módulo mantém o NOME e os EXPORTS históricos
 * (adminDb, default admin) mas persiste 100% no SUPABASE via src/lib/db-compat/.
 * O Firestore foi removido do projeto (Plano FIRESTORE-ZERO, 2026-07-03).
 *
 * ~50 arquivos do backend legado importam daqui e NÃO foram editados — a API
 * (collection/doc/get/set/update/where/orderBy/batch/runTransaction/FieldValue/
 * Timestamp) é servida pela camada de compatibilidade.
 *
 * Rollback: git revert do commit FZ-2.
 */
import {
  CompatFirestore,
  FieldValue,
  CompatTimestamp as Timestamp,
} from './db-compat';

const compatDb = new CompatFirestore();

export const adminDb = compatDb;

/**
 * adminAuth: o Firebase Auth foi desativado (FZ-3 — verificação de JWT Supabase
 * em src/lib/authVerify.ts). Nenhum código deve chegar aqui; erro claro se chegar.
 */
export const adminAuth = new Proxy({} as any, {
  get(_, prop) {
    throw new Error(
      `[firebaseAdmin] adminAuth.${String(prop)} não existe mais — ` +
      'use verifySupabaseToken() de src/lib/authVerify.ts (Plano FZ-3).'
    );
  },
});

/** adminStorage: uploads agora vão para o Supabase Storage (bucket "uploads"). */
export const adminStorage = new Proxy({} as any, {
  get(_, prop) {
    throw new Error(
      `[firebaseAdmin] adminStorage.${String(prop)} não existe mais — ` +
      'use supabaseAdmin.storage.from("uploads") (Plano FZ, migration 032).'
    );
  },
});

// ─── Namespace compat (admin.firestore() / admin.auth()) ─────────────────────

const firestoreApi = function () {
  return compatDb;
};
firestoreApi.Timestamp = Timestamp;
firestoreApi.FieldValue = FieldValue;

const customAdmin = {
  firestore: firestoreApi,
  auth: function (): never {
    throw new Error(
      '[firebaseAdmin] admin.auth() não existe mais — ' +
      'use verifySupabaseToken() de src/lib/authVerify.ts ou a tabela users (Plano FZ-3).'
    );
  },
};

export { FieldValue, Timestamp };
export default customAdmin;
