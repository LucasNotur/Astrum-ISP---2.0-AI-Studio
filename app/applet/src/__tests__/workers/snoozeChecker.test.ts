import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnoozeChecker, Ticket, TicketRepository, NotificationService } from '../../../src/workers/snoozeChecker';

describe('Snooze Checker Tests', () => {
  let ticketRepo: import('vitest').Mocked<TicketRepository>;
  let notificationService: import('vitest').Mocked<NotificationService>;
  let snoozedTickets: Ticket[];
  let checker: SnoozeChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    
    snoozedTickets = [];
    
    ticketRepo = {
      getSnoozedTickets: vi.fn().mockImplementation(async () => snoozedTickets),
      updateTicketStatus: vi.fn().mockImplementation(async (id, status) => {
        const ticket = snoozedTickets.find(t => t.id === id);
        if (ticket) ticket.status = status as any;
      }),
      getActiveTickets: vi.fn().mockImplementation(async (opId) => {
        return snoozedTickets.filter(t => t.status === 'open' && t.snoozed_by === opId);
      }),
    };
    
    notificationService = {
      sendPush: vi.fn()
    };
    
    checker = new SnoozeChecker(ticketRepo, notificationService);
  });

  it('1. snooze_checker com snoozed_until no passado -> reativa ticket (status=open) e notifica operador', async () => {
    snoozedTickets.push({
      id: 't1', tenant_id: 'ten1', status: 'snoozed', created_at: 0,
      snoozed_until: 1000, snoozed_by: 'op1'
    });
    
    await checker.checkSnoozedTickets(2000);
    
    expect(ticketRepo.updateTicketStatus).toHaveBeenCalledWith('t1', 'open');
    expect(notificationService.sendPush).toHaveBeenCalledWith('op1', 'Ticket t1 awake!');
    expect(snoozedTickets[0].status).toBe('open');
  });

  it('2. snooze_checker com snoozed_until no futuro -> NÃO reativa', async () => {
    snoozedTickets.push({
      id: 't2', tenant_id: 'ten1', status: 'snoozed', created_at: 0,
      snoozed_until: 3000, snoozed_by: 'op1'
    });
    
    await checker.checkSnoozedTickets(2000);
    
    expect(ticketRepo.updateTicketStatus).not.toHaveBeenCalled();
    expect(notificationService.sendPush).not.toHaveBeenCalled();
    expect(snoozedTickets[0].status).toBe('snoozed');
  });

  it('3. Ticket em snooze -> não aparece na fila ativa de nenhum operador', async () => {
    snoozedTickets.push({
      id: 't3', tenant_id: 'ten1', status: 'snoozed', created_at: 0,
      snoozed_until: 3000, snoozed_by: 'op2'
    });
    
    const active = await ticketRepo.getActiveTickets('op2');
    expect(active).toHaveLength(0);
  });

  it('4. Ticket reativado -> operador responsável recebe notificação push', async () => {
    snoozedTickets.push({
      id: 't4', tenant_id: 'ten1', status: 'snoozed', created_at: 0,
      snoozed_until: 1000, snoozed_by: 'op3'
    });
    
    await checker.checkSnoozedTickets(2000);
    
    expect(notificationService.sendPush).toHaveBeenCalledTimes(1);
    expect(notificationService.sendPush).toHaveBeenCalledWith('op3', expect.any(String));
  });

  it('5. Ticket sem snoozed_by -> reativa mas sem notificação direcionada (não quebra)', async () => {
    snoozedTickets.push({
      id: 't5', tenant_id: 'ten1', status: 'snoozed', created_at: 0,
      snoozed_until: 1000
    });
    
    await checker.checkSnoozedTickets(2000);
    
    expect(ticketRepo.updateTicketStatus).toHaveBeenCalledWith('t5', 'open');
    expect(notificationService.sendPush).not.toHaveBeenCalled();
    expect(snoozedTickets[0].status).toBe('open');
  });
});
