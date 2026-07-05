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
  | 'ticket_report';

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

const PROMPTS: Record<PromptId, string> = {
  classification: `${BASE}\nSua tarefa é classificar a intenção da mensagem. Seja preciso.`,
  technical_diagnostic: `${BASE}\n${COT_PREFIX}\nSua tarefa é diagnosticar problemas técnicos de rede com base nos manuais fornecidos.`,
  ticket_report: `${BASE}\nSua tarefa é gerar um relatório estruturado do atendimento realizado.`,
  chat: `${BASE}\n${COT_PREFIX}`,
};

const KNOWN_IDS: PromptId[] = [
  'chat',
  'classification',
  'technical_diagnostic',
  'ticket_report',
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