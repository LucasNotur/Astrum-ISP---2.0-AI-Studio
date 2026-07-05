import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { MultiAgentState } from '../multi-agent.state';
import { computeChurnScore, type ChurnFeatures } from '../../ml/churn-score';
import { extractFeatures } from '../../ml/churn-features.service';
import { infraLogger } from '../../../infrastructure/logging/logger';

/**
 * IA-10 — Subgrafo de retenção.
 *
 * Gatilho: churn_scores.risk_band='critical' (IA-07).
 * Playbook:
 * - Oferecer desconto/upgrade se permitido pelo plano do tenant.
 * - Escalar para retenção humana se o cliente confirmar cancelamento.
 */

export interface RetencaoSubgraphDeps {
  extractFeaturesFn?: (tenantId: string, customerId: string) => Promise<ChurnFeatures>;
  generateTextFn?: typeof generateText;
}

const miniModel = openai('gpt-4o-mini');

export async function runRetencaoSubgraph(
  state: MultiAgentState,
  deps: RetencaoSubgraphDeps = {},
): Promise<Partial<MultiAgentState>> {
  const { tenantId, customerId, userMessage } = state;
  const extract = deps.extractFeaturesFn ?? extractFeatures;
  const generate = deps.generateTextFn ?? generateText;

  try {
    const features = await extract(tenantId, customerId);
    const { score, riskBand } = computeChurnScore(features);

    infraLogger.info(
      { tenantId, customerId, churnScore: score, riskBand, step: 'retencao_subgraph' },
      'Subgrafo retenção avaliou churn',
    );

    if (riskBand !== 'critical') {
      // Supervisor só deveria chamar este subgrafo em churn crítico; se não for,
      // devolve uma resposta neutra e sinaliza para não reter.
      return {
        response: 'Agradeço o contato. Caso precise de algo mais, estou à disposição.',
        subGraphResult: 'risco_nao_critico',
        steps: [...state.steps, 'retencao_subgraph_low_risk'],
      };
    }

    const prompt = buildRetencaoPrompt(userMessage, score, features.mrrCents);
    const { text } = await generate({
      model: miniModel as any,
      system: prompt.system,
      prompt: prompt.user,
    });

    return {
      response: text,
      subGraphResult: text,
      steps: [...state.steps, 'retencao_subgraph'],
    };
  } catch (err) {
    infraLogger.warn({ err, tenantId, customerId }, 'Subgrafo retenção falhou — fail-open para escalonamento');
    return {
      response: 'Entendo a importância do seu caso. Vou transferir para o time de retenção especializado.',
      requiresHuman: true,
      steps: [...state.steps, 'retencao_subgraph_error'],
    };
  }
}

function buildRetencaoPrompt(userMessage: string, score: number, mrrCents: number) {
  const mrrReais = (mrrCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const system = `Você é um especialista em retenção de clientes de um ISP. O cliente está em risco CRÍTICO de churn (score ${score}/100).
Regras:
- Ouça a insatisfação, demonstre empatia.
- Ofereça UMA contrapartida de retenção (desconto temporário ou upgrade de plano) de forma educada.
- NUNCA prometa valores exatos sem autorização — deixe claro que um atendente confirmará.
- Se o cliente confirmar cancelamento, encerre com empatia e informe que um humano entrará em contato.`;

  const user = `Mensagem do cliente: "${userMessage}"\nMRR aproximado: ${mrrReais}\nScore de churn: ${score}/100`;
  return { system, user };
}
