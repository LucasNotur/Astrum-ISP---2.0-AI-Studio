# Backend Local + Tunnel Cloudflare

## Uso rápido

1. Abra o Docker Desktop
2. Dê dois cliques em **INICIAR.bat**
3. Espere as 3 janelas abrirem
4. Na janela **"Tunnel API (3001)"**, copie a URL `https://xxx.trycloudflare.com`
5. Cole essa URL no Vercel Dashboard → Settings → Environment Variables → `VITE_API_URL`
6. Redeploy no Vercel (ou espere o próximo push)

Para parar: dois cliques em **PARAR.bat**

## Arquitetura

```
Vercel (frontend)
    │
    │  VITE_API_URL = https://xxx.trycloudflare.com
    ▼
cloudflared tunnel ──► localhost:3001 (Fastify v2 API)
                       localhost:3000 (Express legado)
                       localhost:6379 (Redis via Docker)
                       localhost:6333 (Qdrant via Docker)
```

## Scripts disponíveis

| Arquivo | O que faz |
|---|---|
| **INICIAR.bat** | Sobe tudo: Docker → Server → Tunnels |
| **PARAR.bat** | Para tudo |
| docker-up.bat | Só Docker (Redis + Qdrant) |
| docker-down.bat | Para Docker |
| servidor.bat | Só Node.js (Express + Fastify) |
| tunnel-api.bat | Só tunnel para porta 3001 |
| tunnel-webhook.bat | Só tunnel para porta 3000 |
| status.bat | Verifica o que está rodando |

## CORS — importante

O `.env` tem `ALLOWED_ORIGINS`. Para o frontend Vercel funcionar,
adicione o domínio do Vercel e o domínio do tunnel:

```
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://seu-app.vercel.app,https://xxx.trycloudflare.com
```

## URL muda a cada reinício

Tunnels rápidos do Cloudflare geram uma URL aleatória. Cada vez que
reiniciar, a URL muda e você precisa atualizar no Vercel.

Para URL fixa, configure um tunnel nomeado:

```bash
cloudflared tunnel login
cloudflared tunnel create astrum-api
cloudflared tunnel route dns astrum-api api.seudominio.com
```

Depois troque o `VITE_API_URL` no Vercel para `https://api.seudominio.com` (nunca mais muda).
