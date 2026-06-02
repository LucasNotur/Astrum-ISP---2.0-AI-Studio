import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Cliente Axios configurado para o Fastify backend.
 * Interceptor automático: adiciona JWT em todas as requests.
 * Interceptor de resposta: renova token em caso de 401.
 */
export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Adicionar JWT em cada request
apiClient.interceptors.request.use((config) => {
  const session = JSON.parse(
    localStorage.getItem('astrum_auth') ?? 'null'
  );

  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }

  return config;
});

// Renovar token em caso de 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      const session = JSON.parse(localStorage.getItem('astrum_auth') ?? 'null');

      if (session?.refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/api/v2/auth/refresh`, {
            refreshToken: session.refreshToken,
          });

          // Salvar novo token
          localStorage.setItem('astrum_auth', JSON.stringify({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          }));

          // Retry com novo token
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return axios(original);
        } catch {
          // Refresh falhou → logout
          localStorage.removeItem('astrum_auth');
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);
