import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkService, Services } from '../../../lib/integrations/network';

describe('Network and Configuration Tests', () => {
  let services: import('vitest').Mocked<Services>;
  let network: NetworkService;

  beforeEach(() => {
    vi.clearAllMocks();
    services = {
      erp: {
        getCTOStatus: vi.fn(),
        unlockCustomer: vi.fn(),
        checkPayment: vi.fn(),
        syncCustomer: vi.fn(),
      },
      whatsapp: {
        sendMessage: vi.fn(),
      },
      incidentDb: {
        getActiveIncident: vi.fn(),
        createIncident: vi.fn(),
      },
      ticketDb: {
        closeTicket: vi.fn(),
      },
      syncDb: {
        markPendingSync: vi.fn(),
        getPendingSyncs: vi.fn(),
        clearPendingSync: vi.fn(),
      }
    } as any;
    network = new NetworkService(services);
  });

  it('1. getCTOStatus com CTO DOWN -> status=down com lista de clientes afetados', async () => {
    services.erp.getCTOStatus.mockResolvedValue({ status: 'down', affected_customers: ['c1', 'c2'] });
    const result = await network.getCTOStatus('cto-1');
    expect(result.status).toBe('down');
    expect(result.affected_customers).toEqual(['c1', 'c2']);
  });

  it('2. check_network_status com CTO DOWN -> verifica cto_incidents antes de criar novo incidente', async () => {
    services.erp.getCTOStatus.mockResolvedValue({ status: 'down', affected_customers: ['c1'] });
    services.incidentDb.getActiveIncident.mockResolvedValue(null);
    
    await network.checkNetworkStatus('cto-1');
    
    expect(services.incidentDb.getActiveIncident).toHaveBeenCalledWith('cto-1');
    expect(services.incidentDb.createIncident).toHaveBeenCalledWith('cto-1', ['c1']);
  });

  it('3. CTO DOWN com incidente ativo existente -> NÃO cria segundo incidente (deduplicação)', async () => {
    services.erp.getCTOStatus.mockResolvedValue({ status: 'down', affected_customers: ['c1'] });
    services.incidentDb.getActiveIncident.mockResolvedValue({ id: 'inc1' });
    
    await network.checkNetworkStatus('cto-1');
    
    expect(services.incidentDb.getActiveIncident).toHaveBeenCalledWith('cto-1');
    expect(services.incidentDb.createIncident).not.toHaveBeenCalled();
  });

  it('4. unlockCustomer: sequência obrigatória -> verifica pagamento -> unlock -> WhatsApp -> fecha ticket (nessa ordem)', async () => {
    const callOrder: string[] = [];
    
    services.erp.checkPayment.mockImplementation(async () => { callOrder.push('checkPayment'); return true; });
    services.erp.unlockCustomer.mockImplementation(async () => { callOrder.push('unlockCustomer'); });
    services.whatsapp.sendMessage.mockImplementation(async () => { callOrder.push('sendMessage'); });
    services.ticketDb.closeTicket.mockImplementation(async () => { callOrder.push('closeTicket'); });

    await network.unlockCustomerSequence('c1', 't1', '123');

    expect(callOrder).toEqual(['checkPayment', 'unlockCustomer', 'sendMessage', 'closeTicket']);
  });

  it('5. unlockCustomer com pagamento não confirmado -> NÃO chama adapter.unlockCustomer() em nenhuma circunstância', async () => {
    services.erp.checkPayment.mockResolvedValue(false);
    
    await expect(network.unlockCustomerSequence('c1', 't1', '123')).rejects.toThrow('Payment not confirmed');
    
    expect(services.erp.unlockCustomer).not.toHaveBeenCalled();
  });

  it('6. Sync cadastral falha no ERP -> salva sync_pending=true, NÃO retorna erro ao operador', async () => {
    services.erp.syncCustomer.mockRejectedValue(new Error('ERP DOWN'));
    
    await expect(network.syncCustomerData('c1', { name: 'New Name' })).resolves.not.toThrow();
    
    expect(services.syncDb.markPendingSync).toHaveBeenCalledWith('c1', { name: 'New Name' });
  });

  it('7. Job de retry de sync -> retenta campos com sync_pending=true', async () => {
    services.syncDb.getPendingSyncs.mockResolvedValue([{ customerId: 'c1', data: { name: 'New Name'} }]);
    services.erp.syncCustomer.mockResolvedValue();
    
    await network.retryPendingSyncs();
    
    expect(services.erp.syncCustomer).toHaveBeenCalledWith('c1', { name: 'New Name' });
    expect(services.syncDb.clearPendingSync).toHaveBeenCalledWith('c1');
  });
});
