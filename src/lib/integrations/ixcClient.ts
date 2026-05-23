export interface IXCCredentials {
  url: string;
  token: string;
  integrationKey?: string;
}

const buildHeaders = (credentials: IXCCredentials) => {
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
    ixcsoft: "listar", // often used for listar
  };
};

export const getCustomerByCpf = async (
  cpf: string,
  credentials: IXCCredentials,
) => {
  const endpoint = `${credentials.url}/webservice/v1/cliente`;
  const sanitizedCpf = cpf.replace(/\D/g, ""); // maybe need masking depending on IXC version

  const payload = {
    qtype: "cliente.cnpj_cpf",
    query: sanitizedCpf,
    oper: "=",
    page: "1",
    rp: "20",
    sortname: "cliente.id",
    sortorder: "desc",
  };

  const response = await fetch(endpoint, {
    method: "POST", // the IXC API usually uses POST for queries
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
      ixcsoft: "listar",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const getCustomerFinancial = async (
  customerId: string,
  credentials: IXCCredentials,
) => {
  const endpoint = `${credentials.url}/webservice/v1/fn_areceber`;

  const payload = {
    qtype: "fn_areceber.id_cliente",
    query: customerId,
    oper: "=",
    page: "1",
    rp: "50",
    sortname: "fn_areceber.data_vencimento",
    sortorder: "asc",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
      ixcsoft: "listar",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const getConnectionStatus = async (
  customerId: string,
  credentials: IXCCredentials,
) => {
  const endpoint = `${credentials.url}/webservice/v1/radusuarios`;

  const payload = {
    qtype: "radusuarios.id_cliente",
    query: customerId,
    oper: "=",
    page: "1",
    rp: "20",
    sortname: "radusuarios.id",
    sortorder: "desc",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
      ixcsoft: "listar",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const generateSecondCopy = async (
  invoiceId: string,
  credentials: IXCCredentials,
) => {
  const endpoint = `${credentials.url}/webservice/v1/get_boleto`;

  const payload = {
    boletos: invoiceId,
    juros: "S",
    multa: "S",
    atualiza_boleto: "S",
    tipo_boleto: "link",
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
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const unlockCustomer = async (
  customerId: string,
  credentials: IXCCredentials,
) => {
  // O desbloqueio no IXC costuma ser na rota cliente_desbloqueio_confianca ou radusuarios
  // Vamos usar o exemplo genérico que o user pediu
  // Aqui assumimos que ele mande o ID para a rotina de desbloqueio em confiança.
  // Vou criar uma rota baseada num padrão
  const endpoint = `${credentials.url}/webservice/v1/cliente_desbloqueio_confianca`;

  const payload = {
    id_cliente: customerId,
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
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

export const getCTOStatus = async (
  ctoId: string,
  credentials: IXCCredentials,
) => {
  const endpoint = `${credentials.url}/webservice/v1/olt_cto/${ctoId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  // Map IXC structure if needed or return direct depending on adapter
  return data;
};

export const getOLTStatus = async (
  oltId: string,
  credentials: IXCCredentials,
) => {
  const endpoint = `${credentials.url}/webservice/v1/olt/${oltId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials.token).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`IXC API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};
