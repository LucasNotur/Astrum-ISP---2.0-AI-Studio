/**
 * PLANO I (Uber do Técnico) — Fase I-1 — Máquina de estados da Ordem de Serviço.
 *
 * O coração do ciclo de vida da OS de campo. UM endpoint (`/os/:id/transition`)
 * chama UMA máquina de estados testada — nunca N endpoints soltos. Cada transição
 * válida gera um `service_order_events` imutável e atualiza `service_orders.status`.
 *
 * Lógica pura + ports injetáveis (sem Supabase real nos testes), no mesmo padrão
 * dos serviços de domínio do dossiê.
 */

/** Eventos do ciclo de vida (o vocabulário de `service_order_events.event`). */
export type OsEvent =
  | 'criada'
  | 'atribuida'
  | 'aceita'
  | 'a_caminho'
  | 'chegou'
  | 'iniciada'
  | 'pausada'
  | 'retomada'
  | 'concluida'
  | 'cancelada'
  | 'reagendada';

/**
 * Status persistido em `service_orders.status`. Usamos o vocabulário pt-BR do
 * legado (migration 073 aceita ambos), que é o que o frontend legado exibe.
 */
export type OsStatus =
  | 'pendente'
  | 'em_deslocamento'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado';

/**
 * Estado interno da máquina — mais granular que o status persistido. Vários
 * estados internos mapeiam para o mesmo status (ex.: pausada e em_execucao são
 * ambos 'em_atendimento'). É o estado interno que decide as próximas transições.
 */
export type OsPhase =
  | 'nova'
  | 'atribuida'
  | 'aceita'
  | 'em_deslocamento'
  | 'no_local'
  | 'em_execucao'
  | 'pausada'
  | 'concluida'
  | 'cancelada'
  | 'reagendada';

/** Transições permitidas: de qual fase, qual evento leva a qual fase. */
const TRANSITIONS: Record<OsPhase, Partial<Record<OsEvent, OsPhase>>> = {
  nova: { atribuida: 'atribuida', cancelada: 'cancelada' },
  atribuida: { aceita: 'aceita', cancelada: 'cancelada', reagendada: 'reagendada' },
  aceita: { a_caminho: 'em_deslocamento', cancelada: 'cancelada', reagendada: 'reagendada' },
  em_deslocamento: { chegou: 'no_local', cancelada: 'cancelada', reagendada: 'reagendada' },
  no_local: { iniciada: 'em_execucao', cancelada: 'cancelada' },
  em_execucao: { pausada: 'pausada', concluida: 'concluida' },
  pausada: { retomada: 'em_execucao', cancelada: 'cancelada' },
  // reagendada volta ao começo do fluxo quando o despachante reatribui.
  reagendada: { atribuida: 'atribuida', cancelada: 'cancelada' },
  // Terminais.
  concluida: {},
  cancelada: {},
};

/** Fases terminais — nenhum evento sai delas. */
const TERMINAL_PHASES: readonly OsPhase[] = ['concluida', 'cancelada'];

/** Mapeia a fase interna para o status persistido em service_orders. */
export function phaseToStatus(phase: OsPhase): OsStatus {
  switch (phase) {
    case 'nova':
    case 'atribuida':
    case 'aceita':
    case 'reagendada':
      return 'pendente';
    case 'em_deslocamento':
      return 'em_deslocamento';
    case 'no_local':
    case 'em_execucao':
    case 'pausada':
      return 'em_atendimento';
    case 'concluida':
      return 'concluido';
    case 'cancelada':
      return 'cancelado';
  }
}

