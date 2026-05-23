export interface MKAuthCredentials {
  url: string;
  token: string;
}

export const getClienteByCpf = async (cpf: string, creds: MKAuthCredentials) => {
  const url = `${creds.url}/api/cliente?cliente_cpf=${cpf}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "MK-Auth-Key": creds.token,
      "Content-Type": "application/json"
    },
  });
  if (!response.ok) throw new Error(`Erro API MK-Auth (getClienteByCpf): ${response.statusText}`);
  return response.json();
};

export const getBoletos = async (clienteId: string, creds: MKAuthCredentials) => {
  const url = `${creds.url}/api/boleto?id_cliente=${clienteId}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "MK-Auth-Key": creds.token,
      "Content-Type": "application/json"
    },
  });
  if (!response.ok) throw new Error(`Erro API MK-Auth (getBoletos): ${response.statusText}`);
  return response.json();
};

export const bloquearCliente = async (clienteId: string | number, creds: MKAuthCredentials) => {
  const url = `${creds.url}/api/cliente/bloquear`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "MK-Auth-Key": creds.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id: clienteId })
  });
  if (!response.ok) throw new Error(`Erro API MK-Auth (bloquearCliente): ${response.statusText}`);
  return response.json();
};

export const desbloquearCliente = async (clienteId: string | number, creds: MKAuthCredentials) => {
  // Assumindo chamada DELETE para o mesmo endpoint conforme instrução "em DELETE"
  const url = `${creds.url}/api/cliente/bloquear`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "MK-Auth-Key": creds.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id: clienteId })
  });
  if (!response.ok) throw new Error(`Erro API MK-Auth (desbloquearCliente): ${response.statusText}`);
  return response.json();
};
