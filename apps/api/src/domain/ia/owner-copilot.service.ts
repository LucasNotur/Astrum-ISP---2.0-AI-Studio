/**
 * D-20 — COPILOTO DO DONO: o CEO conversa com a Astrum em linguagem natural.
 *
 * "Por que meu churn subiu em março?", "Quais 20 clientes devo ligar hoje?",
 * "Vale a pena abrir no bairro X?" → resposta com dados + AÇÃO (cria campanha,
 * lista, etc.). É o Foundry (D-16) virado para análise, não automação recorrente.
 *
 * Por que é inédito: BI dos ERPs é dashboard estático. Perguntar e receber
 * resposta+ação sobre os dados vivos do próprio negócio não existe no segmento.
 *
 * Fundação: sql-guard (IA-44), MCP (IA-17), DuckDB (analytics), nightly-brain.
 * Desbloqueio: dados reais + sql-guard ligado.
 */
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { callOpenAI } from '../../adapters/openai/openai.adapter';
import { validateSql, SqlGuardError } from '../../infrastructure/sandbox/sql-guard';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface CopilotAnswer {
  question: string;
  answer: string;
  data?: Record<string, unknown>[];
  actionSuggested?: {
    type: 'create_campaign' | 'export_list' | 'open_foundry' | 'none';
    label: string;
    payload?: Record<string, unknown>;
  };
  sqlUsed?: string;
  disclaimer?: string;
}

export interface OwnerCopilotPorts {
  db: typeof supabase;
  /** Executa SQL read-only no sandbox (IA-44). Injetável. */
  runSafeQuery: (sql: string, tenantId: string) => Promise<Record<string, unknown>[]>;
}

// ── Prompt do copiloto ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
Você é o Copiloto do Dono da Astrum — o assistente de análise do provedor de internet.

Você tem acesso read-only ao banco de dados do provedor. Responda perguntas do dono
sobre o negócio usando dados reais. Quando fizer sentido, gere um SELECT SQL para
buscar os dados (o sistema irá executá-lo com segurança). Depois sintetize a resposta
em linguagem natural, em português brasileiro, de forma direta e executável.

Regras de SQL:
- Apenas SELECT (sem INSERT, UPDATE, DELETE, DROP)
- Tabelas disponíveis: customers, invoices, conversations, tickets, churn_scores,
  network_ctos, feature_store_values, campaign_variants, service_orders
- Sempre incluir WHERE tenant_id = '$TENANT_ID' e LIMIT adequado (máx 200)
- Para aggregations (contagem, médias, somas), usar GROUP BY quando necessário

Formato de resposta JSON:
{
  "answer": "resposta em linguagem natural (1-3 parágrafos)",
  "sql": "SELECT opcional para buscar dados — null se não precisar",
  "action": {
    "type": "create_campaign | export_list | open_foundry | none",
    "label": "O que fazer a seguir",
    "payload": {}
  }
}`;

// ── Responder pergunta ────────────────────────────────────────────────────────

export async function askCopilot(
  tenantId: string,
  question: string,
  ports: OwnerCopilotPorts,
): Promise<CopilotAnswer> {
  // 1. Chamar GPT-4o para interpretar a pergunta e gerar SQL
  const systemWithTenant = SYSTEM_PROMPT.replace('$TENANT_ID', tenantId);
  const resp = await callOpenAI({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemWithTenant },
      { role: 'user', content: question },
    ],
    max_tokens: 1500,
    temperature: 0.2,
  });

  const raw = resp.content.trim() || '{}';
  let parsed: { answer: string; sql?: string | null; action?: any } = { answer: 'Não consegui interpretar a pergunta.' };
  try {
    // Remover markdown fence se presente
    const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(clean);
  } catch {
    parsed = { answer: raw, sql: null };
  }

  // 2. Executar SQL se gerou um (validado pelo sql-guard antes)
  let data: Record<string, unknown>[] = [];
  let sqlUsed: string | undefined;
  if (parsed.sql) {
    try {
      validateSql(parsed.sql);
      data = await ports.runSafeQuery(parsed.sql, tenantId);
      sqlUsed = parsed.sql;
    } catch (e: any) {
      if (e instanceof SqlGuardError) {
        infraLogger.warn({ tenantId, sql: parsed.sql, err: e.message }, 'D-20: sql-guard rejeitou query do copiloto');
        parsed.answer += '\n\n(Nota: a consulta gerada foi bloqueada pelo validador de segurança. Tente reformular a pergunta.)';
      } else {
        throw e;
      }
    }
  }

  // 3. Se há dados, refinar a resposta com os números reais
  let finalAnswer = parsed.answer;
  if (data.length > 0) {
    const summary = await callOpenAI({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Você é um analista de negócios. Sintetize os dados em 1-2 frases diretas em português.' },
        { role: 'user', content: `Pergunta: ${question}\n\nDados: ${JSON.stringify(data.slice(0, 20))}\n\nAnálise prévia: ${finalAnswer}` },
      ],
      max_tokens: 300,
    });
    finalAnswer = summary.content.trim() || finalAnswer;
  }

  infraLogger.info({ tenantId, hasData: data.length > 0, hasAction: !!parsed.action?.type }, 'D-20: copiloto respondeu');

  return {
    question,
    answer: finalAnswer,
    data: data.length > 0 ? data.slice(0, 50) : undefined,
    sqlUsed,
    actionSuggested: parsed.action?.type && parsed.action.type !== 'none'
      ? { type: parsed.action.type, label: parsed.action.label, payload: parsed.action.payload }
      : { type: 'none', label: '' },
    disclaimer: data.length === 0 ? undefined : 'Dados lidos diretamente do seu banco em tempo real.',
  };
}

export const defaultPorts: OwnerCopilotPorts = {
  db: supabase,
  runSafeQuery: async (sql, tenantId) => {
    // Usa o sandbox do IA-44 (executeQuery) quando configurado; fallback Supabase
    const { executeQuery, isSandboxConfigured } = await import('../../infrastructure/sandbox/sandbox-db.service');
    if (isSandboxConfigured()) {
      const result = await executeQuery(tenantId, 'owner-copilot', sql);
      return result.rows.map((row) =>
        Object.fromEntries(result.columns.map((col, i) => [col, row[i] ?? null])),
      );
    }
    // Fallback: não há sandbox configurado
    infraLogger.warn({ tenantId }, 'D-20: sandbox não configurado, query não executada');
    return [];
  },
};
