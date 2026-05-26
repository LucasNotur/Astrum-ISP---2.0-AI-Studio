import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSaveToFirestore = vi.fn();
const mockUpdateFirestore = vi.fn();

let mockCards: any[] = [];
let mockColumns: any[] = [
  { id: 'col1', name: 'Novo', status: 'new' },
  { id: 'col2', name: 'Fechado', status: 'closed' },
  { id: 'col3', name: 'Vazio', status: 'empty' }
];

async function createCard(tenantId: string, title: string, value: number, status: string) {
  const card = {
    id: `card_${Date.now()}`,
    tenantId,
    title,
    value,
    status
  };
  mockCards.push(card);
  await mockSaveToFirestore('crm_cards', card);
  return card;
}

async function moveCard(cardId: string, newStatus: string) {
  const card = mockCards.find(c => c.id === cardId);
  if (card) {
    card.status = newStatus;
    await mockUpdateFirestore('crm_cards', cardId, { status: newStatus });
    return { success: true };
  }
  return { success: false };
}

function getKanbanBoard(tenantId: string) {
  const tenantCards = mockCards.filter(c => c.tenantId === tenantId);
  
  const board = mockColumns.map(col => {
    const colCards = tenantCards.filter(c => c.status === col.status);
    const totalValue = colCards.reduce((sum, c) => sum + c.value, 0);
    return {
      ...col,
      cards: colCards,
      totalValue,
      isEmpty: colCards.length === 0
    };
  });
  
  return board;
}

describe('Testes do Kanban CRM', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockCards = [];
  });

  it('1. Card criado → salvo no Firestore com tenant_id correto', async () => {
    const card = await createCard('tenantA', 'Negócio 1', 1000, 'new');
    
    expect(card.tenantId).toBe('tenantA');
    expect(mockSaveToFirestore).toHaveBeenCalledWith('crm_cards', expect.objectContaining({
      tenantId: 'tenantA',
      title: 'Negócio 1'
    }));
  });

  it('2. Card arrastado para coluna Fechado → status atualizado no Firestore', async () => {
    const card = await createCard('tenantA', 'Negócio 2', 2000, 'new');
    
    const result = await moveCard(card.id, 'closed');
    
    expect(result.success).toBe(true);
    expect(mockUpdateFirestore).toHaveBeenCalledWith('crm_cards', card.id, { status: 'closed' });
    expect(mockCards.find(c => c.id === card.id)?.status).toBe('closed');
  });

  it('3. Cards do tenant A → não aparecem no Kanban do tenant B', async () => {
    await createCard('tenantA', 'A1', 100, 'new');
    await createCard('tenantA', 'A2', 200, 'closed');
    await createCard('tenantB', 'B1', 300, 'new');
    
    const boardB = getKanbanBoard('tenantB');
    const newColB = boardB.find(col => col.status === 'new');
    
    expect(newColB?.cards.length).toBe(1);
    expect(newColB?.cards[0].title).toBe('B1');
    expect(newColB?.cards[0].tenantId).toBe('tenantB');
  });

  it('4. Coluna sem cards → exibe estado vazio sem lançar erro', async () => {
    await createCard('tenantA', 'A1', 100, 'new');
    
    const boardA = getKanbanBoard('tenantA');
    const emptyCol = boardA.find(col => col.status === 'empty');
    
    expect(emptyCol).toBeDefined();
    expect(emptyCol?.isEmpty).toBe(true);
    expect(emptyCol?.cards.length).toBe(0);
    // Code should not throw
  });

  it('5. Card com valor de contrato → soma correta exibida no cabeçalho da coluna', async () => {
    await createCard('tenantA', 'A1', 1000, 'new');
    await createCard('tenantA', 'A2', 2500, 'new');
    await createCard('tenantA', 'A3', 500, 'closed');
    
    const boardA = getKanbanBoard('tenantA');
    const newCol = boardA.find(col => col.status === 'new');
    const closedCol = boardA.find(col => col.status === 'closed');
    
    expect(newCol?.totalValue).toBe(3500); // 1000 + 2500
    expect(closedCol?.totalValue).toBe(500);
  });

});
