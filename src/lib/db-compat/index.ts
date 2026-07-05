/**
 * FZ-1 — Ponto de entrada da camada de compatibilidade Firestore→Supabase.
 * Consumido por src/lib/firebaseAdmin.ts (seam do backend legado).
 */
export {
  CompatFirestore,
  CompatTransaction,
  CollectionRef,
  DocRef,
  DocSnap,
  Query,
  QuerySnap,
  WriteBatch,
  FieldValue,
  CompatTimestamp,
} from './firestore';
export { CompatTimestamp as Timestamp } from './timestamp';
export { resolveRoute, NATIVE_TABLES, isUuid, toSnake, toCamel } from './mapping';
