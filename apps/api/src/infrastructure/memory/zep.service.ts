import { ZepClient } from '@getzep/zep-js';
import type { IMemory as Memory, ISession as Session } from '@getzep/zep-js';
type Message = { role: string; content: string; };
import { infraLogger } from '../logging/logger';
import { supabase } from '../database/supabase.client';

/**
 * Zep Memory Service — Memória de Longo Prazo
 *
 * ESTRATÉGIA (Bloco 3 — Gestão de Memória de Longo Prazo):
 * - Zep atua como "camada de memória viva" por cima do Qdrant
 * - Résuma conversas antigas automaticamente
 * - Extrai entidades: "cliente mudou para Plano Fibra 500MB em Janeiro"
 * - Injeta resumo condensado no context window, economizando tokens
 *
 * ARQUITETURA DE MEMÓRIA (3 camadas):
 * ┌─────────────────────────────────────────────────┐
 * │ CAMADA 1: Zep (longo prazo)                      │
 * │  → Resumo de todas as conversas passadas          │
 * │  → Entidades extraídas (plano, endereço, etc.)    │
 * │  → Preferências do cliente                        │
 * ├─────────────────────────────────────────────────┤
 * │ CAMADA 2: Context Window (médio prazo)            │
 * │  → Últimas 6 mensagens da conversa atual          │
 * │  → Já implementado no Sprint 2                    │
 * ├─────────────────────────────────────────────────┤
 * │ CAMADA 3: RAG + Few-Shot (conhecimento técnico)   │
 * │  → Manuais do ISP no Qdrant                       │
 * │  → Implementado no Sprint 2 + Sessão 63           │
 * └─────────────────────────────────────────────────┘
 *
 * FAIL-OPEN: se Zep estiver indisponível, sistema continua sem memória longa
 */

export interface ZepMemoryContext {
  summary: string;           // resumo de conversas anteriores
  entities: ZepEntity[];     // entidades extraídas (plano, endereço, etc.)
  relevantFacts: string[];   // fatos relevantes para a query atual
  sessionId: string;
}

export interface ZepEntity {
  type: string;   // 'plan', 'address', 'equipment', 'issue'
  name: string;   // nome da entidade
  value: string;  // valor: "Fibra 500MB", "Rua X, 123", "TP-Link AX1500"
  lastSeen: string;
}

export class ZepMemoryService {
  private client: ZepClient | null = null;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = Boolean(process.env.ZEP_API_URL && process.env.ZEP_API_KEY);

