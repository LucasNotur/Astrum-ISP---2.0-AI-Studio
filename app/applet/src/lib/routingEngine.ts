import { redisClient } from './redis';

export interface Operator {
  id: string;
  tenant_id: string;
  status: 'online' | 'offline' | 'busy';
  max_chats: number;
  current_chat_count: number;
  skills: string[];
  last_assigned_at: number;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  created_at: number;
  snooze_duration_ms: number;
  sla_breached: boolean;
  priority: 'normal' | 'urgent';
  required_skill?: string;
}

export class RoutingEngine {
  constructor(private operatorsFetcher: (tenantId: string) => Promise<Operator[]>) {}

  async findBestOperator(tenantId: string, requiredSkill?: string): Promise<Operator | null> {
    const operators = await this.operatorsFetcher(tenantId);
    
    let available = operators.filter(o => o.status === 'online');
    
    if (requiredSkill) {
      available = available.filter(o => o.skills.includes(requiredSkill));
    }
    
    available = available.filter(o => o.current_chat_count < o.max_chats);
    
    if (available.length === 0) return null;

    const minChats = Math.min(...available.map(o => o.current_chat_count));
    const candidates = available.filter(o => o.current_chat_count === minChats);

    candidates.sort((a, b) => a.last_assigned_at - b.last_assigned_at);

    return candidates[0];
  }

  async assignTicket(tenantId: string, ticketId: string, requiredSkill?: string): Promise<Operator | null> {
    const lockKey = `routing_lock:${tenantId}`;
    
    let locked = false;
    for (let i = 0; i < 50; i++) {
      const acquired = await redisClient.setnx(lockKey, '1');
      if (acquired) {
        await redisClient.setex(lockKey, 5, '1');
        locked = true;
        break;
      }
      await new Promise(r => setTimeout(r, 10)); 
    }

    if (!locked) throw new Error('Lock timeout');

    try {
      const best = await this.findBestOperator(tenantId, requiredSkill);
      if (best) {
        best.current_chat_count++;
        best.last_assigned_at = Date.now();
        return best;
      }
      return null;
    } finally {
      if (redisClient.del) {
        await redisClient.del(lockKey);
      }
    }
  }

  evaluateSLA(ticket: Ticket, currentTimeMs: number = Date.now()): Ticket {
    const SLA_LIMIT_MS = 30 * 60 * 1000; 
    const activeTimeMs = currentTimeMs - ticket.created_at - ticket.snooze_duration_ms;
    
    if (activeTimeMs > SLA_LIMIT_MS) {
      ticket.sla_breached = true;
      ticket.priority = 'urgent';
    } else {
      ticket.sla_breached = false;
    }
    return ticket;
  }
}