export function isTerminal(phase: OsPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

/** True se `event` é uma transição válida a partir de `from`. */
export function canTransition(from: OsPhase, event: OsEvent): boolean {
  return Boolean(TRANSITIONS[from]?.[event]);
}

/** Retorna a fase resultante, ou null se a transição for inválida. */
export function nextPhase(from: OsPhase, event: OsEvent): OsPhase | null {
  return TRANSITIONS[from]?.[event] ?? null;
}

/** Lista os eventos disponíveis a partir de uma fase (para a UI habilitar botões). */
export function allowedEvents(from: OsPhase): OsEvent[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as OsEvent[];
}

/**
 * Fase resultante de um evento, olhando SÓ para o evento. Cada evento leva a
 * exatamente uma fase — o que permite reconstruir a fase atual da OS a partir do
 * último `service_order_events` gravado, sem replay da história inteira.
 */
const EVENT_RESULT_PHASE: Record<OsEvent, OsPhase> = {
  criada: 'nova',
  atribuida: 'atribuida',
  aceita: 'aceita',
  a_caminho: 'em_deslocamento',
  chegou: 'no_local',
  iniciada: 'em_execucao',
  pausada: 'pausada',
  retomada: 'em_execucao',
  concluida: 'concluida',
  cancelada: 'cancelada',
  reagendada: 'reagendada',
};

export function phaseAfterEvent(event: OsEvent): OsPhase {
  return EVENT_RESULT_PHASE[event];
}

/**
 * Fase inicial para uma OS que ainda não tem eventos de ciclo de vida (ex.: criada
 * pelo ERP/operador). No fluxo de campo, uma OS que chega na agenda do técnico já
 * está atribuída — por isso 'pendente' entra como 'atribuida' (o técnico aceita).
 */
export function statusToInitialPhase(status: OsStatus): OsPhase {
  switch (status) {
    case 'pendente': return 'atribuida';
    case 'em_deslocamento': return 'em_deslocamento';
    case 'em_atendimento': return 'em_execucao';
    case 'concluido': return 'concluida';
    case 'cancelado': return 'cancelada';
  }
}

/**
 * Contexto de conclusão: o que existe na OS no momento em que se tenta concluir.
 * A regra de negócio (configurável por tipo de OS) exige checklist 100%, ≥1 foto
 * "depois" e assinatura do cliente — salvo justificativa explícita.
 */
export interface CompletionContext {
  checklistTotal: number;
  checklistDone: number;
  photosDepois: number;
  hasSignature: boolean;
  /** Justificativa livre — se preenchida, libera a conclusão mesmo com pendências. */
  justification?: string;
  /** Requisitos ligáveis/desligáveis por tipo de OS (default: todos exigidos). */
  requires?: {
    checklist?: boolean;
    photoDepois?: boolean;
    signature?: boolean;
  };
}

export interface CompletionGate {
  allowed: boolean;
  missing: string[];
}

/**
 * Avalia o gate de conclusão. Retorna o que falta; `allowed` é true quando nada
 * falta OU quando há justificativa. Puro — sem I/O.
 */
export function evaluateCompletionGate(ctx: CompletionContext): CompletionGate {
  const requires = {
    checklist: ctx.requires?.checklist ?? true,
    photoDepois: ctx.requires?.photoDepois ?? true,
    signature: ctx.requires?.signature ?? true,
  };

  const missing: string[] = [];
  if (requires.checklist && (ctx.checklistTotal === 0 || ctx.checklistDone < ctx.checklistTotal)) {
    missing.push('checklist incompleto');
  }
  if (requires.photoDepois && ctx.photosDepois < 1) {
    missing.push('foto "depois" obrigatória');
  }
  if (requires.signature && !ctx.hasSignature) {
    missing.push('assinatura do cliente');
  }

  const justified = Boolean(ctx.justification && ctx.justification.trim().length > 0);
  return { allowed: missing.length === 0 || justified, missing };
}

export interface TransitionInput {
  tenantId: string;
  serviceOrderId: string;
  technicianId: string;
  event: OsEvent;
  lat?: number;
  lng?: number;
  metadata?: Record<string, unknown>;
  /** Só usado quando event === 'concluida'. */
  completion?: CompletionContext;
}

export interface TransitionResult {
  ok: boolean;
  fromPhase?: OsPhase;
  toPhase?: OsPhase;
  status?: OsStatus;
  error?: string;
  missing?: string[];
}

export interface OsLifecyclePorts {
  /** Carrega a fase atual da OS (derivada do último evento). Null se OS não existe. */
  getCurrentPhase: (tenantId: string, serviceOrderId: string) => Promise<OsPhase | null>;
  /** Persiste o evento imutável em service_order_events. */
  recordEvent: (input: {
    tenantId: string;
    serviceOrderId: string;
    technicianId: string;
    event: OsEvent;
    lat?: number;
    lng?: number;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  /** Atualiza service_orders.status. */
  updateStatus: (tenantId: string, serviceOrderId: string, status: OsStatus) => Promise<void>;
}

/**
 * Orquestra uma transição: valida a fase → (se conclusão) avalia o gate →
 * grava evento → atualiza status. Retorna erro estruturado em vez de lançar,
 * para o endpoint responder 409/422 de forma limpa.
 */
export async function applyTransition(
  input: TransitionInput,
  ports: OsLifecyclePorts,
): Promise<TransitionResult> {
  const current = await ports.getCurrentPhase(input.tenantId, input.serviceOrderId);
  if (current === null) {
    return { ok: false, error: 'OS não encontrada' };
  }

  if (isTerminal(current)) {
    return { ok: false, fromPhase: current, error: `OS já está em estado terminal (${current})` };
  }

  const to = nextPhase(current, input.event);
  if (!to) {
    return {
      ok: false,
      fromPhase: current,
      error: `Transição inválida: '${input.event}' não é permitido a partir de '${current}'`,
    };
  }

  // Gate de conclusão: só concluir com checklist/foto/assinatura (ou justificativa).
  if (input.event === 'concluida') {
    const gate = evaluateCompletionGate(input.completion ?? {
      checklistTotal: 0, checklistDone: 0, photosDepois: 0, hasSignature: false,
    });
    if (!gate.allowed) {
      return { ok: false, fromPhase: current, error: 'Conclusão bloqueada', missing: gate.missing };
    }
  }

  await ports.recordEvent({
    tenantId: input.tenantId,
    serviceOrderId: input.serviceOrderId,
    technicianId: input.technicianId,
    event: input.event,
    lat: input.lat,
    lng: input.lng,
    metadata: input.metadata,
  });

  const status = phaseToStatus(to);
  await ports.updateStatus(input.tenantId, input.serviceOrderId, status);

  return { ok: true, fromPhase: current, toPhase: to, status };
}
