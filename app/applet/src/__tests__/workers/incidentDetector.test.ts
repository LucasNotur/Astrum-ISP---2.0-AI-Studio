import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncidentDetector, SystemDependencies, Customer } from '../../../src/workers/incidentDetector';

describe('Incident Detector Tests', () => {
  let deps: import('vitest').Mocked<SystemDependencies>;
  let detector: IncidentDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      db: {
        getRecentOSCount: vi.fn(),
        createOS: vi.fn(),
        getActiveIncident: vi.fn().mockResolvedValue(null),
        createIncident: vi.fn().mockResolvedValue({ id: 'inc1', ctoId: 'cto1', status: 'active' }),
        getCustomersByCTO: vi.fn().mockResolvedValue([]),
        queueNotification: vi.fn(),
        updateIncidentStatus: vi.fn(),
        getOpenTicketsForIncident: vi.fn().mockResolvedValue([]),
        closeTicket: vi.fn(),
      }
    };
    detector = new IncidentDetector(deps);
  });

  it('1. 4 OSs para mesma CTO em 10min -> cria OS normalmente (abaixo do threshold)', async () => {
    deps.db.getRecentOSCount.mockResolvedValue(3);
    
    const res = await detector.handleOSRequest({ customerId: 'c1', ctoId: 'cto1', timestamp: Date.now() });
    
    expect(res.status).toBe('os_created');
    expect(deps.db.createOS).toHaveBeenCalledTimes(1);
    expect(deps.db.createIncident).not.toHaveBeenCalled();
  });

  it('2. 5ª OS para mesma CTO em 10min -> cria Macro Incidente e NÃO cria a OS individual', async () => {
    deps.db.getRecentOSCount.mockResolvedValue(4);
    
    const res = await detector.handleOSRequest({ customerId: 'c1', ctoId: 'cto1', timestamp: Date.now() });
    
    expect(res.status).toBe('macro_incident_created');
    expect(deps.db.createIncident).toHaveBeenCalledTimes(1);
    expect(deps.db.createOS).not.toHaveBeenCalled(); 
  });

  it('3. Macro Incidente já existe para a CTO -> nova OS referencia incidente existente (não cria segundo)', async () => {
    deps.db.getActiveIncident.mockResolvedValue({ id: 'inc1', ctoId: 'cto1', status: 'active' });
    
    const res = await detector.handleOSRequest({ customerId: 'c1', ctoId: 'cto1', timestamp: Date.now() });
    
    expect(res.status).toBe('incident_referenced');
    expect(res.incidentId).toBe('inc1');
    expect(deps.db.createOS).not.toHaveBeenCalled();
    expect(deps.db.createIncident).not.toHaveBeenCalled();
  });

  it('4. Macro Incidente com 50 clientes -> enfileira exatamente 50 jobs de notificação', async () => {
    deps.db.getRecentOSCount.mockResolvedValue(4);
    const customers: Customer[] = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, phone: `55500${i}` }));
    deps.db.getCustomersByCTO.mockResolvedValue(customers);
    
    await detector.handleOSRequest({ customerId: 'c1', ctoId: 'cto1', timestamp: Date.now() });
    
    expect(deps.db.queueNotification).toHaveBeenCalledTimes(50);
  });

  it('5. Cliente sem telefone na lista -> ignorado sem quebrar o loop dos outros 49', async () => {
    deps.db.getRecentOSCount.mockResolvedValue(4);
    const customers: Customer[] = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, phone: i === 0 ? undefined : `55500${i}` }));
    deps.db.getCustomersByCTO.mockResolvedValue(customers);
    
    await detector.handleOSRequest({ customerId: 'c1', ctoId: 'cto1', timestamp: Date.now() });
    
    expect(deps.db.queueNotification).toHaveBeenCalledTimes(49);
  });

  it('6. Resolução do incidente -> mensagens de resolução para os mesmos 50 clientes', async () => {
    const customers: Customer[] = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, phone: `55500${i}` }));
    deps.db.getCustomersByCTO.mockResolvedValue(customers);
    
    await detector.resolveIncident('inc1', 'cto1');
    
    expect(deps.db.updateIncidentStatus).toHaveBeenCalledWith('inc1', 'resolved');
    expect(deps.db.queueNotification).toHaveBeenCalledTimes(50);
    expect(deps.db.queueNotification).toHaveBeenCalledWith('c0', 'A falha na sua região foi resolvida.');
  });

  it('7. Tickets de suporte abertos do incidente -> fechados automaticamente na resolução', async () => {
    deps.db.getOpenTicketsForIncident.mockResolvedValue([
      { id: 't1', incidentId: 'inc1', status: 'open' },
      { id: 't2', incidentId: 'inc1', status: 'open' }
    ]);
    
    await detector.resolveIncident('inc1', 'cto1');
    
    expect(deps.db.closeTicket).toHaveBeenCalledTimes(2);
    expect(deps.db.closeTicket).toHaveBeenCalledWith('t1');
    expect(deps.db.closeTicket).toHaveBeenCalledWith('t2');
  });
});
