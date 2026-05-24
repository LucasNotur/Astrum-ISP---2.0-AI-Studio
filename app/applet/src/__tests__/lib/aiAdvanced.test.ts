import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvancedAIManager, Ticket, Customer, AdvancedAIDependencies, Message, Rule } from '../../../src/lib/aiAdvanced';

describe('Advanced AI Tests', () => {
  let deps: import('vitest').Mocked<AdvancedAIDependencies>;
  let ai: AdvancedAIManager;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      llm: {
        summarizeHistory: vi.fn(),
        identifySentiment: vi.fn(),
      },
      vision: {
        isEnabled: vi.fn(),
        analyzeImage: vi.fn(),
      },
      db: {
        updateTicketPriority: vi.fn(),
        escalateToHuman: vi.fn(),
        getActiveRules: vi.fn(),
      },
      redis: {
        getRules: vi.fn(),
        setRules: vi.fn(),
      }
    };
    ai = new AdvancedAIManager(deps);
  });

  const generateLongHistory = (length: number, wordCount: number = 100): Message[] => {
    return Array.from({ length }, (_, i) => ({
      role: 'user',
      content: Array(wordCount).fill('word').join(' ')
    }));
  };

  it('1. Conversa com tokens estimados > 6000 -> aciona compressão, histórico final <= 12 itens', async () => {
    const customer: Customer = { name: 'João', cpf: '123', plan: 'PRO' };
    const history = generateLongHistory(20, 300); // 20 * 300 words * 1.3 ≈ 7800 tokens > 6000
    
    const ticket: Ticket = {
      id: 't1', tenant_id: 'ten1', history, priority: 'normal', ai_attempts: 0
    };

    deps.llm.summarizeHistory.mockResolvedValue({
      summary: 'Summary generated',
      remaining_history: generateLongHistory(15, 100) // Summarizer returns 15 items
    });

    await ai.compressHistory(ticket, customer);

    expect(deps.llm.summarizeHistory).toHaveBeenCalled();
    expect(ticket.context_summary).toBe('Summary generated');
    expect(ticket.history.length).toBeLessThanOrEqual(12);
  });

  it('2. Ticket com context_summary existente -> reutiliza sem chamar LLM de resumo novamente', async () => {
    const customer: Customer = { name: 'João', cpf: '123', plan: 'PRO' };
    const history = generateLongHistory(20, 300); 
    
    const ticket: Ticket = {
      id: 't2', tenant_id: 'ten1', history, context_summary: 'Existing summary', priority: 'normal', ai_attempts: 0
    };

    await ai.compressHistory(ticket, customer);

    expect(deps.llm.summarizeHistory).not.toHaveBeenCalled();
    expect(ticket.context_summary).toBe('Existing summary');
    expect(ticket.history.length).toBeLessThanOrEqual(12);
  });

  it('3. Compressão -> preserva CPF, nome e plano do cliente no contexto comprimido', async () => {
    const customer: Customer = { name: 'Maria Silva', cpf: '987.654.321-00', plan: 'ENTERPRISE' };
    const history = generateLongHistory(15, 400); 
    
    const ticket: Ticket = {
      id: 't3', tenant_id: 'ten1', history, priority: 'normal', ai_attempts: 0
    };

    deps.llm.summarizeHistory.mockImplementation(async (hist, cust) => {
      // Simulate preserving core details in the summary
      const summary = `Customer ${cust.name} (${cust.cpf}), Plan: ${cust.plan}. Needs help.`;
      return { summary, remaining_history: [] };
    });

    await ai.compressHistory(ticket, customer);

    expect(ticket.context_summary).toContain('Maria Silva');
    expect(ticket.context_summary).toContain('987.654.321-00');
    expect(ticket.context_summary).toContain('ENTERPRISE');
  });

  it('4. Sentimento ANGRY detectado -> prioridade do ticket atualizada para urgent', async () => {
    const ticket: Ticket = { id: 't4', tenant_id: 'ten1', history: [], priority: 'normal', ai_attempts: 0 };
    deps.llm.identifySentiment.mockResolvedValue('ANGRY');
    
    await ai.analyzeSentimentAndUpdatePriority(ticket, 'Estou muito bravo com esse serviço imundo!');
    
    expect(ticket.priority).toBe('urgent');
    expect(deps.db.updateTicketPriority).toHaveBeenCalledWith('t4', 'urgent');
  });

  it('5. Sentimento NEUTRAL -> prioridade NÃO alterada', async () => {
    const ticket: Ticket = { id: 't5', tenant_id: 'ten1', history: [], priority: 'normal', ai_attempts: 0 };
    deps.llm.identifySentiment.mockResolvedValue('NEUTRAL');
    
    await ai.analyzeSentimentAndUpdatePriority(ticket, 'Gostaria de saber meu saldo.');
    
    expect(ticket.priority).toBe('normal');
    expect(deps.db.updateTicketPriority).not.toHaveBeenCalled();
  });

  it('6. Vision desabilitado no tenant -> imageMessage processado sem chamar Vision API', async () => {
    deps.vision.isEnabled.mockResolvedValue(false);
    
    const result = await ai.processImage('ten1', 'http://image.url');
    
    expect(result).toBeNull();
    expect(deps.vision.analyzeImage).not.toHaveBeenCalled();
  });

  it('7. Vision API indisponível -> mensagem processada normalmente sem imageContext (degradação graciosa)', async () => {
    deps.vision.isEnabled.mockResolvedValue(true);
    deps.vision.analyzeImage.mockRejectedValue(new Error('API Timeout'));
    
    const result = await ai.processImage('ten1', 'http://image.url');
    
    expect(result).toBeNull(); // Degradation handled
  });

  it('8. Regra de escalamento ativada -> dispara apenas a ação de maior prioridade (não empilha)', async () => {
    const ticket: Ticket = { id: 't6', tenant_id: 'ten1', history: [], priority: 'normal', ai_attempts: 0 };
    
    const rules: Rule[] = [
      { id: 'r1', active: true, priority: 10, condition: () => true, action: 'notify' },
      { id: 'r2', active: true, priority: 100, condition: () => true, action: 'escalate' }, // Should trigger this only
    ];

    deps.redis.getRules.mockResolvedValue(rules);
    
    await ai.evaluateRules(ticket, 'Oii');

    expect(deps.db.escalateToHuman).toHaveBeenCalledTimes(1);
  });

  it('9. Regra com ai_attempts >= 3 -> escalonar para humano após 3 tentativas', async () => {
    const ticket: Ticket = { id: 't7', tenant_id: 'ten1', history: [], priority: 'normal', ai_attempts: 3 };
    
    const rules: Rule[] = [
      { id: 'r1', active: true, priority: 50, condition: () => false, action: 'escalate', ai_attempts_threshold: 3 },
    ];

    deps.redis.getRules.mockResolvedValue(rules);
    
    await ai.evaluateRules(ticket, 'Ainda não entendi');

    expect(deps.db.escalateToHuman).toHaveBeenCalledWith('t7');
  });

  it('10. Cache de regras -> segunda mensagem do tenant usa Redis, não busca no Firestore', async () => {
    const ticket: Ticket = { id: 't8', tenant_id: 'ten1', history: [], priority: 'normal', ai_attempts: 0 };
    const rules: Rule[] = [ { id: 'r1', active: true, priority: 10, condition: () => false, action: 'escalate' } ];
    
    deps.redis.getRules.mockResolvedValueOnce(null).mockResolvedValueOnce(rules);
    deps.db.getActiveRules.mockResolvedValue(rules);
    
    // Message 1
    await ai.evaluateRules(ticket, 'Hello');
    expect(deps.db.getActiveRules).toHaveBeenCalledTimes(1);
    expect(deps.redis.setRules).toHaveBeenCalledWith('ten1', rules);

    vi.clearAllMocks();
    deps.redis.getRules.mockResolvedValueOnce(rules);

    // Message 2
    await ai.evaluateRules(ticket, 'Hello again');
    expect(deps.db.getActiveRules).not.toHaveBeenCalled();
  });

  it('11. Regra inativa (active=false) -> nunca avaliada mesmo se condição satisfeita', async () => {
    const ticket: Ticket = { id: 't9', tenant_id: 'ten1', history: [], priority: 'normal', ai_attempts: 0 };
    let conditionEvaluated = false;
    const rules: Rule[] = [
      { 
        id: 'r1', 
        active: false, 
        priority: 100, 
        action: 'escalate',
        condition: () => { conditionEvaluated = true; return true; } 
      }
    ];

    deps.redis.getRules.mockResolvedValue(rules);
    
    await ai.evaluateRules(ticket, 'Hi');
    
    expect(conditionEvaluated).toBe(false);
    expect(deps.db.escalateToHuman).not.toHaveBeenCalled();
  });
});
