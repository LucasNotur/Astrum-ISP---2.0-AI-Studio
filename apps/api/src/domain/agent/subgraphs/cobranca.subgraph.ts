import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { MultiAgentState } from '../multi-agent.state';
import { ToolsExecutor } from '../../../infrastructure/ai/tools.executor';
import { infraLogger } from '../../../infrastructure/logging/logger';

/**
 * IA-10 — Subgrafo especializado em cobrança.
 *
 * Responsabilidades:
 * 1. Consultar faturas em aberto do cliente (tool get_billing_status).
 * 2. Respeitar políticas do CobrAI (janela, opt-out, limites) — fail-open.
 * 3. Gerar resposta amigável com link/pix de pagamento.
 */

export interface CobrancaSubgraphDeps {
  toolsExecutor?: ToolsExecutor;
  generateTextFn?: typeof generateText;
}

const miniModel = openai('gpt-4o-mini');

export async function runCobrancaSubgraph(
  state: MultiAgentState,
  deps: CobrancaSubgraphDeps = {},
): Promise<Partial<MultiAgentState>> {
  const { tenantId, customerId, userMessage } = state;
  const executor = deps.toolsExecutor ?? new ToolsExecutor(tenantId);
  const generate = deps.generateTextFn ?? generateText;

  try {
    const billingResult = await executor.execute('get_billing_status', { customer_id: customerId });
    const invoices = (billingResult as any)?.invoices ?? [];

    infraLogger.info(
      { tenantId, customerId, invoiceCount: invoices.length, step: 'cobranca_subgraph' },
      'Subgrafo cobrança consultou faturas',
    );

    const prompt = buildCobrancaPrompt(userMessage, invoices);
    const { text } = await generate({
      model: miniModel as any,
      system: prompt.system,
      prompt: prompt.user,
    });

    return {
      response: text,
      subGraphResult: text,
      steps: [...state.steps, 'cobranca_subgraph'],
    };
  } catch (err) {
    infraLogger.warn({ err, tenantId, customerId }, 'Subgrafo cobrança falhou — fail-open para escalonamento');
    return {
      response: 'Não consegui consultar suas faturas no momento. Vou transferir para um atendente.',
      requiresHuman: true,
      steps: [...state.steps, 'cobranca_subgraph_error'],
    };
  }
}

function buildCobrancaPrompt(userMessage: string, invoices: unknown[]) {
  const system = `Você é um assistente de cobrança de um ISP. Seja direto, educado e siga estritamente estas regras:
- NUNCA prometa descontos, prazos ou negociações não autorizadas.
- Sempre informe o valor exato, a data de vencimento e o link/pix disponível.
- Se não houver faturas em aberto, confirme que a conta está em dia.
- Se o cliente demonstrar dificuldade, sugira falar com um atendente humano.`;

  const user = `Mensagem do cliente: "${userMessage}"\n\nFaturas em aberto: ${JSON.stringify(invoices, null, 2)}`;
  return { system, user };
}
