import redis from "../redis";

export interface VoalleCreds {
  url: string;
  clientId: string;
  clientSecret: string;
}

export async function authenticate(creds: VoalleCreds): Promise<string> {
  const cacheKey = `voalle_token:${creds.clientId}`;
  const cachedToken = await redis.get(cacheKey);
  
  if (cachedToken) {
    return cachedToken;
  }

  const tokenUrl = `${creds.url.replace(/\/$/, '')}/connect/token`;
  
  const payload = new URLSearchParams();
  payload.append('grant_type', 'client_credentials');
  payload.append('client_id', creds.clientId);
  payload.append('client_secret', creds.clientSecret);
  payload.append('scope', 'syngw'); // Adjust scope as needed for Voalle

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: payload.toString()
  });

  if (!response.ok) {
    throw new Error(`Voalle auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  const token = data.access_token;
  const expiresIn = data.expires_in || 3600; // usually in seconds

  // Cache token with an expiration slightly less than the actual token expiration to be safe
  await redis.set(cacheKey, token, 'EX', Math.max(1, expiresIn - 60));

  return token;
}

async function request(endpoint: string, creds: VoalleCreds, options: RequestInit = {}) {
  const token = await authenticate(creds);
  const baseUrl = creds.url.replace(/\/$/, '');
  
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Voalle API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getClientByCpf(cpf: string, creds: VoalleCreds) {
  // Voalle API typical endpoint to fetch people
  // Adjust endpoint depending on their documentation
  const cleanCpf = cpf.replace(/\D/g, '');
  const response = await request(`/syngw/external/people?tx_document=${cleanCpf}`, creds);
  return response?.response?.data || response;
}

export async function getFinancialStatus(personId: string, creds: VoalleCreds) {
  const response = await request(`/syngw/external/financial/receivables?person_id=${personId}`, creds);
  return response?.response?.data || response;
}

export async function unlockClient(personId: string, creds: VoalleCreds) {
  const response = await request(`/syngw/external/network/unblock-client?person_id=${personId}`, creds, {
    method: 'POST',
    body: JSON.stringify({})
  });
  return response?.response?.data || response;
}
