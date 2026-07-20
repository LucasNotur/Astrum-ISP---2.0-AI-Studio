/**
 * F6-01 — Import de histórico do WhatsApp (Evolution API).
 *
 * Busca chats+mensagens da instância do tenant via Evolution API
 * (/chat/findChats, /chat/findMessages/:instanceName) e grava em
 * conversations/messages com created_by='history_import'.
 * Dedupe por legacy_id (id externo do Evolution).
 *
 * Ports injetáveis para teste com HTTP mockado.
 */
import { infraLogger } from '../../infrastructure/logging/logger';
import supabase from '../../infrastructure/database/supabase.client';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EvolutionChat {
  id: string;
  remoteJid: string;
  name?: string;
  lastMsgTimestamp?: number;
}

export interface EvolutionMessage {
  key: { id: string; remoteJid: string; fromMe: boolean };
  message?: { conversation?: string; extendedTextMessage?: { text?: string } };
  messageTimestamp: number;
  pushName?: string;
}

export interface HistoryImportResult {
  chatsFound: number;
  conversationsCreated: number;
  messagesImported: number;
  duplicatesSkipped: number;
}

export interface HistoryImportPorts {
  db: typeof supabase;
  fetchChats: (instanceName: string, apiUrl: string, apiKey: string) => Promise<EvolutionChat[]>;
  fetchMessages: (instanceName: string, remoteJid: string, apiUrl: string, apiKey: string) => Promise<EvolutionMessage[]>;
}

// ── Evolution API HTTP layer ────────────────────────────────────────────────

export async function fetchChatsFromEvolution(
  instanceName: string, apiUrl: string, apiKey: string,
): Promise<EvolutionChat[]> {
  const res = await fetch(`${apiUrl}/chat/findChats/${instanceName}`, {
    headers: { apikey: apiKey },
  });
  if (!res.ok) throw new Error(`Evolution findChats: HTTP ${res.status}`);
  return res.json();
}

export async function fetchMessagesFromEvolution(
  instanceName: string, remoteJid: string, apiUrl: string, apiKey: string,
): Promise<EvolutionMessage[]> {
  const res = await fetch(`${apiUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: { key: { remoteJid } } }),
  });
  if (!res.ok) throw new Error(`Evolution findMessages: HTTP ${res.status}`);
  return res.json();
}

function extractText(msg: EvolutionMessage): string | null {
  return msg.message?.conversation
    ?? msg.message?.extendedTextMessage?.text
    ?? null;
}

// ── Core import logic ───────────────────────────────────────────────────────

export async function importWhatsAppHistory(
  tenantId: string,
  instanceName: string,
  ports: HistoryImportPorts = {
    db: supabase,
    fetchChats: fetchChatsFromEvolution,
    fetchMessages: fetchMessagesFromEvolution,
  },
): Promise<HistoryImportResult> {
  const apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const apiKey = process.env.EVOLUTION_API_KEY || 'dummy_key';

  const chats = await ports.fetchChats(instanceName, apiUrl, apiKey);
  infraLogger.info({ tenantId, instanceName, chats: chats.length }, 'F6-01: chats encontrados');

  let conversationsCreated = 0;
  let messagesImported = 0;
  let duplicatesSkipped = 0;

  for (const chat of chats) {
    if (!chat.remoteJid || chat.remoteJid.includes('@g.us')) continue;

    const phone = chat.remoteJid.replace('@s.whatsapp.net', '');

    const { data: existing } = await ports.db
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('legacy_id', chat.id)
      .maybeSingle();

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
    } else {
      const { data: conv, error: convErr } = await ports.db
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          legacy_id: chat.id,
          channel: 'whatsapp',
          customer_phone: phone,
          customer_name: chat.name ?? phone,
          status: 'closed',
          created_by: 'history_import',
        })
        .select('id')
        .single();
      if (convErr) {
        infraLogger.warn({ tenantId, chat: chat.id, err: convErr.message }, 'F6-01: erro ao criar conversa');
        continue;
      }
      conversationId = conv.id;
      conversationsCreated++;
    }

    let messages: EvolutionMessage[];
    try {
      messages = await ports.fetchMessages(instanceName, chat.remoteJid, apiUrl, apiKey);
    } catch (err) {
      infraLogger.warn({ tenantId, chat: chat.id, err: (err as Error).message }, 'F6-01: erro ao buscar mensagens');
      continue;
    }

    for (const msg of messages) {
      const text = extractText(msg);
      if (!text) continue;

      const legacyId = msg.key.id;

      const { data: existingMsg } = await ports.db
        .from('messages')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('legacy_id', legacyId)
        .maybeSingle();

      if (existingMsg) {
        duplicatesSkipped++;
        continue;
      }

      const role = msg.key.fromMe ? 'assistant' : 'user';
      const createdAt = new Date(msg.messageTimestamp * 1000).toISOString();

      const { error: msgErr } = await ports.db
        .from('messages')
        .insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          legacy_id: legacyId,
          role,
          content: text,
          created_at: createdAt,
          created_by: 'history_import',
        });

      if (msgErr) {
        infraLogger.warn({ tenantId, legacyId, err: msgErr.message }, 'F6-01: erro ao gravar mensagem');
        continue;
      }
      messagesImported++;
    }
  }

  infraLogger.info(
    { tenantId, conversationsCreated, messagesImported, duplicatesSkipped },
    'F6-01: import de histórico concluído',
  );

  return {
    chatsFound: chats.length,
    conversationsCreated,
    messagesImported,
    duplicatesSkipped,
  };
}
