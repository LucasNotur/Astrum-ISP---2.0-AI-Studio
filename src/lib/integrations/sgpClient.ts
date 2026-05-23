export interface SGPCredentials {
  url: string;
  token: string; // Token to be passed in the header
}

export const getClientByCpf = async (
  cpf: string,
  credentials: SGPCredentials,
) => {
  const endpoint = `${credentials.url}/api/clientes?cpf=${cpf.replace(/\D/g, "")}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`SGP API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const getBillingStatus = async (
  clienteId: string,
  credentials: SGPCredentials,
) => {
  const endpoint = `${credentials.url}/api/cobrancas?cliente_id=${clienteId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`SGP API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const unlockClient = async (
  clienteId: string,
  credentials: SGPCredentials,
) => {
  const endpoint = `${credentials.url}/api/clientes/desbloquear`;

  const payload = {
    cliente_id: clienteId,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`SGP API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};
