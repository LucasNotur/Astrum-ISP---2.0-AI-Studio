export interface RadiusNetCreds {
  url: string;
  token: string;
}

async function request(endpoint: string, creds: RadiusNetCreds, options: RequestInit = {}) {
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
    throw new Error(`RadiusNet API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function getConnectionStatus(login: string, creds: RadiusNetCreds) {
  const data = await request(`/api/conexoes/status?login=${encodeURIComponent(login)}`, creds);
  return data;
}

export async function blockUser(login: string, creds: RadiusNetCreds) {
  return await request(`/api/bloqueios`, creds, {
    method: 'POST',
    body: JSON.stringify({ login })
  });
}

export async function unblockUser(login: string, creds: RadiusNetCreds) {
  return await request(`/api/bloqueios/${encodeURIComponent(login)}`, creds, {
    method: 'DELETE'
  });
}
