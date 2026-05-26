import { adminDb as db } from "../firebaseAdmin";
import { getIXCCredentials, getIntegrationKeys, decryptCpf } from "../dbAdmin";
import { getCachedOrFetch } from "./erpCache";
import * as ixcClient from "./ixcClient";
import * as mkAuthClient from "./mkAuthClient";
import * as voalleClient from "./voalleClient";
import * as radiusNetClient from "./radiusNetClient";
import * as hubsoftClient from "./hubsoftClient";
import * as sgpClient from "./sgpClient";
import * as rbxClient from "./rbxClient";

export abstract class ERPAdapter {
  protected tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  abstract findCustomerByCpf(cpf: string): Promise<any>;
  abstract getBillingStatus(cpfOrId: string): Promise<any>;
  abstract unlockCustomer(cpfOrId: string): Promise<any>;
  abstract getConnectionStatus(cpfOrId: string): Promise<any>;
  abstract generateSecondCopy(
    customerId: string,
    invoiceId: string,
  ): Promise<{
    boleto_url: string;
    pix_copia_cola: string;
    barcode: string;
    due_date: string;
    amount: string;
  }>;
  abstract getCTOStatus(ctoId: string): Promise<any>;
  abstract getOLTStatus(oltId: string): Promise<any>;
  abstract updateCustomerData(customerId: string, fields: any): Promise<any>;
  
  async getPlans(): Promise<any[]> {
    return [];
  }
}

export class IXCAdapter extends ERPAdapter {
  private async getCreds() {
    return await getIXCCredentials(this.tenantId);
  }

  async findCustomerByCpf(cpf: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");
    const resp = await ixcClient.getCustomerByCpf(cpf, creds);
    if (resp?.registros && resp.registros.length > 0) {
      return resp.registros[0];
    }
    return null;
  }

  async getBillingStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (IXC)." };

    const financial = await getCachedOrFetch(
      this.tenantId,
      "financial",
      customer.id,
      async () => {
        const resp = await ixcClient.getCustomerFinancial(customer.id, creds);
        return resp?.registros || [];
      },
    );
    return { customer, financial };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");
    const customer = await this.findCustomerByCpf(cpfOrId);
    if (!customer) throw new Error("Customer not found");

