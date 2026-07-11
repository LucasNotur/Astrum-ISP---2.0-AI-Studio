import { describe, it, expect, vi } from 'vitest';
import { identifyCustomerByCpfOrPhone, type CustomerLookupPort } from './voice-identify.service';

function makeDb(result: { data: any; error: any }): CustomerLookupPort {
  const eq2 = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(result) });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as CustomerLookupPort;
}

describe('identifyCustomerByCpfOrPhone (IA-08 A3)', () => {
  it('sem cpf e sem telefone -> null sem consultar o banco', async () => {
    const db = makeDb({ data: null, error: null });
    const result = await identifyCustomerByCpfOrPhone(db, 't1', {});
    expect(result).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('encontra por CPF (normaliza pontuação)', async () => {
    const db = makeDb({ data: { id: 'cust-1' }, error: null });
    const result = await identifyCustomerByCpfOrPhone(db, 't1', { cpf: '123.456.789-00' });
    expect(result).toBe('cust-1');
  });

  it('cai para telefone quando não há CPF', async () => {
    const db = makeDb({ data: { id: 'cust-2' }, error: null });
    const result = await identifyCustomerByCpfOrPhone(db, 't1', { phone: '(11) 99999-8888' });
    expect(result).toBe('cust-2');
  });

  it('prioriza CPF quando os dois são fornecidos', async () => {
    const eq2 = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cust-3' }, error: null }) });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    const db = { from } as unknown as CustomerLookupPort;

    await identifyCustomerByCpfOrPhone(db, 't1', { cpf: '12345678900', phone: '11999998888' });
    expect(eq2).toHaveBeenCalledWith('cpf', '12345678900');
  });

  it('cliente não encontrado -> null', async () => {
    const db = makeDb({ data: null, error: null });
    const result = await identifyCustomerByCpfOrPhone(db, 't1', { cpf: '00000000000' });
    expect(result).toBeNull();
  });

  it('erro no banco -> null (fail-closed, não identifica)', async () => {
    const db = makeDb({ data: null, error: { message: 'timeout' } });
    const result = await identifyCustomerByCpfOrPhone(db, 't1', { cpf: '12345678900' });
    expect(result).toBeNull();
  });
});
