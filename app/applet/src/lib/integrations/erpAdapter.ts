export interface ERPAdapterConfig {
  baseUrl: string;
  token: string;
}

export interface BillingStatus {
  customer_name: string;
  has_overdue: boolean;
  pix_code: string | null;
  boleto_url: string | null;
  status: string;
}

export interface ERPAdapter {
  getBillingStatus(cpfCnpj: string): Promise<BillingStatus>;
}

export class IXCAdapter implements ERPAdapter {
  constructor(private config: ERPAdapterConfig) {}

  async getBillingStatus(cpfCnpj: string): Promise<BillingStatus> {
    try {
      const response = await fetch(`${this.config.baseUrl}/cliente?qtype=cnpj_cpf&query=${cpfCnpj}`, {
        headers: {
          'Authorization': `Basic ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.status === 503) {
        throw new Error('ERP_UNAVAILABLE');
      }
      if (!response.ok) {
        throw new Error('ERP_ERROR');
      }
      const data = await response.json();
      return {
        customer_name: data.razao || '',
        has_overdue: data.has_overdue || false,
        pix_code: data.pix_code || null,
        boleto_url: data.boleto_url || null,
        status: data.status || 'OK'
      };
    } catch (error) {
       // if the throw is already handled don't map to generic
      if (error instanceof Error && error.message === 'ERP_UNAVAILABLE') {
        throw error;
      }
      throw new Error('ERP_UNAVAILABLE');
    }
  }
}

export class MKAuthAdapter implements ERPAdapter {
  constructor(private config: ERPAdapterConfig) {}

  async getBillingStatus(cpfCnpj: string): Promise<BillingStatus> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/cliente?cpfcnpj=${cpfCnpj}`, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.status === 503) {
        throw new Error('ERP_UNAVAILABLE');
      }
      if (!response.ok) {
        throw new Error('ERP_ERROR');
      }
      const data = await response.json();
      return {
        customer_name: data.nome || '',
        has_overdue: data.tem_atraso || false,
        pix_code: data.codigo_pix || null,
        boleto_url: data.url_boleto || null,
        status: data.situacao || 'OK'
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'ERP_UNAVAILABLE') {
        throw error;
      }
      throw new Error('ERP_UNAVAILABLE');
    }
  }
}

export function getERPAdapter(erpType: string | undefined, config?: ERPAdapterConfig): ERPAdapter {
  if (erpType === 'ixc') {
    return new IXCAdapter(config as ERPAdapterConfig);
  }
  if (erpType === 'mkauth') {
    return new MKAuthAdapter(config as ERPAdapterConfig);
  }
  throw new Error('ERP_NOT_CONFIGURED');
}
