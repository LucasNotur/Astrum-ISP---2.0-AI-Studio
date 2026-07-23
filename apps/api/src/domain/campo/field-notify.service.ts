/**
 * PLANO I (Uber do Técnico) — Fase I-4 — Notificação "a caminho" ao cliente.
 *
 * Parte pura: monta a mensagem de WhatsApp que o cliente recebe quando o técnico
 * sai para o local (a experiência "seu motorista está a caminho" do Uber). O envio
 * em si acontece na rota, reusando o adapter de WhatsApp existente (Evolution).
 *
 * Gated por flag: enviar mensagem a cliente real é efeito colateral — só dispara
 * quando FIELD_WHATSAPP_NOTIFY_ENABLED=true (default off).
 */

export interface OnTheWayContext {
  customerName?: string | null;
  technicianName?: string | null;
  etaMinutes?: number | null;
  trackingUrl?: string | null;
}

/** Mensagem PT-BR de "técnico a caminho". Pura e testável. */
export function buildOnTheWayMessage(ctx: OnTheWayContext): string {
  const nome = (ctx.customerName ?? '').trim() || 'Olá';
  const tecnico = (ctx.technicianName ?? '').trim() || 'nosso técnico';

  const partes: string[] = [];
  partes.push(`Olá ${nome}!`);
  if (ctx.etaMinutes != null && ctx.etaMinutes > 0) {
    partes.push(`${tecnico} está a caminho e chega em aproximadamente ${ctx.etaMinutes} min.`);
  } else {
    partes.push(`${tecnico} está a caminho.`);
  }
  if (ctx.trackingUrl && ctx.trackingUrl.trim()) {
    partes.push(`Acompanhe em: ${ctx.trackingUrl.trim()}`);
  }
  return partes.join(' ');
}

/** Normaliza telefone para o formato numérico esperado pela Evolution API. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Prefixa 55 (Brasil) se vier sem DDI.
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function isFieldWhatsappNotifyEnabled(): boolean {
  return (process.env.FIELD_WHATSAPP_NOTIFY_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export function isFieldSummaryLlmEnabled(): boolean {
  return (process.env.FIELD_SUMMARY_LLM_ENABLED ?? '').trim().toLowerCase() === 'true';
}
