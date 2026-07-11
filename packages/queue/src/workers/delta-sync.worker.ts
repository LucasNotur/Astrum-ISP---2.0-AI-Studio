/**
 * Delta Sync Worker — BullMQ — Plano Mestre V2, S70.
 *
 * Mantém o Supabase espelhado com o Firestore (tickets/mensagens) até o cutover S82.
 * Roda a cada 15 min via `scheduleDeltaSync()`. Processa apenas mensagens novas
 * (createdAt > last_synced_message_at) por ticket, usando o watermark da ponte
 * `legacy_ticket_conversation_map`.
 *
 * Dependência Firebase: carregada dinamicamente (firebase-admin em devDep raiz).
 * Se FIREBASE_PROJECT_ID não estiver definido, o job loga aviso e encerra sem erro —
 * útil em ambientes sem credenciais (CI, staging sem Firestore).
 */

import { Worker, Queue, type Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';

export const DELTA_SYNC_QUEUE = 'astrum:delta-sync';

export interface DeltaSyncJobData {
  tenantId: string;
  trigger: 'scheduled' | 'manual';
}

// Mapeamento de senderType legado → role/from_ai (inlined para evitar import cross-boundary)
function mapMsgRole(senderType: string | null | undefined): { role: string; fromAi: boolean } {
  switch ((senderType ?? '').trim().toLowerCase()) {
    case 'customer': return { role: 'user', fromAi: false };
    case 'ai':       return { role: 'assistant', fromAi: true };
    case 'human':    return { role: 'assistant', fromAi: false };
    case 'system':   return { role: 'system', fromAi: false };
    default:         return { role: 'user', fromAi: false };
  }
}

async function processDeltaSync(job: Job<DeltaSyncJobData>): Promise<{ synced: number }> {
  const { tenantId, trigger } = job.data;
  infraLogger.info({ tenantId, trigger }, 'delta-sync iniciado');

  // Firebase Admin: carregado dinamicamente — não está no bundle de produção base
  if (!process.env['FIREBASE_PROJECT_ID']) {
    infraLogger.warn({ tenantId }, 'FIREBASE_PROJECT_ID não configurado — delta-sync saltado');
    return { synced: 0 };
  }

  let adminDb: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFirestore } = await import('firebase-admin/firestore');

    if ((getApps() as any[]).length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env['FIREBASE_PROJECT_ID']!,
          clientEmail: process.env['FIREBASE_CLIENT_EMAIL']!,
          privateKey: process.env['FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n'),
        }),
      });
    }
    adminDb = getFirestore();
  } catch (err: any) {
    infraLogger.warn({ err: err.message }, 'firebase-admin não disponível — delta-sync saltado');
    return { synced: 0 };
  }

  // Watermarks: conversation_id + last_synced_message_at por ticket legado
  type MapRow = { legacy_ticket_id: string; conversation_id: string; last_synced_message_at: string | null };
  const { data: mapRows } = await (supabaseAdmin as any)
    .from('legacy_ticket_conversation_map')
    .select('legacy_ticket_id, conversation_id, last_synced_message_at')
    .eq('tenant_id', tenantId);

  const watermarks = new Map<string, { convId: string; wm: string | null }>(
    ((mapRows as MapRow[] | null) ?? []).map((r) => [
      r.legacy_ticket_id,
      { convId: r.conversation_id, wm: r.last_synced_message_at },
    ]),
  );

  if (watermarks.size === 0) {
    infraLogger.info({ tenantId }, 'Nenhum ticket mapeado ainda — executar S70 backfill primeiro');
    return { synced: 0 };
  }

  const firestoreTenantId = process.env['FIRESTORE_TENANT_ID'] ?? tenantId;
  const useSubcollections = process.env['FIRESTORE_SUBCOLLECTIONS'] !== 'false';

  const ticketSnap = useSubcollections
    ? await adminDb.collection('tenants').doc(firestoreTenantId).collection('tickets').get()
    : await adminDb.collection('tickets').where('tenantId', '==', firestoreTenantId).get();

  let synced = 0;
  for (const doc of ticketSnap.docs) {
    const ticketId: string = doc.id;
    const existing = watermarks.get(ticketId);
    if (!existing) continue; // Ticket não mapeado (backfill incompleto) — pula

    const msgSnap = useSubcollections
      ? await adminDb
          .collection('tenants').doc(firestoreTenantId)
          .collection('tickets').doc(ticketId)
          .collection('messages').get()
      : await adminDb.collection('messages').where('ticketId', '==', ticketId).get();

    const allMsgs = (msgSnap.docs as any[])
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

    const newMsgs = existing.wm
      ? allMsgs.filter((m: any) => (m.createdAt ?? '') > existing.wm!)
      : allMsgs;

    if (!newMsgs.length) continue;

    const rows = newMsgs.map((m: any) => {
      const { role, fromAi } = mapMsgRole(m.senderType);
      return {
        tenant_id: tenantId,
        conversation_id: existing.convId,
        legacy_id: m.id,
        role,
        from_ai: fromAi,
        content: m.text ?? '',
        created_at: m.createdAt ?? new Date().toISOString(),
      };
    });

    // Idempotente: ignora conflito em (conversation_id, legacy_id)
    const { error } = await (supabaseAdmin as any)
      .from('messages')
      .upsert(rows, { onConflict: 'conversation_id,legacy_id', ignoreDuplicates: true });

    if (error) {
      infraLogger.error({ ticketId, err: error.message }, 'delta-sync: erro ao inserir mensagens');
      continue;
    }

    const lastAt: string | null = allMsgs.length ? (allMsgs[allMsgs.length - 1].createdAt ?? null) : null;
    await (supabaseAdmin as any)
      .from('legacy_ticket_conversation_map')
      .update({ last_synced_message_at: lastAt })
      .eq('tenant_id', tenantId)
      .eq('legacy_ticket_id', ticketId);

    synced++;
  }

  infraLogger.info({ tenantId, synced }, 'delta-sync concluído');
  return { synced };
}

export function createDeltaSyncWorker() {
  const worker = new Worker<DeltaSyncJobData>(
    DELTA_SYNC_QUEUE,
    processDeltaSync,
    { connection: connection as any, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, tenantId: job?.data.tenantId, err: err.message }, 'delta-sync falhou');
  });

  return worker;
}

/**
 * Registra o job recorrente (15 min) para um tenant.
 * Chamar no boot do servidor após o backfill S70 estar completo.
 */
export async function scheduleDeltaSync(tenantId: string): Promise<void> {
  const queue = new Queue<DeltaSyncJobData>(DELTA_SYNC_QUEUE, { connection: connection as any });
  await queue.upsertJobScheduler(
    `delta-sync-${tenantId}`,
    { every: 15 * 60 * 1000 },
    { name: 'delta-sync', data: { tenantId, trigger: 'scheduled' } },
  );
  await queue.close();
  infraLogger.info({ tenantId }, 'delta-sync job scheduler registrado (15 min)');
}
