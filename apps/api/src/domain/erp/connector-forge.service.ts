/**
 * D-13 — CONECTORES QUE SE ESCREVEM SOZINHOS: agente codificador gera adapter
 * ERP a partir da doc da API, gera testes de contrato, e abre artefato para revisão.
 *
 * Desbloqueio: 2+ pedidos de ERP fora do top-5 (IXC/Voalle/MK/SGP/Hubsoft).
 * Tempo de suporte a ERP novo: de semanas para HORAS.
 *
 * Fundação real:
 * - 5 adapters existentes como few-shot perfeito (apps/api/src/adapters/erp/*)
 * - IErpAdapter interface estável (erp.factory.ts)
 * - CI com vitest
 */
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { callOpenAI } from '../../adapters/openai/openai.adapter';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface ConnectorDraftResult {
  draftId: string;
  erpName: string;
  status: string;
  generatedCode?: string;
  testResults: { test: string; passed: boolean; output: string }[];
}

export interface ConnectorForgePorts {
  db: typeof supabase;
  /** Retorna o código-fonte de um adapter existente como few-shot. Injetável. */
  loadFewShotAdapter: () => Promise<string>;
  /** Executa os testes gerados em sandbox. Injetável para testes. */
  runGeneratedTests: (code: string, tests: string) => Promise<{ test: string; passed: boolean; output: string }[]>;
}

export function isConnectorForgeEnabled(): boolean {
  return process.env.CONNECTOR_FORGE_ENABLED?.toLowerCase() === 'true';
}

// ── Few-shot loader: lê o adapter IXC como exemplo de referência ─────────────

async function loadIxcAdapterCode(): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const adapterPath = path.join(process.cwd(), 'src/adapters/erp/ixc.adapter.ts');
  try {
    return await fs.readFile(adapterPath, 'utf-8');
  } catch {
    // Fallback compacto para testes
    return `
export class IxcAdapter implements IErpAdapter {
  async getCustomers(tenantId: string): Promise<ErpCustomer[]> { ... }
  async getInvoices(tenantId: string): Promise<ErpInvoice[]> { ... }
  async suspendService(customerId: string): Promise<void> { ... }
}`;
  }
}

// ── Gerar adapter ─────────────────────────────────────────────────────────────

export async function generateConnectorDraft(
  erpName: string,
  apiSpec: Record<string, unknown>,
  requestedBy: string,
  ports: ConnectorForgePorts,
): Promise<ConnectorDraftResult> {
  // 1. Criar draft
  const { data: draft, error: insErr } = await ports.db
    .from('connector_drafts').insert({
      erp_name: erpName,
      api_spec: apiSpec,
      requested_by: requestedBy,
      status: 'generating',
    }).select('id').single();
  if (insErr) throw new Error(`D-13: ${insErr.message}`);
  const draftId = (draft as any).id as string;

  try {
    // 2. Few-shot: pegar exemplo real
    const fewShot = await ports.loadFewShotAdapter();

    // 3. Gerar código com GPT-4o
    const prompt = `
Você é um engenheiro de software especialista em integrações ERP para ISPs brasileiros.

Abaixo está um adapter existente (IXC) como REFERÊNCIA de padrão:
\`\`\`typescript
${fewShot.slice(0, 3000)}
\`\`\`

A interface IErpAdapter tem estes métodos obrigatórios:
- getCustomers(tenantId: string): Promise<ErpCustomer[]>
- getInvoices(tenantId: string): Promise<ErpInvoice[]>
- suspendService(customerId: string): Promise<void>
- reactivateService(customerId: string): Promise<void>
- getServiceOrders?(tenantId: string): Promise<any[]>

Gere um adapter TypeScript completo para o ERP "${erpName}" com base nesta especificação da API:
${JSON.stringify(apiSpec, null, 2).slice(0, 2000)}

REGRAS:
1. Seguir EXATAMENTE o padrão do IXC adapter (mesma estrutura de classe, imports, tratamento de erro)
2. Nome da classe: ${erpName.replace(/[^a-zA-Z]/g, '')}Adapter
3. Incluir comentários explicando endpoints mapeados
4. Incluir versão mínima de testes Vitest no mesmo arquivo (describe + it)

Retorne APENAS o código TypeScript, sem markdown, sem explicação.`;

    const response = await callOpenAI({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
    });
    const generatedCode = response.content ?? '';

    // 4. Gerar e executar testes básicos de contrato
    const testResults = await ports.runGeneratedTests(generatedCode, `
describe('${erpName} adapter contract', () => {
  it('should export a class named ${erpName.replace(/[^a-zA-Z]/g, '')}Adapter', () => {
    expect(generatedCode).toContain('class ${erpName.replace(/[^a-zA-Z]/g, '')}Adapter');
  });
  it('should implement getCustomers', () => {
    expect(generatedCode).toContain('getCustomers');
  });
  it('should implement getInvoices', () => {
    expect(generatedCode).toContain('getInvoices');
  });
  it('should implement suspendService', () => {
    expect(generatedCode).toContain('suspendService');
  });
});`);

    const allPassed = testResults.every(r => r.passed);
    const status = allPassed ? 'ready' : 'testing';

    const { error: updErr } = await ports.db.from('connector_drafts').update({
      generated_code: generatedCode,
      test_results: testResults,
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', draftId);
    if (updErr) infraLogger.error({ error: updErr, draftId }, 'D-13: falha ao salvar código gerado');

    infraLogger.info({ draftId, erpName, allPassed }, 'D-13: connector draft gerado');
    return { draftId, erpName, status, generatedCode, testResults };
  } catch (err: any) {
    const { error: failUpdErr } = await ports.db.from('connector_drafts').update({
      status: 'failed',
      notes: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', draftId);
    if (failUpdErr) infraLogger.error({ error: failUpdErr, draftId }, 'D-13: falha ao marcar draft como failed');
    throw err;
  }
}

export const defaultPorts: ConnectorForgePorts = {
  db: supabase,
  loadFewShotAdapter: loadIxcAdapterCode,
  runGeneratedTests: async (code, _tests) => {
    // Testes de contrato estáticos (sem executar o código no servidor)
    const checks = [
      { test: 'class declaration', pattern: /class \w+Adapter/ },
      { test: 'getCustomers method', pattern: /getCustomers/ },
      { test: 'getInvoices method', pattern: /getInvoices/ },
      { test: 'suspendService method', pattern: /suspendService/ },
    ];
    return checks.map(c => ({
      test: c.test,
      passed: c.pattern.test(code),
      output: c.pattern.test(code) ? 'ok' : 'não encontrado',
    }));
  },
};
