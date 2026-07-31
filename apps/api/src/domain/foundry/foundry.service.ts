/**
 * D-16 — FOUNDRY: automações sob medida geradas por linguagem natural.
 *
 * O dono escreve "toda sexta 18h, me manda no WhatsApp os 10 clientes com maior
 * risco de churn que ainda não receberam oferta" → agente gera a query + schedule
 * + template, valida pelo sql-guard (IA-44), instala para aquele tenant.
 *
 * Por que é inédito: é o FIM da guerra de features. Concorrente lança feature;
 * a Astrum lança a FÁBRICA de features.
 *
 * Fundação: tool registry (IA-19), sql-guard (IA-44), BullMQ, templates HSM.
 * Desbloqueio: 5+ tenants ativos pedindo coisas diferentes.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { callOpenAI } from '../../adapters/openai/openai.adapter';
import { validateSql, SqlGuardError } from '../../infrastructure/sandbox/sql-guard';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface AutomationResult {
  automationId: string;
  name: string;
  generatedQuery: string;
  schedule: string;
  outputAction: string;
  status: string;
  validationPassed: boolean;
  validationError?: string;
}

export interface FoundryPorts {
  db: typeof supabase;
  /** Chamada ao LLM para gerar query + schedule. Injetável para testes. */
  generateAutomation: (prompt: string, tenantId: string) => Promise<{
    name: string;
    query: string;
    schedule: string;
    templateName: string;
    outputAction: string;
  }>;
}

export function isFoundryEnabled(): boolean {
  return process.env.FOUNDRY_ENABLED?.toLowerCase() === 'true';
}

// ── Tabelas permitidas no Foundry (subconjunto do sql-guard normal) ───────────

const FOUNDRY_ALLOWED_TABLES = [
  'customers', 'invoices', 'conversations', 'tickets',
  'churn_scores', 'network_ctos', 'feature_store_values', 'campaign_variants',
];

function validateFoundryQuery(sql: string, tenantId: string): { valid: boolean; error?: string } {
  try {
    // Usa o sql-guard existente (IA-44)
    validateSql(sql, tenantId);
    // Verifica tabelas adicionalmente
    const tableRe = /\bFROM\s+(\w+)/gi;
    let m;
    while ((m = tableRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase();
      if (!FOUNDRY_ALLOWED_TABLES.includes(table)) {
        return { valid: false, error: `Tabela "${table}" não permitida no Foundry. Permitidas: ${FOUNDRY_ALLOWED_TABLES.join(', ')}` };
      }
    }
    return { valid: true };
  } catch (e: any) {
    if (e instanceof SqlGuardError) return { valid: false, error: e.message };
    return { valid: false, error: String(e) };
  }
}

// ── Criar automação ───────────────────────────────────────────────────────────

export async function createAutomation(
  tenantId: string,
  nlPrompt: string,
  createdBy: string,
  ports: FoundryPorts,
): Promise<AutomationResult> {
  // 1. Gerar query + schedule via LLM
  const generated = await ports.generateAutomation(nlPrompt, tenantId);

  // 2. Validar via sql-guard (inviolável — RN14 + IA-44)
  const validation = validateFoundryQuery(generated.query, tenantId);

  // 3. Salvar no banco
  const { data, error } = await ports.db.from('automations').insert({
    tenant_id: tenantId,
    name: generated.name,
    nl_prompt: nlPrompt,
    generated_query: validation.valid ? generated.query : null,
    schedule: generated.schedule,
    template_name: generated.templateName,
    output_action: generated.outputAction,
    status: validation.valid ? 'draft' : 'error',
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw new Error(`D-16: ${error.message}`);

  const automationId = (data as any).id as string;
  infraLogger.info({ tenantId, automationId, valid: validation.valid }, 'D-16: automação criada');

  return {
    automationId,
    name: generated.name,
    generatedQuery: generated.query,
    schedule: generated.schedule,
    outputAction: generated.outputAction,
    status: validation.valid ? 'draft' : 'error',
    validationPassed: validation.valid,
    validationError: validation.error,
  };
}

export async function activateAutomation(
  tenantId: string,
  automationId: string,
  ports: FoundryPorts,
): Promise<void> {
  const { data: auto, error } = await ports.db
    .from('automations').select('*').eq('id', automationId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw new Error(`D-16: ${error.message}`);
  if (!auto) throw new Error('D-16: automação não encontrada');
  if ((auto as any).status === 'error') throw new Error('D-16: automação inválida (sql-guard falhou)');

  await ports.db.from('automations').update({
    status: 'active',
    updated_at: new Date().toISOString(),
  }).eq('id', automationId).eq('tenant_id', tenantId);

  // TODO: registrar no BullMQ repeat com a schedule (integrar com nightly-brain queue)
  infraLogger.info({ tenantId, automationId }, 'D-16: automação ativada');
}

export async function listAutomations(
  tenantId: string,
  ports: FoundryPorts,
): Promise<any[]> {
  const { data, error } = await ports.db
    .from('automations')
    .select('id,name,nl_prompt,schedule,output_action,status,last_run_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`D-16: ${error.message}`);
  return data ?? [];
}

// ── LLM generator (produção) ─────────────────────────────────────────────────

async function llmGenerateAutomation(nlPrompt: string, _tenantId: string) {
  const SYSTEM = `
Você é um gerador de automações para provedores de internet (ISPs).
A partir de uma requisição em linguagem natural, gere:
1. name: nome curto da automação (max 60 chars)
2. query: SQL SELECT válido e seguro (apenas leitura, sem DML)
   - Tabelas permitidas: customers, invoices, conversations, tickets, churn_scores, network_ctos
   - Sempre inclua WHERE tenant_id = '${_tenantId}' e LIMIT 50
3. schedule: cron expression compatível com BullMQ (ex: "0 18 * * 5" = sexta 18h)
4. templateName: nome do template HSM para o WhatsApp (ex: "churn_alert_v1" ou "default")
5. outputAction: um de: list, send_whatsapp, create_campaign, export_csv

Responda APENAS com JSON válido, sem markdown:
{"name":"...","query":"...","schedule":"...","templateName":"...","outputAction":"..."}`;

  const resp = await callOpenAI({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: nlPrompt },
    ],
    max_tokens: 500,
    temperature: 0.1,
  });

  const content = resp.choices[0]?.message?.content?.trim() ?? '{}';
  try {
    return JSON.parse(content);
  } catch {
    return {
      name: 'Automação gerada',
      query: `SELECT id, name FROM customers WHERE tenant_id = '${_tenantId}' LIMIT 50`,
      schedule: '0 9 * * 1',
      templateName: 'default',
      outputAction: 'list',
    };
  }
}

export const defaultPorts: FoundryPorts = {
  db: supabase,
  generateAutomation: llmGenerateAutomation,
};
