import { createHash } from 'node:crypto';

/**
 * Prompt Registry — IA-03
 * ----------------------
 * Prompts versionados por hash sha256 (12 chars). Qualquer mudança no texto
 * muda o hash e fica rastreável no Helicone via header
 * `Helicone-Property-PromptVersion`. Esta sessão NÃO altera nenhum texto —
 * apenas os extrai para um ponto único de verdade. Mudança de prompt = sessão
 * própria (registrar novo PromptVersion, versionar, validar regression no eval).
 */
export type PromptId =
  | 'chat'
  | 'classification'
  | 'technical_diagnostic'
  | 'ticket_report'
  | 'safety_veto';

export interface PromptVersion {
  id: PromptId;
  /** sha256(text).slice(0,12) — chave de regressão p/ Helicone. */
  version: string;
  text: string;
}

const BASE = `Você é o assistente de suporte da Astrum, especializado em ISPs (Provedores de Internet).
Você SEMPRE pensa passo a passo antes de responder.
Você NUNCA inventa informações — se não souber, diz que vai criar um ticket para um especialista.
Você NUNCA executa ações financeiras sem confirmar com o cliente.
Responda sempre em português do Brasil.`;

const COT_PREFIX = `Antes de responder, siga este raciocínio interno:
1. Qual é a intenção real do cliente?
2. Tenho informações suficientes para resolver?
3. Qual ação é mais adequada?
4. Preciso usar alguma ferramenta?
Após este raciocínio, forneça a resposta final ao cliente.`;

const SAFETY_PROMPT = `Você é um classificador de segurança de respostas de um assistente de ISP.
Receba o JSON com {response, context} e devolva um JSON estrito no schema:
{"safe": boolean, "categories": string[]}

Categorias válidas (no máximo 3 por resposta):
- "valor_ou_prazo_inventado": promete valor monetário, desconto, prazo de visita ou data que NÃO aparece no contexto fornecido.
- "promessa_nao_autorizada": concede desconto, isenção, visita técnica ou cortesia que nenhuma tool confirmou no contexto.
- "dado_de_outro_cliente": cita nome, CPF, plano, faturas, endereço ou qualquer dado PII de outro cliente que não seja o cliente da conversa atual.
- "orientacao_perigosa": instrui o cliente a mexer em fiação, poste, fonte de energia, equipamento energizado, ou a fazer algo que coloque em risco físico.
- "fora_de_escopo_isp": responde a perguntas claramente fora do escopo de provedores de internet (ex.: medicina, direito, política, religião, programação genérica).

Exemplos:
1. response="Confirmo sua visita amanhã às 14h.", context="" → {"safe":false,"categories":["promessa_nao_autorizada","valor_ou_prazo_inventado"]}
2. response="O cliente João (CPF 123) tem plano 100MB.", context="Cliente: Maria" → {"safe":false,"categories":["dado_de_outro_cliente"]}
3. response="Desligue a chave geral do quadro elétrico.", context="" → {"safe":false,"categories":["orientacao_perigosa"]}
4. response="Reiniciar o roteador resolve 80% dos casos.", context="manual PPPoE: reiniciar resolve" → {"safe":true,"categories":[]}
5. response="A capital da França é Paris.", context="ISP suporte" → {"safe":false,"categories":["fora_de_escopo_isp"]}

Se o contexto fornece a informação que a resposta repete, ela NÃO é inventada.
Se houver dúvida razoável, prefira safe=true (fail-open do consumidor).`;

const PROMPTS: Record<PromptId, string> = {
  classification: `${BASE}\nSua tarefa é classificar a intenção da mensagem. Seja preciso.`,
  technical_diagnostic: `${BASE}\n${COT_PREFIX}\nSua tarefa é diagnosticar problemas técnicos de rede com base nos manuais fornecidos.`,
  ticket_report: `${BASE}\nSua tarefa é gerar um relatório estruturado do atendimento realizado.`,
  chat: `${BASE}\n${COT_PREFIX}`,
  safety_veto: SAFETY_PROMPT,
};

const KNOWN_IDS: PromptId[] = [
  'chat',
  'classification',
  'technical_diagnostic',
  'ticket_report',
  'safety_veto',
];

export const BASE_PROMPT = BASE;

export function promptHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

const REGISTRY = new Map<PromptId, PromptVersion>();

function buildRegistry(): void {
  for (const id of KNOWN_IDS) {
    const text = PROMPTS[id];
    REGISTRY.set(id, { id, version: promptHash(text), text });
  }
}
buildRegistry();

export function getPrompt(id: PromptId): PromptVersion {
  const v = REGISTRY.get(id);
  if (!v) throw new Error(`prompt-registry: unknown prompt id "${id}"`);
  return v;
}

export function listPrompts(): PromptVersion[] {
  return KNOWN_IDS.map((id) => getPrompt(id));
}

/**
 * Resolve um caso de uso (string) em PromptVersion. Casos unknown retornam
 * o BASE_PROMPT (preserva exato comportamento de `vercel-ai.service.ts`
 * pré-IA-03 — `prompts[useCase] ?? base`). Versão do fallback = hash do BASE.
 */
export function resolvePrompt(useCase: string): PromptVersion {
  if ((KNOWN_IDS as string[]).includes(useCase)) {
    return getPrompt(useCase as PromptId);
  }
  return { id: 'chat', version: promptHash(BASE_PROMPT), text: BASE_PROMPT };
}