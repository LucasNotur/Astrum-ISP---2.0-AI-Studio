/**
 * Voice Call — máquina de estados do atendimento telefônico por IA (OpenAI Realtime
 * ou Whisper+TTS). Plano Mestre V2, S95 (módulo novo). Pura e testável.
 *
 * Escopo MVP: atender → identificar cliente → resolver (fatura/diagnóstico/agendamento)
 * → transferir para humano quando necessário. Horário comercial, PT-BR, 1 número.
 */

export type CallState =
  | 'ringing' | 'greeting' | 'identifying' | 'serving' | 'transferring' | 'ended';

export interface CallContext {
  state: CallState;
  customerId: string | null;
  intent: string | null;
  failedIdentifications: number;
  withinBusinessHours: boolean;
}

export interface CallEvent {
  type: 'answer' | 'identified' | 'identify_failed' | 'intent_detected' | 'resolved' | 'request_human' | 'hangup';
  customerId?: string;
  intent?: string;
}

const MAX_ID_ATTEMPTS = 3;
// Intents que a IA resolve sozinha no MVP; os demais transferem.
const SELF_SERVE_INTENTS = ['segunda_via', 'diagnostico', 'agendar_visita', 'status_os'];

/** Transição da máquina de estados. Pura: (contexto, evento) → novo contexto. */
export function transition(ctx: CallContext, ev: CallEvent): CallContext {
  switch (ev.type) {
    case 'answer':
      // Fora do horário comercial, o MVP encerra com aviso (sem fila noturna).
      return { ...ctx, state: ctx.withinBusinessHours ? 'greeting' : 'ended' };

    case 'identified':
      return { ...ctx, state: 'serving', customerId: ev.customerId ?? ctx.customerId };

    case 'identify_failed': {
      const fails = ctx.failedIdentifications + 1;
      // 3 tentativas falhas → transfere para humano (não deixa o cliente preso).
      return fails >= MAX_ID_ATTEMPTS
        ? { ...ctx, state: 'transferring', failedIdentifications: fails }
        : { ...ctx, state: 'identifying', failedIdentifications: fails };
    }

    case 'intent_detected': {
      const intent = ev.intent ?? null;
      const canSelfServe = intent != null && SELF_SERVE_INTENTS.includes(intent);
      return { ...ctx, intent, state: canSelfServe ? 'serving' : 'transferring' };
    }

    case 'resolved':
      return { ...ctx, state: 'ended' };

    case 'request_human':
      return { ...ctx, state: 'transferring' };

    case 'hangup':
      return { ...ctx, state: 'ended' };

    default:
      return ctx;
  }
}

export function initialCall(withinBusinessHours: boolean): CallContext {
  return { state: 'ringing', customerId: null, intent: null, failedIdentifications: 0, withinBusinessHours };
}
