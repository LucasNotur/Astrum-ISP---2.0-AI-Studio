/**
 * Dossiê #56 — Web Widget Customizável.
 * Widget de chat embeddable que o ISP coloca no site do assinante.
 * Configuração visual por tenant, geração de script embed,
 * rate limiting por IP e sanitização de entrada.
 */

export interface WidgetConfig {
  tenantId: string;
  primaryColor: string;
  greeting: string;
  position: 'bottom-right' | 'bottom-left';
  avatarUrl?: string;
  offlineMessage: string;
  collectEmail: boolean;
  allowAttachments: boolean;
  businessHours?: { start: string; end: string; timezone: string };
}

export interface WidgetMessage {
  tenantId: string;
  sessionId: string;
  visitorIp: string;
  visitorName?: string;
  visitorEmail?: string;
  text: string;
  timestamp: string;
}

export interface WidgetPorts {
  getConfig: (tenantId: string) => Promise<WidgetConfig | null>;
  saveConfig: (config: WidgetConfig) => Promise<WidgetConfig>;
  createSession: (tenantId: string, visitorIp: string, visitorEmail?: string) => Promise<{ sessionId: string }>;
  sendMessage: (msg: WidgetMessage) => Promise<{ messageId: string }>;
  countMessagesLastMinute: (visitorIp: string) => Promise<number>;
}

const RATE_LIMIT_PER_MINUTE = 10;
const MAX_MESSAGE_LENGTH = 2000;

export function validateColor(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

export function isWithinBusinessHours(config: WidgetConfig, nowUtcHour: number): boolean {
  if (!config.businessHours) return true;
  const startHour = parseInt(config.businessHours.start.split(':')[0], 10);
  const endHour = parseInt(config.businessHours.end.split(':')[0], 10);
  return nowUtcHour >= startHour && nowUtcHour < endHour;
}

export function generateEmbedScript(tenantId: string, baseUrl: string): string {
  return `<script>
(function(){var d=document,s=d.createElement('script');
s.src='${baseUrl}/widget/${tenantId}/loader.js';
s.async=true;d.head.appendChild(s);})();
</script>`;
}

export function sanitizeMessage(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/javascript:/gi, '')
    .slice(0, MAX_MESSAGE_LENGTH);
}

export async function validateWidgetConfig(config: WidgetConfig): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  if (!validateColor(config.primaryColor)) errors.push('Cor primária inválida (use formato #RRGGBB)');
  if (!config.greeting || config.greeting.length < 3) errors.push('Saudação deve ter pelo menos 3 caracteres');
  if (!config.offlineMessage || config.offlineMessage.length < 3) errors.push('Mensagem offline deve ter pelo menos 3 caracteres');
  if (config.businessHours) {
    const start = parseInt(config.businessHours.start.split(':')[0], 10);
    const end = parseInt(config.businessHours.end.split(':')[0], 10);
    if (isNaN(start) || isNaN(end) || start >= end) errors.push('Horário comercial inválido');
  }
  return { valid: errors.length === 0, errors };
}

export async function handleWidgetMessage(
  tenantId: string,
  visitorIp: string,
  sessionId: string,
  text: string,
  ports: WidgetPorts,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const config = await ports.getConfig(tenantId);
  if (!config) return { ok: false, error: 'Widget não configurado' };

  const recentCount = await ports.countMessagesLastMinute(visitorIp);
  if (recentCount >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, error: 'Limite de mensagens por minuto excedido' };
  }

  const sanitized = sanitizeMessage(text);
  if (sanitized.trim().length === 0) return { ok: false, error: 'Mensagem vazia' };

  const msg: WidgetMessage = {
    tenantId,
    sessionId,
    visitorIp,
    text: sanitized,
    timestamp: new Date().toISOString(),
  };

  try {
    const { messageId } = await ports.sendMessage(msg);
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
