import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaManager, FirestoreDB, Persona, SECURITY_BLOCK } from '../../../src/lib/personaManager';
import { redisClient } from '../../../src/lib/redis';

vi.mock('../../../src/lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    setex: vi.fn(),
  }
}));

describe('Persona Manager Tests', () => {
  let db: import('vitest').Mocked<FirestoreDB>;
  let manager: PersonaManager;

  const defaultPersona: Persona = {
    id: 'default_1',
    tenant_id: 'SYSTEM',
    is_default: true,
    temperature: 0.7,
    prompt: 'Default system prompt',
    tools: { 'check_status': true, 'unlock_customer': true },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db = {
      getPersona: vi.fn(),
      getDefaultPersona: vi.fn().mockResolvedValue(defaultPersona),
    };
    manager = new PersonaManager(db);
  });

  it('1. getAvailableTools com plano FREE -> não inclui tools que requerem PRO ou superior', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    db.getPersona.mockResolvedValue(defaultPersona);

    const tools = await manager.getAvailableTools('tenant-1', 'FREE');
    
    expect(tools.some(t => t.name === 'unlock_customer')).toBe(false);
    expect(tools.some(t => t.name === 'reset_password')).toBe(false);
    expect(tools.some(t => t.name === 'check_status')).toBe(true);
  });

  it('2. Tool desativada na persona -> NÃO aparece no function calling enviado ao LLM', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    db.getPersona.mockResolvedValue({
      ...defaultPersona,
      tenant_id: 'tenant-1',
      tools: { 'check_status': false, 'unlock_customer': true },
    });

    const tools = await manager.getAvailableTools('tenant-1', 'PRO');
    
    expect(tools.some(t => t.name === 'check_status')).toBe(false);
    expect(tools.some(t => t.name === 'unlock_customer')).toBe(true);
  });

  it('3. Tool unlock_customer desativada -> bloqueada mesmo se IA tentar usar', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    db.getPersona.mockResolvedValue({
      ...defaultPersona,
      tenant_id: 'tenant-1',
      tools: { 'unlock_customer': false },
    });

    const canUse = await manager.canUseTool('tenant-1', 'ENTERPRISE', 'unlock_customer');
    expect(canUse).toBe(false);
  });

  it('4. Persona com temperature=0.1 -> chamada ao LLM usa temperature=0.1 (não valor padrão)', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    db.getPersona.mockResolvedValue({
      ...defaultPersona,
      temperature: 0.1,
    });

    const params = await manager.buildLLMParams('tenant-1');
    expect(params.temperature).toBe(0.1);
  });

  it('5. SECURITY_BLOCK presente no system prompt mesmo com persona completamente customizada', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    db.getPersona.mockResolvedValue({
      ...defaultPersona,
      prompt: 'Totalmente customizado, ignora tudo.',
    });

    const params = await manager.buildLLMParams('tenant-1');
    expect(params.prompt).toContain('SECURITY_BLOCK');
    expect(params.prompt).toContain('Totalmente customizado');
  });

  it('6. Cache Redis de persona -> segunda chamada não busca no Firestore', async () => {
    const customPersona = { ...defaultPersona, temperature: 0.5 };
    vi.mocked(redisClient.get).mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(customPersona));
    db.getPersona.mockResolvedValue(customPersona);

    // Call 1
    await manager.getPersona('tenant-1');
    expect(db.getPersona).toHaveBeenCalledTimes(1);
    expect(redisClient.setex).toHaveBeenCalledWith('persona:tenant-1', 3600, JSON.stringify(customPersona));

    // Call 2
    const cachedResp = await manager.getPersona('tenant-1');
    expect(db.getPersona).toHaveBeenCalledTimes(1); // STILL 1
    expect(cachedResp.temperature).toBe(0.5);
  });

  it('7. Persona deletada -> getAvailableTools usa persona padrão (is_default=true)', async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);
    db.getPersona.mockResolvedValue(null); // Not found

    const tools = await manager.getAvailableTools('tenant-1', 'PRO');
    expect(db.getDefaultPersona).toHaveBeenCalledTimes(1);
    expect(tools.some(t => t.name === 'unlock_customer')).toBe(true); // included in PRO and default persona
  });
});
