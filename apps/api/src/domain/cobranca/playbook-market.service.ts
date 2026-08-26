/**
 * D-17 — MARKETPLACE DE PLAYBOOKS com prova via backtesting D-02.
 *
 * Régua de cobrança do ISP de Minas que recupera 22% a mais vira "playbook"
 * instalável por qualquer tenant — COM backtesting D-02 provando o ganho no
 * histórico do comprador ANTES de ativar. ISPs não competem entre si (geografia)
 * → compartilham de graça. Efeito de rede que nenhum ERP tem.
 *
 * Fundação: D-02 (validador), IA-26 (execução), policy-backtest.service.ts.
 * Desbloqueio: ≥10 tenants + D-02 rodando com dados reais.
 */
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { backtestPolicy, type CobrancaPolicy } from './policy-backtest.service';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface PlaybookResult {
  playbookId: string;
  name: string;
  category: string;
  metrics: Record<string, unknown>;
}

export interface PlaybookInstallResult {
  installId: string;
  playbookId: string;
  backtestResult: Record<string, unknown> | null;
  activated: boolean;
}

export interface PlaybookPorts {
  db: typeof supabase;
}

export const defaultPorts: PlaybookPorts = { db: supabase };

// ── Publicar playbook ─────────────────────────────────────────────────────────

export async function publishPlaybook(
  tenantId: string,
  payload: {
    name: string;
    description?: string;
    category?: string;
    policy: CobrancaPolicy;
    metrics?: Record<string, unknown>;
  },
  ports: PlaybookPorts = defaultPorts,
): Promise<PlaybookResult> {
  const { data, error } = await ports.db.from('playbooks').insert({
    name: payload.name,
    description: payload.description,
    category: payload.category ?? 'cobranca',
    policy: payload.policy as unknown as Record<string, unknown>,
    metrics: payload.metrics ?? {},
    published_by: tenantId,
    is_public: true,
  }).select('id,name,category,metrics').single();
  if (error) throw new Error(`D-17 publish: ${error.message}`);

  infraLogger.info({ tenantId, playbookId: (data as any).id }, 'D-17: playbook publicado');
  return {
    playbookId: (data as any).id,
    name: (data as any).name,
    category: (data as any).category,
    metrics: (data as any).metrics ?? {},
  };
}

// ── Listar playbooks ──────────────────────────────────────────────────────────

export async function listPlaybooks(
  category: string | undefined,
  ports: PlaybookPorts = defaultPorts,
): Promise<any[]> {
  let q = ports.db
    .from('playbooks')
    .select('id,name,description,category,metrics,downloads,published_at')
    .eq('is_public', true)
    .order('downloads', { ascending: false });
  if (category) q = (q as any).eq('category', category);
  const { data, error } = await (q as any);
  if (error) throw new Error(`D-17 list: ${error.message}`);
  return data ?? [];
}

// ── Instalar com backtest ─────────────────────────────────────────────────────

/**
 * Instala um playbook para o tenant, executando o backtesting D-02 no histórico
 * do comprador ANTES de ativar — provando o ganho com os próprios dados.
 *
 * Se skipBacktest=true (quando não há histórico suficiente), instala sem provar.
 */
export async function installPlaybook(
  tenantId: string,
  playbookId: string,
  opts: { skipBacktest?: boolean; activateAfterInstall?: boolean } = {},
  ports: PlaybookPorts = defaultPorts,
): Promise<PlaybookInstallResult> {
  // 1. Carregar o playbook
  const { data: pb, error: pbErr } = await ports.db
    .from('playbooks').select('*').eq('id', playbookId).maybeSingle();
  if (pbErr) throw new Error(`D-17: ${pbErr.message}`);
  if (!pb) throw new Error(`D-17: playbook ${playbookId} não encontrado`);

  // 2. Rodar backtest no histórico do tenant comprador (a "prova" prometida)
  let backtestResult: Record<string, unknown> | null = null;
  if (!opts.skipBacktest) {
    try {
      const policy = (pb as any).policy as CobrancaPolicy;
      const bt = await backtestPolicy(tenantId, policy, {}, ports.db);
      backtestResult = {
        baseProjection: bt.projectedGainCents.base,
        pessimisticProjection: bt.projectedGainCents.pessimista,
        optimisticProjection: bt.projectedGainCents.otimista,
        invoiceCount: bt.baseline.invoicesTotal,
        disclaimer: bt.disclaimer,
      };
    } catch (e: any) {
      backtestResult = { error: e.message, note: 'backtest indisponível — dados insuficientes' };
    }
  }

  // 3. Registrar instalação
  const { data: install, error: insErr } = await ports.db.from('playbook_installs').upsert({
    playbook_id: playbookId,
    tenant_id: tenantId,
    backtest_result: backtestResult,
    activated: opts.activateAfterInstall ?? false,
    installed_at: new Date().toISOString(),
  }, { onConflict: 'playbook_id,tenant_id' }).select('id').single();
  if (insErr) throw new Error(`D-17 install: ${insErr.message}`);

  // 4. Incrementar downloads (fire-and-forget: contador não deve travar a instalação)
  const { error: downloadsErr } = await ports.db.from('playbooks')
    .update({ downloads: (pb as any).downloads + 1 })
    .eq('id', playbookId);
  if (downloadsErr) {
    infraLogger.warn({ tenantId, playbookId, err: downloadsErr }, 'D-17: falha ao incrementar contador de downloads');
  }

  infraLogger.info({ tenantId, playbookId }, 'D-17: playbook instalado');
  return {
    installId: (install as any).id,
    playbookId,
    backtestResult,
    activated: opts.activateAfterInstall ?? false,
  };
}

export async function activateInstalledPlaybook(
  tenantId: string,
  playbookId: string,
  ports: PlaybookPorts = defaultPorts,
): Promise<void> {
  const { error } = await ports.db.from('playbook_installs')
    .update({ activated: true })
    .eq('tenant_id', tenantId)
    .eq('playbook_id', playbookId);
  if (error) throw new Error(`D-17 activate: ${error.message}`);
  infraLogger.info({ tenantId, playbookId }, 'D-17: playbook ativado como política bandit');
}
