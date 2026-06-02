import { zepMemoryService } from './zep.service';
import { infraLogger } from '../logging/logger';

/**
 * Memory Composer — orquestra as 3 camadas de memória
 *
 * Monta o bloco de contexto completo que vai no system prompt:
 * Zep (longo prazo) + Context Window (médio prazo) + RAG (conhecimento técnico)
 */

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemoryComposition {
  systemContext: string;     // injetar no system prompt
  recentHistory: ConversationTurn[]; // injetar como messages[]
  tokenEstimate: number;
}

export class MemoryComposerService {

  async compose(params: {
    customerId: string;
    tenantId: string;
    currentQuery: string;
    recentTurns: ConversationTurn[];
    ragContext: string;
    systemPromptBase: string;
  }): Promise<MemoryComposition> {
    const {
      customerId,
      tenantId,
      currentQuery,
      recentTurns,
      ragContext,
      systemPromptBase,
    } = params;

    // Buscar memória Zep (longo prazo) — em paralelo com RAG
    const [zepContext] = await Promise.allSettled([
      zepMemoryService.getMemoryContext(customerId, tenantId, currentQuery),
    ]);

    const zepMemory = zepContext.status === 'fulfilled' ? zepContext.value : null;
    const zepFormatted = zepMemoryService.formatForSystemPrompt(zepMemory);

    // Compor system context completo
    const sections: string[] = [systemPromptBase];

    if (zepFormatted) {
      sections.push(zepFormatted);
    }

    if (ragContext) {
      sections.push(`## DOCUMENTOS TÉCNICOS RELEVANTES:\n${ragContext}`);
    }

    const systemContext = sections.join('\n\n---\n\n');

    // Estimar tokens (aproximação: 4 chars/token)
    const tokenEstimate = Math.ceil(systemContext.length / 4) +
      recentTurns.reduce((acc, t) => acc + Math.ceil(t.content.length / 4), 0);

    infraLogger.debug({
      customerId,
      hasZep: Boolean(zepFormatted),
      hasRAG: Boolean(ragContext),
      recentTurns: recentTurns.length,
      tokenEstimate,
    }, 'Memory composition complete');

    return {
      systemContext,
      recentHistory: recentTurns.slice(-6), // últimas 6 mensagens
      tokenEstimate,
    };
  }

  /**
   * Persiste mensagens após atendimento concluído.
   */
  async persist(
    customerId: string,
    tenantId: string,
    turns: ConversationTurn[],
  ): Promise<void> {
    await zepMemoryService.addMessages(customerId, tenantId, turns);
  }
}

export const memoryComposerService = new MemoryComposerService();
