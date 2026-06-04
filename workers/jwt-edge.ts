/**
 * Cloudflare Worker — JWT Edge Verification
 *
 * BLOCO 7 — Edge Computing
 *
 * OBJETIVO:
 * - Verificar JWT antes de a requisição chegar ao servidor Fastify
 * - Requisições sem JWT válido são bloqueadas na BORDA (Cloudflare PoP)
 * - Reduz carga no servidor: tokens inválidos nunca chegam ao backend
 * - Latência de verificação: ~1ms (vs ~50ms no servidor)
 *
 * ROTAS PROTEGIDAS: /api/v2/* (exceto /api/v2/auth/*)
 * ROTAS PÚBLICAS: /api/v2/auth/login, /api/v2/auth/refresh, /api/v2/health
 */

export interface Env {
  JWT_SECRET: string;
  BACKEND_URL: string;
}

const PUBLIC_PATHS = [
  '/api/v2/auth/login',
  '/api/v2/auth/refresh',
  '/api/v2/health',
  '/api/v2/webhooks/inbound', // webhooks inbound são autenticados via HMAC
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Permitir rotas públicas sem autenticação
    const isPublic = PUBLIC_PATHS.some(path => url.pathname.startsWith(path));
    if (isPublic) {
      return fetch(new Request(env.BACKEND_URL + url.pathname + url.search, request));
    }

    // Apenas verificar rotas protegidas
    if (!url.pathname.startsWith('/api/v2/')) {
      return fetch(new Request(env.BACKEND_URL + url.pathname + url.search, request));
    }

    // Extrair token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verificar JWT com Web Crypto API (nativa no Cloudflare Workers)
    const isValid = await verifyJwtEdge(token, env.JWT_SECRET);

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Token válido → encaminhar para o backend
    const backendRequest = new Request(
      env.BACKEND_URL + url.pathname + url.search,
      request,
    );

    return fetch(backendRequest);
  },
};

async function verifyJwtEdge(token: string, secret: string): Promise<boolean> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) return false;

    // Decodificar payload para verificar expiração
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return false; // Token expirado
    }

    // Verificar assinatura com Web Crypto
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify'],
    );

    const signatureBytes = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0),
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);

    return crypto.subtle.verify('HMAC', key, signatureBytes, data);

  } catch {
    return false;
  }
}
