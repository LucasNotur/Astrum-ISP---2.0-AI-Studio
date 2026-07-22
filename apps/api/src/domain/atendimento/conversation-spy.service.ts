/**
 * Dossiê #63 — Módulo "Observadores/Espionagem".
 * Permite supervisores monitorarem conversas em tempo real
 * e enviarem whisper (mensagem visível só para o operador).
 */

export type SpyMode = 'observe' | 'whisper' | 'takeover';

export interface SpySession {
  sessionId: string;
  conversationId: string;
  supervisorId: string;
  mode: SpyMode;
  startedAt: string;
}

export interface SpyPorts {
  getActiveSession: (conversationId: string, supervisorId: string) => Promise<SpySession | null>;
  createSession: (conversationId: string, supervisorId: string, mode: SpyMode) => Promise<SpySession>;
  endSession: (sessionId: string) => Promise<void>;
  sendWhisper: (conversationId: string, operatorId: string, message: string) => Promise<void>;
  takeoverConversation: (conversationId: string, supervisorId: string) => Promise<void>;
  hasPermission: (tenantId: string, supervisorId: string, permission: string) => Promise<boolean>;
}

export async function startSpying(
  tenantId: string,
  conversationId: string,
  supervisorId: string,
  mode: SpyMode,
  ports: SpyPorts,
): Promise<{ ok: boolean; session?: SpySession; error?: string }> {
  const hasPermission = await ports.hasPermission(tenantId, supervisorId, `spy:${mode}`);
  if (!hasPermission) {
    return { ok: false, error: `Sem permissão para modo ${mode}` };
  }

  const existing = await ports.getActiveSession(conversationId, supervisorId);
  if (existing) {
    return { ok: true, session: existing };
  }

  const session = await ports.createSession(conversationId, supervisorId, mode);
  return { ok: true, session };
}

export async function sendWhisperMessage(
  session: SpySession,
  operatorId: string,
  message: string,
  ports: SpyPorts,
): Promise<{ ok: boolean; error?: string }> {
  if (session.mode !== 'whisper' && session.mode !== 'takeover') {
    return { ok: false, error: 'Modo observe não permite enviar mensagens' };
  }
  await ports.sendWhisper(session.conversationId, operatorId, message);
  return { ok: true };
}

export async function takeoverConversation(
  session: SpySession,
  ports: SpyPorts,
): Promise<{ ok: boolean; error?: string }> {
  if (session.mode !== 'takeover') {
    return { ok: false, error: 'Modo não permite takeover' };
  }
  await ports.takeoverConversation(session.conversationId, session.supervisorId);
  return { ok: true };
}