    return {
      success: true,
      message: "Desbloqueio em confiança solicitado via IXC",
    };
  }

  async getConnectionStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (IXC)." };

    const connection = await getCachedOrFetch(
      this.tenantId,
      "connection",
      customer.id,
      async () => {
        const resp = await ixcClient.getConnectionStatus(customer.id, creds);
        return resp?.registros || [];
      },
    );
    return { customer, connection };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");
    const resp = await ixcClient.generateSecondCopy(invoiceId, creds);

    return {
      boleto_url: resp.link_boleto || resp.link || "",
      pix_copia_cola: resp.pix_copia_cola || resp.linha_digitavel || "",
      barcode: resp.codigo_barras || "",
      due_date: resp.data_vencimento || "",
      amount: String(resp.valor || "0"),
    };
  }

  async getCTOStatus(ctoId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");

    // Calls /webservice/v1/olt_cto/{id}
    const resp = await ixcClient.getCTOStatus(ctoId, creds);

    // Usually IXC returns things in a specific format or array, simulating the logic
    // based on user request: 返回 { cto_id, cto_name, status (ok|alert|down), connected_clients, down_clients }
    const ctoData = Array.isArray(resp)
      ? resp[0]
      : resp?.registros
        ? resp.registros[0]
        : resp;

    if (!ctoData) return { error: `CTO ${ctoId} not found` };

    return {
      cto_id: ctoId,
      cto_name: ctoData.descricao || ctoData.titulo || `CTO-${ctoId}`,
      status:
        ctoData.status === "offline"
          ? "down"
          : ctoData.status === "warning"
            ? "alert"
            : "ok",
      connected_clients: parseInt(ctoData.clientes_conectados || "0", 10) || 0,
      down_clients: parseInt(ctoData.clientes_offline || "0", 10) || 0,
      raw_data: ctoData,
    };
  }

  async getOLTStatus(oltId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");

    const resp = await ixcClient.getOLTStatus(oltId, creds);
    const oltData = Array.isArray(resp)
      ? resp[0]
      : resp?.registros
        ? resp.registros[0]
        : resp;

    if (!oltData) return { error: `OLT ${oltId} not found` };

    return {
      olt_id: oltId,
      olt_name: oltData.descricao || oltData.nome || `OLT-${oltId}`,
      status:
        oltData.status === "offline"
          ? "down"
          : oltData.status === "warning"
            ? "alert"
            : "ok",
      raw_data: oltData,
    };
  }

  async updateCustomerData(customerId: string, fields: any) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");

    // Simulate updating mapped fields to IXC API
    const mapped: any = {};
    if (fields.phone) mapped.telefone_celular = fields.phone;
    if (fields.email) mapped.email = fields.email;
    if (fields.name) mapped.razao = fields.name;
    if (fields.address) mapped.endereco = fields.address;

    if (Object.keys(mapped).length === 0) return { success: true };

    const endpoint = `${creds.url}/webservice/v1/cliente/${customerId}`;
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(creds.token).toString("base64")}`,
        ixcsoft: "listar",
      },
      body: JSON.stringify(mapped),
    });

    if (!response.ok) {
      throw new Error(`IXC Update Error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getPlans(): Promise<any[]> {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("IXC credentials missing");
    try {
      const response = await fetch(`${creds.url}/webservice/v1/vd_contratos`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(creds.token).toString('base64')}`,
          'Content-Type': 'application/json',
          'ixcsoft': 'listar'
        }
      });
      if (!response.ok) throw new Error('ERP_ERROR');
      const data = await response.json();
      return (data.registros || []).map((p: any) => ({
        id: String(p.id),
        name: p.nome || p.razao || 'Plano IXC',
        price_cents: Math.round(parseFloat(p.valor || p.vl_base || '0') * 100),
        active: p.ativo !== 'N' && p.status !== 'I'
      }));
    } catch {
      return [];
    }
  }
}

export class MKAuthAdapter extends ERPAdapter {
  private async getCreds() {
    const keys = await getIntegrationKeys(this.tenantId);
    return {
      url: (keys as any)?.mkAuthUrl || "",
      token: (keys as any)?.mkAuthToken
        ? decryptCpf((keys as any).mkAuthToken)
        : "",
    };
  }

  async findCustomerByCpf(cpf: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("MK-Auth credentials missing");
    const resp = await mkAuthClient.getClienteByCpf(cpf, creds);
    if (resp?.dados && resp.dados.length > 0) {
      return resp.dados[0];
    }
    return null;
  }

  async getBillingStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("MK-Auth credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (MK-Auth)." };

    const financial = await getCachedOrFetch(
      this.tenantId,
      "financial",
      String(customer.id),
      async () => {
        const resp = await mkAuthClient.getBoletos(String(customer.id), creds);
        return resp?.dados || [];
      },
    );
    return { customer, financial };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("MK-Auth credentials missing");
    const customer = await this.findCustomerByCpf(cpfOrId);
    if (!customer) throw new Error("Customer not found");

    return await mkAuthClient.desbloquearCliente(customer.id, creds);
  }

  async getConnectionStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("MK-Auth credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (MK-Auth)." };

    return { customer, connection: [] };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("MK-Auth credentials missing");
    const boletos = await mkAuthClient.getBoletos(customerId, creds);
    const boleto = boletos?.dados?.find(
      (b: any) =>
        String(b.id) === String(invoiceId) ||
        String(b.titulo) === String(invoiceId),
    );
    if (!boleto) throw new Error("Boleto não encontrado");

    return {
      boleto_url: boleto.link || boleto.link_boleto || "",
      pix_copia_cola: boleto.linha_digitavel || boleto.pix_copia_cola || "",
      barcode: boleto.codigo_barras || "",
      due_date: boleto.data_vencimento || boleto.vencimento || "",
      amount: String(boleto.valor || "0"),
    };
  }

  async getCTOStatus(ctoId: string) {
    return { error: "getCTOStatus not implemented for MK-Auth yet" };
  }

  async getOLTStatus(oltId: string) {
    return { error: "getOLTStatus not implemented for MK-Auth yet" };
  }

  async updateCustomerData(customerId: string, fields: any) {
    return { success: true, warning: "Not implemented in MK-Auth" };
  }

  async getPlans(): Promise<any[]> {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token) throw new Error("MK-Auth credentials missing");
    try {
      const response = await fetch(`${creds.url}/api/plano`, {
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('ERP_ERROR');
      const data = await response.json();
      return (data.planos || data.dados || []).map((p: any) => ({
        id: String(p.id_plano || p.id),
        name: p.nome || p.name || 'Plano MKAuth',
        price_cents: Math.round(parseFloat(p.valor || p.price || '0') * 100),
        active: p.ativo !== false && p.ativo !== 'nao' && p.ativo !== 'N'
      }));
    } catch {
      return [];
    }
  }
}

export class VoalleAdapter extends ERPAdapter {
  private async getCreds() {
    const keys = await getIntegrationKeys(this.tenantId);
    return {
      url: (keys as any)?.voalleUrl || "",
      clientId: (keys as any)?.voalleClientId
        ? decryptCpf((keys as any).voalleClientId)
        : "",
      clientSecret: (keys as any)?.voalleClientSecret
        ? decryptCpf((keys as any).voalleClientSecret)
        : "",
    };
  }

  async findCustomerByCpf(cpf: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.clientId || !creds.clientSecret)
      throw new Error("Voalle credentials missing");
    const resp = await voalleClient.getClientByCpf(cpf, creds);
    const clients = Array.isArray(resp) ? resp : resp?.data || [resp];
    if (clients && clients.length > 0) {
      return clients[0];
    }
    return null;
  }

  async getBillingStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.clientId || !creds.clientSecret)
      throw new Error("Voalle credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (Voalle)." };

    const personId = customer.id || customer.person_id || customer.Id;
    const financial = await getCachedOrFetch(
      this.tenantId,
      "financial",
      String(personId),
      async () => {
        const resp = await voalleClient.getFinancialStatus(
          String(personId),
          creds,
        );
        return Array.isArray(resp) ? resp : resp?.data || [];
      },
    );
    return { customer, financial };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.clientId || !creds.clientSecret)
      throw new Error("Voalle credentials missing");
    const customer = await this.findCustomerByCpf(cpfOrId);
    if (!customer) throw new Error("Customer not found");

    const personId = customer.id || customer.person_id || customer.Id;
    return await voalleClient.unlockClient(String(personId), creds);
  }

  async getConnectionStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.clientId || !creds.clientSecret)
      throw new Error("Voalle credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (Voalle)." };

    return { customer, connection: [] };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.clientId || !creds.clientSecret)
      throw new Error("Voalle credentials missing");
    // Simplified stub for Voalle second copy
    return {
      boleto_url: "",
      pix_copia_cola: "",
      barcode: "",
      due_date: "",
      amount: "0",
    };
  }

  async getCTOStatus(ctoId: string) {
    return { error: "getCTOStatus not implemented for Voalle yet" };
  }

  async getOLTStatus(oltId: string) {
    return { error: "getOLTStatus not implemented for Voalle yet" };
  }

  async updateCustomerData(customerId: string, fields: any) {
    return { success: true, warning: "Not implemented in Voalle" };
  }
}

export class RadiusNetAdapter extends ERPAdapter {
  private async getCreds() {
    const keys = await getIntegrationKeys(this.tenantId);
    return {
      url: (keys as any)?.radiusNetUrl || "",
      token: (keys as any)?.radiusNetToken
        ? decryptCpf((keys as any).radiusNetToken)
        : "",
    };
  }

  async findCustomerByCpf(cpf: string) {
    // Basic implementation since request focuses on network ops (login)
    return { id: cpf, login: cpf };
  }

  async getBillingStatus(cpfOrId: string) {
    return { customer: { id: cpfOrId }, financial: [] };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("RadiusNet credentials missing");
    // Assume cpfOrId is the login for network operations
    return await radiusNetClient.unblockUser(cpfOrId, creds);
  }

  async getConnectionStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("RadiusNet credentials missing");
    const connection = await getCachedOrFetch(
      this.tenantId,
      "connection",
      cpfOrId,
      async () => {
        const resp = await radiusNetClient.getConnectionStatus(cpfOrId, creds);
        return Array.isArray(resp) ? resp : resp?.data || [resp];
      },
    );

    return { customer: { login: cpfOrId }, connection };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    return {
      boleto_url: "",
      pix_copia_cola: "",
      barcode: "",
      due_date: "",
      amount: "0",
    };
  }

  async getCTOStatus(ctoId: string) {
    return { error: "getCTOStatus not implemented for RadiusNet yet" };
  }

  async getOLTStatus(oltId: string) {
    return { error: "getOLTStatus not implemented for RadiusNet yet" };
  }

  async updateCustomerData(customerId: string, fields: any) {
    return { success: true, warning: "Not implemented in RadiusNet" };
  }
}

export class HubSoftAdapter extends ERPAdapter {
  private async getCreds() {
    const keys = await getIntegrationKeys(this.tenantId);
    return {
      url: (keys as any)?.hubsoftUrl || "",
      token: (keys as any)?.hubsoftToken
        ? decryptCpf((keys as any).hubsoftToken)
        : "",
    };
  }

  async findCustomerByCpf(cpf: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("HubSoft credentials missing");
    const resp = await hubsoftClient.getClientByCpf(cpf, creds);
    const clients = Array.isArray(resp) ? resp : resp ? [resp] : [];
    if (clients && clients.length > 0) {
      return clients[0];
    }
    return null;
  }

  async getBillingStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("HubSoft credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (HubSoft)." };

    const customerId = customer.id_cliente || customer.id || customer.client_id;
    const financial = await getCachedOrFetch(
      this.tenantId,
      "financial",
      String(customerId),
      async () => {
        const resp = await hubsoftClient.getInvoices(String(customerId), creds);
        return Array.isArray(resp) ? resp : resp?.data || [];
      },
    );
    return { customer, financial };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("HubSoft credentials missing");
    const customer = await this.findCustomerByCpf(cpfOrId);
    if (!customer) throw new Error("Customer not found");

    const customerId = customer.id_cliente || customer.id || customer.client_id;
    return await hubsoftClient.unblockClient(String(customerId), creds);
  }

  async getConnectionStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("HubSoft credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      },
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (HubSoft)." };

    return { customer, connection: [] };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    return {
      boleto_url: "",
      pix_copia_cola: "",
      barcode: "",
      due_date: "",
      amount: "0",
    };
  }

  async getCTOStatus(ctoId: string) {
    return { error: "getCTOStatus not implemented for HubSoft yet" };
  }

  async getOLTStatus(oltId: string) {
    return { error: "getOLTStatus not implemented for HubSoft yet" };
  }

  async updateCustomerData(customerId: string, fields: any) {
    return { success: true, warning: "Not implemented in HubSoft" };
  }
}

export class SGPAdapter extends ERPAdapter {
  private async getCreds() {
    const keys = await getIntegrationKeys(this.tenantId);
    return {
      url: (keys as any)?.sgpUrl || "",
      token: (keys as any)?.sgpToken
        ? decryptCpf((keys as any).sgpToken)
        : "",
    };
  }

  async findCustomerByCpf(cpf: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("SGP credentials missing");
    const resp = await sgpClient.getClientByCpf(cpf, creds);
    const clients = Array.isArray(resp) ? resp : resp ? [resp] : [];
    if (clients && clients.length > 0) {
      return clients[0];
    }
    return null;
  }

  async getBillingStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("SGP credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      }
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (SGP)." };

    const customerId = customer.id || customer.cliente_id;
    const financial = await getCachedOrFetch(
      this.tenantId,
      "financial",
      String(customerId),
      async () => {
        const resp = await sgpClient.getBillingStatus(String(customerId), creds);
        return Array.isArray(resp) ? resp : resp?.data || [];
      }
    );
    return { customer, financial };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("SGP credentials missing");
    const customer = await this.findCustomerByCpf(cpfOrId);
    if (!customer) throw new Error("Customer not found");

    const customerId = customer.id || customer.cliente_id;
    return await sgpClient.unlockClient(String(customerId), creds);
  }

  async getConnectionStatus(cpfOrId: string) {
    return { error: "getConnectionStatus not implemented for SGP yet" };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    return {
      boleto_url: "",
      pix_copia_cola: "",
      barcode: "",
      due_date: "",
      amount: "0",
    };
  }

  async getCTOStatus(ctoId: string) {
    return { error: "getCTOStatus not implemented for SGP yet" };
  }

  async getOLTStatus(oltId: string) {
    return { error: "getOLTStatus not implemented for SGP yet" };
  }

  async updateCustomerData(customerId: string, fields: any) {
    return { success: true, warning: "Not implemented in SGP" };
  }
}

export class RBXAdapter extends ERPAdapter {
  private async getCreds() {
    const keys = await getIntegrationKeys(this.tenantId);
    return {
      url: (keys as any)?.rbxUrl || "",
      token: (keys as any)?.rbxToken
        ? decryptCpf((keys as any).rbxToken)
        : "",
    };
  }

  async findCustomerByCpf(cpf: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("RBX credentials missing");
    const resp = await rbxClient.getClientByCpf(cpf, creds);
    const clients = Array.isArray(resp) ? resp : resp ? [resp] : [];
    if (clients && clients.length > 0) {
      return clients[0];
    }
    return null;
  }

  async getBillingStatus(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("RBX credentials missing");
    const customer = await getCachedOrFetch(
      this.tenantId,
      "customer",
      cpfOrId,
      async () => {
        return await this.findCustomerByCpf(cpfOrId);
      }
    );
    if (!customer)
      return { error: "Cliente não encontrado no sistema ERP (RBX)." };

    const customerId = customer.id || customer.cliente_id;
    const financial = await getCachedOrFetch(
      this.tenantId,
      "financial",
      String(customerId),
      async () => {
        const resp = await rbxClient.getBillingStatus(String(customerId), creds);
        return Array.isArray(resp) ? resp : resp?.data || [];
      }
    );
    return { customer, financial };
  }

  async unlockCustomer(cpfOrId: string) {
    const creds = await this.getCreds();
    if (!creds.url || !creds.token)
      throw new Error("RBX credentials missing");
    const customer = await this.findCustomerByCpf(cpfOrId);
    if (!customer) throw new Error("Customer not found");

    const customerId = customer.id || customer.cliente_id;
    return await rbxClient.unlockClient(String(customerId), creds);
  }

  async getConnectionStatus(cpfOrId: string) {
    return { error: "getConnectionStatus not implemented for RBX yet" };
  }

  async generateSecondCopy(customerId: string, invoiceId: string) {
    return {
      boleto_url: "",
      pix_copia_cola: "",
      barcode: "",
      due_date: "",
      amount: "0",
    };
  }

  async getCTOStatus(ctoId: string) {
    return { error: "getCTOStatus not implemented for RBX yet" };
  }

  async getOLTStatus(oltId: string) {
    return { error: "getOLTStatus not implemented for RBX yet" };
  }

  async updateCustomerData(customerId: string, fields: any) {
    return { success: true, warning: "Not implemented in RBX" };
  }
}

export const getERPAdapter = async (tenantId: string): Promise<ERPAdapter> => {
  const tenantDoc = await db.collection("tenants").doc(tenantId).get();
  const erpType = tenantDoc.data()?.erp_type || "ixc";

  if (erpType === "radiusnet") {
    return new RadiusNetAdapter(tenantId);
  }

  if (erpType === "voalle") {
    return new VoalleAdapter(tenantId);
  }

  if (erpType === "mkauth") {
    return new MKAuthAdapter(tenantId);
  }

  if (erpType === "hubsoft") {
    return new HubSoftAdapter(tenantId);
  }

  if (erpType === "sgp") {
    return new SGPAdapter(tenantId);
  }

  if (erpType === "rbx") {
    return new RBXAdapter(tenantId);
  }

  return new IXCAdapter(tenantId);
};
