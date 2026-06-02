import * as Y from 'yjs';

// Cache de documentos por ticket (será movido para Redis no Sprint 1)
const ticketDocs = new Map<string, Y.Doc>();

export interface TicketUpdate {
  field: 'description' | 'solution' | 'notes';
  value: string;
  userId: string;
  timestamp: number;
}

export function getTicketDoc(ticketId: string): Y.Doc {
  if (!ticketDocs.has(ticketId)) ticketDocs.set(ticketId, new Y.Doc());
  return ticketDocs.get(ticketId)!;
}

export function applyTicketUpdate(ticketId: string, update: TicketUpdate): Record<string, string> {
  const doc = getTicketDoc(ticketId);
  const fields = doc.getMap<string>('fields');
  doc.transact(() => {
    fields.set(update.field, update.value);
    fields.set(`${update.field}_updated_by`, update.userId);
    fields.set(`${update.field}_updated_at`, new Date(update.timestamp).toISOString());
  });
  return Object.fromEntries(fields.entries());
}

export function getTicketState(ticketId: string): Record<string, string> {
  const doc = getTicketDoc(ticketId);
  return Object.fromEntries(doc.getMap<string>('fields').entries());
}

export function getTicketDiff(ticketId: string, sinceVersion?: Uint8Array): Uint8Array {
  const doc = getTicketDoc(ticketId);
  return sinceVersion ? Y.encodeStateAsUpdate(doc, sinceVersion) : Y.encodeStateAsUpdate(doc);
}

export function applyTicketDiff(ticketId: string, diff: Uint8Array): void {
  Y.applyUpdate(getTicketDoc(ticketId), diff);
}