    if (this.enabled) {
      this.client = new ZepClient({
        apiUrl: process.env.ZEP_API_URL!,
        apiKey: process.env.ZEP_API_KEY,
      });
      infraLogger.info('Zep Memory Service initialized');
    } else {
      infraLogger.warn('ZEP_API_URL not set — long-term memory disabled (fail-open)');
    }
  }

  /**
   * Obtém contexto de memória de longo prazo do cliente.
   * Injeta no system prompt para que a IA "lembre" do histórico.
   */
  async getMemoryContext(
    customerId: string,
    tenantId: string,
    currentQuery: string,
  ): Promise<ZepMemoryContext | null> {
    if (!this.client || !this.enabled) return null;

    const sessionId = this._buildSessionId(customerId, tenantId);

    try {
      // Garantir que sessão existe
      await this._ensureSession(sessionId, customerId, tenantId);

      // Buscar memória com busca semântica na query atual
      const memory = await this.client.memory.get(sessionId, {
        lastn: 4, // últimas 4 mensagens (complementa o context window)
      });

      if (!memory) return null;

      // Extrair entidades relevantes
      const entities = this._extractEntities(memory);

      // Buscar fatos relevantes para a query atual
      const relevantFacts = await this._searchRelevantFacts(
        sessionId,
        currentQuery,
      );

      return {
        summary: memory.summary?.content ?? '',
        entities,
        relevantFacts,
        sessionId,
      };

    } catch (err) {
      infraLogger.warn({ err, customerId, tenantId }, 'Zep memory retrieval failed — continuing without');
      return null; // fail-open
    }
  }

  /**
   * Persiste mensagens no Zep após cada turno de conversa.
   * Zep resume automaticamente quando a sessão fica grande.
   */
  async addMessages(
    customerId: string,
    tenantId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<void> {
    if (!this.client || !this.enabled) return;

    const sessionId = this._buildSessionId(customerId, tenantId);

    try {
      const zepMessages: Message[] = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        roleType: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      await this.client.memory.add(sessionId, { messages: zepMessages });

      infraLogger.debug({ sessionId, count: messages.length }, 'Messages added to Zep');

    } catch (err) {
      infraLogger.warn({ err, customerId }, 'Failed to add messages to Zep — continuing');
    }
  }

  /**
   * Formata o contexto de memória para injeção no system prompt.
   * Mantém tokens mínimos: apenas informações relevantes.
   */
  formatForSystemPrompt(context: ZepMemoryContext | null): string {
    if (!context || (!context.summary && context.entities.length === 0)) {
      return '';
    }

    const parts: string[] = ['## HISTÓRICO DO CLIENTE (memória de longo prazo):'];

    if (context.summary) {
      parts.push(`Resumo: ${context.summary}`);
    }

    if (context.entities.length > 0) {
      const entityLines = context.entities
        .slice(0, 5) // máximo 5 entidades para economizar tokens
        .map(e => `- ${e.type}: ${e.name} = "${e.value}" (visto em ${new Date(e.lastSeen).toLocaleDateString('pt-BR')})`);
      parts.push('Informações do cliente:\n' + entityLines.join('\n'));
    }

    if (context.relevantFacts.length > 0) {
      parts.push('Fatos relevantes para esta conversa:\n' +
        context.relevantFacts.slice(0, 3).map(f => `- ${f}`).join('\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * Limpa a sessão de memória de um cliente (ex: LGPD - direito ao esquecimento).
   */
  async deleteCustomerMemory(customerId: string, tenantId: string): Promise<void> {
    if (!this.client) return;

    const sessionId = this._buildSessionId(customerId, tenantId);

    try {
      await this.client.memory.delete(sessionId);
      infraLogger.info({ customerId, tenantId }, 'Customer memory deleted (LGPD)');
    } catch (err) {
      infraLogger.error({ err, customerId }, 'Failed to delete customer memory');
    }
  }

  // ─── Helpers Privados ─────────────────────────────────────────────────────

  private _buildSessionId(customerId: string, tenantId: string): string {
    return `${tenantId}::${customerId}`;
  }

  private async _ensureSession(
    sessionId: string,
    customerId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      await this.client!.memory.getSession(sessionId);
    } catch {
      // Sessão não existe — criar
      const { data: customer } = await supabase
        .from('customers')
        .select('name, email')
        .eq('id', customerId)
        .single();

      await this.client!.memory.addSession({
        sessionId,
        metadata: {
          customerId,
          tenantId,
          customerName: customer?.name,
          customerEmail: customer?.email,
        },
      } as Session);
    }
  }

  private _extractEntities(memory: Memory): ZepEntity[] {
    if (!memory.facts || memory.facts.length === 0) return [];

    // Mapear facts do Zep para entidades tipadas
    return memory.facts
      .slice(0, 10)
      .map(fact => {
        const type = this._classifyEntityType(fact.fact ?? '');
        return {
          type,
          name: fact.fact?.split(':')[0]?.trim() ?? 'unknown',
          value: fact.fact?.split(':')[1]?.trim() ?? fact.fact ?? '',
          lastSeen: fact.createdAt ?? new Date().toISOString(),
        };
      })
      .filter(e => e.type !== 'unknown');
  }

  private _classifyEntityType(fact: string): string {
    const lower = fact.toLowerCase();
    if (/plano|fibra|veloci|mb|giga/i.test(lower)) return 'plan';
    if (/endereço|rua|bairro|cidade|cep/i.test(lower)) return 'address';
    if (/roteador|modem|onu|tp-link|intelbras|mikrotik/i.test(lower)) return 'equipment';
    if (/problema|falha|queda|lento|instável/i.test(lower)) return 'issue';
    if (/fatura|boleto|pagamento|débito/i.test(lower)) return 'billing';
    return 'unknown';
  }

  private async _searchRelevantFacts(
    sessionId: string,
    query: string,
  ): Promise<string[]> {
    try {
      const results = await this.client!.memory.searchSessions({
        text: query,
        sessionIds: [sessionId],
        limit: 3,
      });

      return results?.results
        ?.map(r => r.fact?.fact ?? '')
        .filter(Boolean) ?? [];

    } catch {
      return [];
    }
  }
}

export const zepMemoryService = new ZepMemoryService();
