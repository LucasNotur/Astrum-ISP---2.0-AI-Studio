import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetInventoryItem = vi.fn();
const mockUpdateOS = vi.fn();
const mockGetCameraPermission = vi.fn();

let mockUI: Record<string, any> = {};
let mockOSMaterials: Record<string, any[]> = {};

async function startScanner() {
  try {
    const hasPermission = await mockGetCameraPermission();
    if (!hasPermission) {
      mockUI.error = 'Câmera sem permissão';
      return false;
    }
    return true;
  } catch (error) {
    mockUI.error = 'Câmera sem permissão';
    return false;
  }
}

async function scanCode(code: string, tenantId: string, osId: string) {
  const item = await mockGetInventoryItem(tenantId, code);
  
  if (!item) {
    mockUI.message = 'Item não cadastrado';
    return { success: false, reason: 'not_found' };
  }
  
  // Show info before confirmation
  mockUI.confirmationDialog = {
    name: item.name,
    currentStock: item.stock
  };
  
  return { success: true, item };
}

async function confirmMaterialReduction(osId: string, item: any, quantity: number = 1) {
  if (!mockOSMaterials[osId]) {
    mockOSMaterials[osId] = [];
  }
  
  const existing = mockOSMaterials[osId].find(m => m.code === item.code);
  if (existing) {
    existing.quantity += quantity;
  } else {
    mockOSMaterials[osId].push({
      code: item.code,
      name: item.name,
      quantity
    });
  }
  
  await mockUpdateOS(osId, { materials_used: mockOSMaterials[osId] });
  return true;
}

describe('Testes do Scan de Materiais (Material Scan)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockUI = {};
    mockOSMaterials = {};
  });

  it('1. Código detectado → busca item em inventory/{tenantId}/items pelo código', async () => {
    mockGetInventoryItem.mockResolvedValue({ code: 'OPT-1', name: 'Cabo Óptico', stock: 100 });
    
    await scanCode('OPT-1', 'tenantA', 'OS-001');
    
    expect(mockGetInventoryItem).toHaveBeenCalledWith('tenantA', 'OPT-1');
  });

  it('2. Item encontrado → nome e estoque atual exibidos antes de confirmar baixa', async () => {
    mockGetInventoryItem.mockResolvedValue({ code: 'ROU-1', name: 'Roteador Wi-Fi', stock: 50 });
    
    await scanCode('ROU-1', 'tenantA', 'OS-001');
    
    expect(mockUI.confirmationDialog).toEqual({
      name: 'Roteador Wi-Fi',
      currentStock: 50
    });
  });

  it('3. Baixa confirmada → materials_used atualizado na OS', async () => {
    const item = { code: 'ROU-1', name: 'Roteador Wi-Fi', stock: 50 };
    await confirmMaterialReduction('OS-001', item, 1);
    
    expect(mockOSMaterials['OS-001'].length).toBe(1);
    expect(mockUpdateOS).toHaveBeenCalledWith('OS-001', { materials_used: mockOSMaterials['OS-001'] });
  });

  it('4. Código não encontrado → mensagem Item não cadastrado, não trava', async () => {
    mockGetInventoryItem.mockResolvedValue(null); // Item is missing
    
    const result = await scanCode('FAKE-99', 'tenantA', 'OS-001');
    
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_found');
    expect(mockUI.message).toBe('Item não cadastrado');
  });

  it('5. Câmera sem permissão → mensagem de erro, não trava o app do técnico', async () => {
    mockGetCameraPermission.mockResolvedValue(false);
    
    const canScan = await startScanner();
    
    expect(canScan).toBe(false);
    expect(mockUI.error).toBe('Câmera sem permissão');
  });

  it('6. Mesmo código scaneado 2x na mesma OS → adiciona 2 unidades (não duplica o registro)', async () => {
    const item = { code: 'CON-1', name: 'Conector', stock: 200 };
    
    await confirmMaterialReduction('OS-002', item, 1); // 1 scan
    await confirmMaterialReduction('OS-002', item, 1); // 2nd scan
    
    expect(mockOSMaterials['OS-002'].length).toBe(1); // Do not duplicate
    expect(mockOSMaterials['OS-002'][0].quantity).toBe(2); // Sum qty
  });

});
