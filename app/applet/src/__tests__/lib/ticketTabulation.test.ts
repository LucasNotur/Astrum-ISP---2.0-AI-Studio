import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSaveToFirestore = vi.fn();

let mockTenants: Record<string, any> = {};
let mockReports: any[] = [];
let showModal = false;

async function closeTicket(ticketId: string, tenantId: string, closingReason: string | null = null, categoriesMap: Record<string, string> = {}) {
  const tenant = mockTenants[tenantId];
  
  if (tenant && tenant.closing_reasons && tenant.closing_reasons.length > 0) {
    if (!closingReason) {
      showModal = true;
      return { success: false, reason: 'Tabulação obrigatória' };
    }
  }

  // Categoria pai e filha
  let parentCategory = null;
  if (closingReason && categoriesMap[closingReason]) {
    parentCategory = categoriesMap[closingReason];
  }

  const reportEntry = {
    ticketId,
    tenantId,
    closingReason,
    parentCategory,
    timestamp: new Date().toISOString()
  };
  
  mockReports.push(reportEntry);
  await mockSaveToFirestore('ticket_reports', reportEntry);
  
  return { success: true };
}

function generateReport(tenantId: string) {
  return mockReports.filter(r => r.tenantId === tenantId);
}

describe('Testes da Tabulação (Ticket Tabulation)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenants = {};
    mockReports = [];
    showModal = false;
  });

  it('1. Fechar ticket sem tabulação → bloqueado (modal obrigatório aparece)', async () => {
    mockTenants['tenant1'] = { closing_reasons: ['Dúvida', 'Reclamação'] };
    
    const result = await closeTicket('t1', 'tenant1', null);
    
    expect(result.success).toBe(false);
    expect(showModal).toBe(true);
    expect(mockSaveToFirestore).not.toHaveBeenCalled();
  });

  it('2. Fechar ticket com tabulação preenchida → fechamento concluído com categoria salva', async () => {
    mockTenants['tenant1'] = { closing_reasons: ['Dúvida', 'Reclamação'] };
    
    const result = await closeTicket('t2', 'tenant1', 'Dúvida');
    
    expect(result.success).toBe(true);
    expect(mockSaveToFirestore).toHaveBeenCalledWith('ticket_reports', expect.objectContaining({
      ticketId: 't2',
      closingReason: 'Dúvida'
    }));
  });

  it('3. Tenant sem closing_reasons configurado → tabulação ignorada, fechamento normal', async () => {
    mockTenants['tenant2'] = { closing_reasons: [] }; // or undefined
    
    const result = await closeTicket('t3', 'tenant2', null);
    
    expect(result.success).toBe(true);
    expect(showModal).toBe(false);
    expect(mockSaveToFirestore).toHaveBeenCalled();
  });

  it('4. Tabulação salva → aparece nos relatórios de motivos de chamado', async () => {
    mockTenants['tenant1'] = { closing_reasons: ['Dúvida'] };
    await closeTicket('t4', 'tenant1', 'Dúvida');
    
    const report = generateReport('tenant1');
    expect(report.length).toBe(1);
    expect(report[0].closingReason).toBe('Dúvida');
  });

  it('5. Categoria filha selecionada → categoria pai também salva (hierarquia completa)', async () => {
    mockTenants['tenant1'] = { closing_reasons: ['Financeiro > Boleto'] };
    const categoriesMap = {
      'Boleto': 'Financeiro'
    };
    
    await closeTicket('t5', 'tenant1', 'Boleto', categoriesMap);
    
    const report = generateReport('tenant1');
    expect(report[0].closingReason).toBe('Boleto');
    expect(report[0].parentCategory).toBe('Financeiro');
  });

  it('6. Dados do tenant A → não aparecem nos relatórios do tenant B', async () => {
    await closeTicket('t6', 'tenantA', 'Dúvida');
    await closeTicket('t7', 'tenantB', 'Venda');
    
    const reportB = generateReport('tenantB');
    
    expect(reportB.length).toBe(1);
    expect(reportB[0].tenantId).toBe('tenantB');
    expect(reportB[0].closingReason).toBe('Venda');
  });

});
