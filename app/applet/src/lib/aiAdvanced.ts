export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  history: Message[];
  context_summary?: string;
  priority: 'low' | 'normal' | 'urgent';
  ai_attempts: number;
}

export interface Customer {
  name: string;
  cpf: string;
  plan: string;
}

export interface Rule {
  id: string;
  active: boolean;
  priority: number;
  condition: (ticket: Ticket, message: string) => boolean;
  action: 'escalate' | 'notify' | 'close';
  ai_attempts_threshold?: number;
}

export interface AdvancedAIDependencies {
  llm: {
    summarizeHistory: (history: Message[], customer: Customer) => Promise<{ summary: string; remaining_history: Message[] }>;
    identifySentiment: (text: string) => Promise<'ANGRY' | 'NEUTRAL' | 'HAPPY'>;
  };
  vision: {
    isEnabled: (tenantId: string) => Promise<boolean>;
    analyzeImage: (imageUrl: string) => Promise<string>;
  };
  db: {
    updateTicketPriority: (ticketId: string, priority: string) => Promise<void>;
    escalateToHuman: (ticketId: string) => Promise<void>;
    getActiveRules: (tenantId: string) => Promise<Rule[]>;
  };
  redis: {
    getRules: (tenantId: string) => Promise<Rule[] | null>;
    setRules: (tenantId: string, rules: Rule[]) => Promise<void>;
  };
}

export class AdvancedAIManager {
  constructor(private deps: AdvancedAIDependencies) {}

  // 1. Estimate tokens (dummy estimation: 1 word = 1.3 tokens)
  estimateTokens(history: Message[]): number {
    return history.reduce((acc, msg) => acc + (msg.content.split(' ').length * 1.3), 0);
  }

  async compressHistory(ticket: Ticket, customer: Customer): Promise<Ticket> {
    if (this.estimateTokens(ticket.history) > 6000) {
      if (!ticket.context_summary) {
        const { summary, remaining_history } = await this.deps.llm.summarizeHistory(ticket.history, customer);
        ticket.context_summary = summary;
        ticket.history = remaining_history;
      }
      // If there are still more than 12 items after possible summarization, keep the last 12
      if (ticket.history.length > 12) {
        ticket.history = ticket.history.slice(-12);
      }
    }
    return ticket;
  }

  async analyzeSentimentAndUpdatePriority(ticket: Ticket, message: string): Promise<void> {
    const sentiment = await this.deps.llm.identifySentiment(message);
    if (sentiment === 'ANGRY') {
      ticket.priority = 'urgent';
      await this.deps.db.updateTicketPriority(ticket.id, 'urgent');
    }
  }

  async processImage(tenantId: string, imageUrl: string): Promise<string | null> {
    const isVisionEnabled = await this.deps.vision.isEnabled(tenantId);
    if (!isVisionEnabled) {
      return null;
    }
    try {
      return await this.deps.vision.analyzeImage(imageUrl);
    } catch (e) {
      return null; // Graceful degradation
    }
  }

  async evaluateRules(ticket: Ticket, message: string): Promise<void> {
    let rules = await this.deps.redis.getRules(ticket.tenant_id);
    if (!rules) {
      rules = await this.deps.db.getActiveRules(ticket.tenant_id);
      await this.deps.redis.setRules(ticket.tenant_id, rules);
    }

    const activeRules = rules.filter(r => r.active);
    
    // Sort descending by priority
    activeRules.sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      // Check attempts condition
      if (rule.ai_attempts_threshold !== undefined && ticket.ai_attempts >= rule.ai_attempts_threshold) {
         if (rule.action === 'escalate') {
           await this.deps.db.escalateToHuman(ticket.id);
           return; // Break on highest priority triggered
         }
      }

      if (rule.condition(ticket, message)) {
        if (rule.action === 'escalate') {
          await this.deps.db.escalateToHuman(ticket.id);
        }
        break; // Only trigger the action of highest priority rule
      }
    }
  }

  async processIncomingMessage(ticket: Ticket, customer: Customer, textMsg: string, imageUrl?: string): Promise<void> {
    ticket.ai_attempts += 1;
    await this.compressHistory(ticket, customer);
    await this.analyzeSentimentAndUpdatePriority(ticket, textMsg);

    let visionContext = null;
    if (imageUrl) {
      visionContext = await this.processImage(ticket.tenant_id, imageUrl);
    }
    
    await this.evaluateRules(ticket, textMsg);
  }
}
