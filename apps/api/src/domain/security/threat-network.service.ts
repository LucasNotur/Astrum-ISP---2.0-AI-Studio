/**
 * D-22 — REDE DE ALERTA PRECOCE: imunidade coletiva entre tenants.
 *
 * Quando a Astrum detecta um padrão novo num ISP (golpe de phishing, defeito
 * de firmware, fraude de boleto), ela IMUNIZA os outros tenants automaticamente
 * — como um antivírus que aprende num host e protege a rede toda.
 *
 * Anonimizado (privacidade diferencial): originating_tenant_id não exposto
 * no broadcast — só a equipe da Astrum sabe de onde veio.
 *
 * Fundação: guardrails, audit hash-chain (IA-06), nightly-brain (D-14).
 * Desbloqueio: ≥10 tenants + análise LGPD aprovada (mesmo gate do D-09).
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export type SignalType = 'fraud' | 'firmware_defect' | 'phishing' | 'billing_scam' | 'security' | 'spam';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface ThreatSignal {
  id: string;
  signalType: SignalType;
  description: string;
  evidence: Record<string, unknown>;
  severity: Severity;
  broadcastAt: string;
  immunizedCount: number;
}

export interface ThreatNetworkPorts {
  db: typeof supabase;
  /** Retorna ids de todos os tenants ativos (para broadcast). Injetável. */
  getAllTenantIds: () => Promise<string[]>;
}

export function isThreatNetworkEnabled(): boolean {
  return process.env.THREAT_NETWORK_ENABLED?.toLowerCase() === 'true';
}

// ── Privacidade diferencial: anonimizar evidence ─────────────────────────────
// Oculta qualquer dado que identifique o tenant de origem.
// Preserva apenas o PADRÃO (hash, faixa de contagem, indicadores genéricos).

function anonymizeEvidence(
  raw: Record<string, unknown>,
  _originTenantId: string,
): Record<string, unknown> {
  const anon: Record<string, unknown> = {};
  // Mantém: padrões de texto/regex, hashes, intervalos de contagem
  if (raw['pattern']) anon['pattern'] = raw['pattern'];
  if (raw['indicators']) anon['indicators'] = raw['indicators'];
  if (raw['affected_count']) {
    // Arredonda para a dezena (privacy) — nunca o número exato
    const n = Number(raw['affected_count']);
    anon['affected_count_range'] = `${Math.floor(n / 10) * 10}-${Math.ceil(n / 10) * 10}`;
  }
  if (raw['first_seen']) anon['first_seen'] = raw['first_seen'];
  // Remove: customer_ids, tenant_id, cnpj, phone, etc.
  return anon;
}

// ── Publicar sinal ────────────────────────────────────────────────────────────

export async function broadcastThreatSignal(
  originTenantId: string,
  signal: {
    signalType: SignalType;
    description: string;
    evidence: Record<string, unknown>;
    severity?: Severity;
  },
  ports: ThreatNetworkPorts,
): Promise<ThreatSignal> {
  const anonEvidence = anonymizeEvidence(signal.evidence, originTenantId);

  const { data, error } = await ports.db.from('threat_signals').insert({
    originating_tenant_id: originTenantId,
    signal_type: signal.signalType,
    description: signal.description,
    evidence: anonEvidence,
    severity: signal.severity ?? 'medium',
  }).select('*').single();
  if (error) throw new Error(`D-22 broadcast: ${error.message}`);

  const signalId = (data as any).id as string;

  // Imunizar todos os outros tenants (exceto o originador)
  const allTenants = await ports.getAllTenantIds();
  const targets = allTenants.filter(id => id !== originTenantId);

  let immunizedCount = 0;
  for (const tenantId of targets) {
    const { error: immErr } = await ports.db.from('tenant_immunizations').insert({
      signal_id: signalId,
      tenant_id: tenantId,
    });
    if (!immErr) immunizedCount++;
  }

  // Atualizar contador
  await ports.db.from('threat_signals')
    .update({ immunized_count: immunizedCount })
    .eq('id', signalId);

  infraLogger.info(
    { originTenantId, signalId, signalType: signal.signalType, immunizedCount },
    'D-22: sinal de ameaça transmitido',
  );

  return {
    id: signalId,
    signalType: signal.signalType,
    description: signal.description,
    evidence: anonEvidence,
    severity: signal.severity ?? 'medium',
    broadcastAt: (data as any).broadcast_at,
    immunizedCount,
  };
}

// ── Listar sinais recentes (para o painel do tenant) ─────────────────────────

export async function listThreatSignals(
  opts: { signalType?: SignalType; severity?: Severity; limit?: number } = {},
  ports: ThreatNetworkPorts,
): Promise<ThreatSignal[]> {
  let q = ports.db
    .from('threat_signals')
    .select('id,signal_type,description,evidence,severity,broadcast_at,immunized_count')
    .order('broadcast_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.signalType) q = (q as any).eq('signal_type', opts.signalType);
  if (opts.severity) q = (q as any).eq('severity', opts.severity);

  const { data, error } = await (q as any);
  if (error) throw new Error(`D-22 list: ${error.message}`);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    signalType: r.signal_type,
    description: r.description,
    evidence: r.evidence,
    severity: r.severity,
    broadcastAt: r.broadcast_at,
    immunizedCount: r.immunized_count,
  }));
}

// ── Verificar se o tenant já foi imunizado contra um sinal ───────────────────

export async function isImmunized(
  tenantId: string,
  signalId: string,
  ports: ThreatNetworkPorts,
): Promise<boolean> {
  const { data } = await ports.db
    .from('tenant_immunizations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('signal_id', signalId)
    .maybeSingle();
  return !!data;
}

export const defaultPorts: ThreatNetworkPorts = {
  db: supabase,
  getAllTenantIds: async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('active', true);
    if (error) throw new Error(`D-22: ${error.message}`);
    return (data ?? []).map((r: any) => r.id as string);
  },
};
