export interface RBXCredentials {
  url: string;
  token: string; // Will hold basic auth user:pass formatted as string or token
}

export const getClientByCpf = async (
  cpf: string,
  credentials: RBXCredentials,
) => {
  const endpoint = `${credentials.url}/api/v1/cliente?cpf=${cpf.replace(/\D/g, "")}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`RBX API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const getBillingStatus = async (
  clienteId: string,
  credentials: RBXCredentials,
) => {
  const endpoint = `${credentials.url}/api/v1/financeiro/titulos?cliente_id=${clienteId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`RBX API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const unlockClient = async (
  clienteId: string,
  credentials: RBXCredentials,
) => {
  const endpoint = `${credentials.url}/api/v1/cliente/desbloquear`;

  const payload = {
    cliente_id: clienteId,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`RBX API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};
