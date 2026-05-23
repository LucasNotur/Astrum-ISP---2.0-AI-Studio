import { getERPAdapter } from "./erpAdapter";

// Abstração genérica para suportar futuros ERPs

export const checkBillingStatusFromERP = async (
  tenantId: string,
  cpfOrId: string,
) => {
  try {
    const adapter = await getERPAdapter(tenantId);
    return await adapter.getBillingStatus(cpfOrId);
  } catch (err: any) {
    return { error: `Erro na integração ERP: ${err.message}` };
  }
};

export const unlockCustomerFromERP = async (
  tenantId: string,
  cpfOrId: string,
) => {
  try {
    const adapter = await getERPAdapter(tenantId);
    return await adapter.unlockCustomer(cpfOrId);
  } catch (err: any) {
    return { error: `Erro na integração ERP: ${err.message}` };
  }
};

export const checkConnectionStatusFromERP = async (
  tenantId: string,
  cpfOrId: string,
) => {
  try {
    const adapter = await getERPAdapter(tenantId);
    return await adapter.getConnectionStatus(cpfOrId);
  } catch (err: any) {
    return { error: `Erro na integração ERP: ${err.message}` };
  }
};

export const getCTOStatusFromERP = async (tenantId: string, ctoId: string) => {
  try {
    const adapter = await getERPAdapter(tenantId);
    return await adapter.getCTOStatus(ctoId);
  } catch (err: any) {
    return { error: `Erro na integração ERP: ${err.message}` };
  }
};

export const getOLTStatusFromERP = async (tenantId: string, oltId: string) => {
  try {
    const adapter = await getERPAdapter(tenantId);
    return await adapter.getOLTStatus(oltId);
  } catch (err: any) {
    return { error: `Erro na integração ERP: ${err.message}` };
  }
};
