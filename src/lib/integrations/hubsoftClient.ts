export interface HubSoftCreds {
  url: string;
  token: string;
}

async function request(endpoint: string, creds: HubSoftCreds, options: RequestInit = {}) {
  const baseUrl = creds.url.replace(/\/$/, '');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${creds.token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSoft API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getClientByCpf(cpf: string, creds: HubSoftCreds) {
  const cleanCpf = cpf.replace(/\D/g, '');
  const response = await request(`/api/v1/clients?cpf=${cleanCpf}`, creds);
  return response?.data || response;
}

export async function getInvoices(clientId: string, creds: HubSoftCreds) {
  const response = await request(`/api/v1/invoices?client_id=${clientId}`, creds);
  return response?.data || response;
}

export async function blockClient(clientId: string, creds: HubSoftCreds) {
  const response = await request(`/api/v1/clients/${clientId}/block`, creds, {
    method: 'POST'
  });
  return response?.data || response;
}

export async function unblockClient(clientId: string, creds: HubSoftCreds) {
  const response = await request(`/api/v1/clients/${clientId}/unblock`, creds, {
    method: 'POST'
  });
  return response?.data || response;
}
