import { redisClient } from '../redis';

export interface BillingStatus {
  customer_name: string;
  has_overdue: boolean;
  status: string;
}

export interface ConnectionStatus {
  connected: boolean;
  latency_ms: number;
}

export class ERPError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ERPError';
  }
}

export class VoalleAdapter {
  constructor(private tenantId: string, private apiUrl: string, private fetchFn: any = fetch) {}

  async authenticate(): Promise<string> {
    const cacheKey = `voalle_token_${this.tenantId}`;
    const cachedToken = await redisClient.get(cacheKey);
    if (cachedToken) {
      return cachedToken;
    }

    const response = await this.fetchFn(this.apiUrl + '/oauth/token');
    if (response.status === 503) {
      throw new ERPError('ERP_UNAVAILABLE', 'Serviço indisponível');
    }
    const data = await response.json();
    await redisClient.setex(cacheKey, 3600, data.access_token);
    return data.access_token;
  }

  async getBillingStatus(cpfCnpj: string): Promise<BillingStatus> {
    let token = await redisClient.get(`voalle_token_${this.tenantId}`);
    if (!token) {
        token = await this.authenticate();
    }
    const response = await this.fetchFn(this.apiUrl + '/billing', { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
        token = await this.authenticate(); // renew
        const retryRes = await this.fetchFn(this.apiUrl + '/billing', { headers: { Authorization: `Bearer ${token}` }});
        if (retryRes.status === 503) throw new ERPError('ERP_UNAVAILABLE', 'Serviço indisponível');
        const retryRaw = await retryRes.json();
        return {
          customer_name: retryRaw.name,
          has_overdue: retryRaw.overdue,
          status: retryRaw.state
        };
    }
    if (response.status === 503) {
      throw new ERPError('ERP_UNAVAILABLE', 'Serviço indisponível');
    }
    const raw = await response.json();
    return {
      customer_name: raw.name,
      has_overdue: raw.overdue,
      status: raw.state
    };
  }
}

export class RadiusNetAdapter {
  constructor(private apiUrl: string, private fetchFn: any = fetch) {}
  async getConnectionStatus(cpfCnpj: string): Promise<ConnectionStatus> {
    const response = await this.fetchFn(this.apiUrl + '/connection');
    if (response.status === 503) {
      throw new ERPError('ERP_UNAVAILABLE', 'Serviço indisponível');
    }
    const data = await response.json();
    return {
      connected: data.is_connected,
      latency_ms: data.ping
    };
  }
}

export class HubSoftAdapter {
  constructor(private apiUrl: string, private fetchFn: any = fetch) {}
  async getBillingStatus(cpfCnpj: string): Promise<BillingStatus> {
    const response = await this.fetchFn(this.apiUrl + '/billing');
    if (response.status === 503) {
      throw new ERPError('ERP_UNAVAILABLE', 'Serviço indisponível');
    }
    const data = await response.json();
    return {
      customer_name: data.customerName,
      has_overdue: data.hasOverdueInvoices,
      status: data.billingStatus
    };
  }
}

export class IXCAdapter {
  constructor(private apiUrl: string, private fetchFn: any = fetch) {}
  async getBillingStatus(cpfCnpj: string): Promise<BillingStatus> {
    const response = await this.fetchFn(this.apiUrl + '/billing');
    if (response.status === 503) {
      throw new ERPError('ERP_UNAVAILABLE', 'Serviço indisponível');
    }
    const data = await response.json();
    return {
      customer_name: data.cliente,
      has_overdue: data.inadimplente,
      status: data.situacao
    };
  }
}

export function getERPAdapter(erpType: string, tenantId: string = 'default'): any {
  if (erpType === 'voalle') return new VoalleAdapter(tenantId, 'http://voalle.local');
  if (erpType === 'radiusnet') return new RadiusNetAdapter('http://radiusnet.local');
  if (erpType === 'hubsoft') return new HubSoftAdapter('http://hubsoft.local');
  if (erpType === 'ixc') return new IXCAdapter('http://ixc.local');
  throw new Error('Unknown ERP');
}
