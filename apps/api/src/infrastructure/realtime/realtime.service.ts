import { supabaseAdmin } from '../database/supabase.client';
import { infraLogger } from '../logging/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Serviço de Realtime para o backend monitorar eventos do banco.
 *
 * CASOS DE USO NO BACKEND:
 * - Monitorar novas mensagens chegando para enfileirar processamento de IA
 * - Detectar mudança de status de fatura para disparar CobrAI
 * - Sincronizar estado entre workers do cluster
 *
 * O frontend usa supabase diretamente com subscriptions — não passa pelo backend.
 */

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

interface TableChangeHandler<T = Record<string, unknown>> {
  table: string;
  event: ChangeEvent | '*';
  filter?: string;
  handler: (payload: { new: T; old: T; eventType: ChangeEvent }) => void | Promise<void>;
}

const activeChannels = new Map<string, RealtimeChannel>();

/**
 * Registra um listener para mudanças em uma tabela.
 */
export function watchTable<T = Record<string, unknown>>(
  config: TableChangeHandler<T>
): RealtimeChannel {
  const channelName = `${config.table}:${config.event}:${config.filter ?? 'all'}`;

  // Evitar canais duplicados
  if (activeChannels.has(channelName)) {
    return activeChannels.get(channelName)!;
  }

  const channel = supabaseAdmin
    .channel(channelName)
    .on(
      'postgres_changes' as any,
      {
        event: config.event,
        schema: 'public',
        table: config.table,
        filter: config.filter,
      },
      async (payload: any) => {
        try {
          await config.handler({
            new: payload.new as T,
            old: payload.old as T,
            eventType: payload.eventType as ChangeEvent,
          });
        } catch (err) {
          infraLogger.error({ err, table: config.table }, 'Erro no handler de Realtime');
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        infraLogger.info({ channelName }, 'Realtime: canal ativo');
      } else if (status === 'CHANNEL_ERROR') {
        infraLogger.error({ channelName }, 'Realtime: erro no canal');
      }
    });

  activeChannels.set(channelName, channel);
  return channel;
}

/**
 * Remove um canal de Realtime.
 */
export async function unwatchTable(channelName: string): Promise<void> {
  const channel = activeChannels.get(channelName);
  if (channel) {
    await supabaseAdmin.removeChannel(channel);
    activeChannels.delete(channelName);
  }
}

/**
 * Remove todos os canais ativos (Graceful Shutdown).
 */
export async function closeAllChannels(): Promise<void> {
  await Promise.all(
    Array.from(activeChannels.values()).map(ch => supabaseAdmin.removeChannel(ch))
  );
  activeChannels.clear();
  infraLogger.info('Realtime: todos os canais fechados');
}
