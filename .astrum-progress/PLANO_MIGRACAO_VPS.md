# PLANO DE MIGRAÇÃO PARA VPS

> Escrito por Claude Sonnet 5 em 2026-08-25, tarefa **I1** de
> `.astrum-progress/PLANO_ACAO_100_OPERACIONAL.md` (Fase 7 — Infraestrutura).
> **Este documento é só o plano.** Nenhum passo de execução foi rodado — a migração real
> é uma sessão dedicada (Lucas + Claude), com o Lucas decidindo o provedor antes de começar.

## Contexto

Hoje a produção inteira roda numa única máquina Windows 10 local:

- **Fastify** (`apps/api`, único backend desde a Fase 4 — ver `CLAUDE.md` R4) sobe direto
  com `node dist/cluster.js`, gerenciado por `scripts/infra/deploy_run_backend.bat` /
  `deploy_restart_backend.bat` e uma Windows Scheduled Task (`AstrumBackendRun`).
- **Redis** e **Qdrant** rodam em Docker Desktop/WSL2 (`docker-compose.yml`, serviços
  `redis` + `qdrant`; `zep`/`zep-nlp` também estão no compose mas não fazem parte do
  caminho crítico atual).
- **Cloudflare Tunnel** (`cloudflared tunnel run astrum-api`, config em
  `C:\Users\<user>\.cloudflared\config.yml`) expõe `https://api.astrumlabs.online` sem
  abrir porta nenhuma no roteador — o tunnel ID já existe e o DNS já aponta pra ele.
- **Deploy**: runner self-hosted do GitHub Actions (`.github/workflows/deploy.yml`) roda
  nessa mesma máquina e dispara `deploy_restart_backend.bat`.
- **Healthcheck**: `scripts/infra/healthcheck_monitor.mjs` roda a cada 5min via Windows
  Scheduled Task, faz self-heal via `schtasks /run /tn AstrumBackendRun` e alerta no
  Sentry quando o self-heal falha (ver memória `astrum-backend-caiu-sem-monitoramento`).

**Riscos que a VPS resolve:** energia, rede residencial, Windows Update forçando reboot,
Docker Desktop cold-start (sintoma do `ETIMEDOUT` do Redis no boot — ver memória
`astrum-redis-etimedout-boot`), e a máquina do Lucas precisar ficar ligada 24/7.

**O que a VPS NÃO resolve sozinha** (fora de escopo aqui, ver `I2` no plano-mãe): API e
20+ workers ainda no mesmo processo Node — um worker vazando memória ainda derruba a API,
só que agora numa VPS em vez de num PC de mesa.

---

## 1. Requisitos

### Runtime

| Item | Versão exigida | Onde está fixado hoje |
|---|---|---|
| Node.js | **20 LTS** | `apps/api/Dockerfile` (`node:20-alpine`, 3 estágios) |
| Redis | **7** | `docker-compose.yml` (`redis:7-alpine`) |
| Qdrant | **v1.9.7** | `docker-compose.yml` (`qdrant/qdrant:v1.9.7`) — só é crítico se algum
  `VECTOR_STORE_PROVIDER` em produção apontar pra ele; confirmar antes de assumir que é
  obrigatório subir |
| Docker + Docker Compose v2 | qualquer versão recente | `docker-compose.yml` já existe e
  já é o formato certo pra produção (rede `internal` isolada, sem bind externo em Redis/Qdrant) |

**Recomendação:** usar o `docker-compose.yml` que já existe no repo (serviço `api` já
buildado a partir do `Dockerfile` de produção) em vez de rodar `node dist/cluster.js` nu
na VPS. Ele já resolve isolamento de rede, healthcheck de container e `restart:
unless-stopped` — que substitui boa parte do self-heal manual do monitor (ver seção 5).

### Tunnel / DNS

`api.astrumlabs.online` já é uma **rota de Cloudflare Tunnel** (CNAME gerenciado pelo
Cloudflare pro tunnel ID, não um A record fixo pra um IP). Isso simplifica a migração:
não existe propagação de DNS pra esperar — o "cutover" é só decidir **qual máquina** roda
o processo `cloudflared` conectado a esse tunnel ID (detalhe na seção 3).

Duas opções de exposição na VPS:

1. **Reusar o mesmo Cloudflare Tunnel** (recomendado) — copiar
   `~/.cloudflared/<tunnel-id>.json` (credentials-file) + `config.yml` pra VPS, trocar só
   o `service:` do ingress pra `http://localhost:3001` (mesmo valor de hoje, já que o
   Fastify continua na 3001). Zero mudança de DNS, rollback instantâneo.
2. **DNS direto + reverse proxy (nginx/Caddy) na VPS com Let's Encrypt** — mais "padrão
   VPS", mas perde a vantagem de não precisar abrir porta 443/firewall e adiciona TTL de
   DNS na hora do rollback. Só vale a pena se o Cloudflare Tunnel virar um problema em si
   (não é o caso hoje).

Este plano assume a opção 1.

### Variáveis de ambiente necessárias (nomes, sem valores)

Levantado via `grep -rhoE "process\.env\.[A-Z_]+" apps/api/src packages/queue/src`.
**Os valores continuam só na máquina do Lucas / no `.env` local — nunca vão pro git nem
pro chat.** Agrupado por criticidade:

**Core (sem isso a API não sobe):**
`NODE_ENV`, `PORT` / `FASTIFY_PORT`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`, `JWT_SECRET`, `ALLOWED_ORIGINS`

**Segurança / criptografia:**
`CPF_ENCRYPTION_KEY`, `CPF_ENCRYPTION_KEYS_PREVIOUS`, `WEBHOOK_HMAC_SECRET`,
`SUPER_SECRET_TOKEN`, `AUTH_REVOCATION_FAIL_CLOSED`, `STRICT_TENANT_GUARD`,
`TENANT_RLS_ROUTES_ENABLED`

**Provedores de IA (R3, CLAUDE.md — fallback multi-provider):**
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `PROVIDER_ORDER`,
`PROVIDER_FAILOVER_ENABLED`

**Integrações externas (cobrança, assinatura, WhatsApp, e-mail):**
`ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `CLICKSIGN_API_KEY`,
`D4SIGN_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_WEBHOOK_SECRET`,
`TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`, `EMAIL_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET`,
`META_PAGE_ACCESS_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `FACEBOOK_APP_SECRET`

**Infra auxiliar (Qdrant/R2/Zep — só se de fato usados em produção hoje):**
`QDRANT_URL`, `QDRANT_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `ZEP_API_URL`, `ZEP_API_KEY`, `VECTOR_STORE_PROVIDER`,
`VECTOR_STORE_URL`, `VECTOR_STORE_API_KEY`, `VECTOR_STORE_COLLECTION`, `VECTOR_MIN_SCORE`

**Observabilidade:**
`SENTRY_DSN`, `LOG_LEVEL`, `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`

**Feature flags (~35 vars `*_ENABLED`, ex.: `MULTI_AGENT_ENABLED`, `BANDIT_ENABLED`,
`CRAG_ENABLED`, `NIGHTLY_BRAIN_ENABLED`, `VOICE_*`, etc.):** não são bloqueantes — a
maioria tem default seguro (`false`/desligado) no código. Copiar o `.env` de produção
inteiro (via canal seguro, ex. `scp` com chave SSH — nunca por chat/git) resolve isso de
uma vez em vez de recriar flag por flag.

**Ação concreta na hora da migração:** copiar o `.env` real de produção da máquina Windows
pra VPS via `scp`/rsync sobre SSH (chave, não senha). Não recriar do zero — risco de
esquecer uma flag e mudar comportamento sem querer.

---

## 2. Escolha de provedor (opções BR / baixa latência)

Preços aproximados em 2026-08, sujeitos a confirmação no momento da contratação — câmbio e
tabelas mudam. Critério: região em **São Paulo** (menor latência pra ISPs e clientes
brasileiros, que são o público do Astrum) + suporte a Docker sem fricção.

| Provedor | Região | Specs sugeridas | Preço aprox./mês | Observação |
|---|---|---|---|---|
| **Vultr — São Paulo** | BR (GRU) | 2 vCPU / 4 GB RAM / 80 GB NVMe ("High Frequency") | ~US$ 24 (~R$ 135) | Mais simples de provisionar, snapshot fácil pra rollback de disco inteiro, firewall de borda incluso |
| **Oracle Cloud (OCI) — São Paulo** | BR (GRU) | Ampere A1 (ARM), até 4 OCPU / 24 GB no *Always Free* | R$ 0 (free tier) ou baixo custo acima disso | Melhor custo-benefício se a conta for aprovada (cartão internacional + verificação); ARM exige rebuildar a imagem Docker pra `arm64` (`node:20-alpine` suporta, mas testar antes) |
| **AWS EC2 — sa-east-1 (São Paulo)** | BR | `t3.medium` (2 vCPU / 4 GB) | ~US$ 30–35 (~R$ 170–195) + tráfego/EBS | Mais caro, mas ecossistema maduro (CloudWatch, snapshots automatizados, IAM) se o Astrum for crescer pra multi-instância depois |

**Recomendação:** começar com **Vultr São Paulo** — preço previsível, sem letra miúda de
free tier, setup de Docker em poucos minutos, e dá pra migrar pra AWS depois se a escala
justificar. Decisão final é do Lucas.

---

## 3. Passo a passo do cutover (com rollback)

Ordem pensada pra manter a produção atual (Windows) **rodando até o último passo** — nada
é desligado até o novo ambiente já estar validado, então o rollback é sempre "desligar o
novo e religar o antigo", nunca "torcer pra reconstruir o antigo às pressas".

1. **Provisionar a VPS** — criar a instância, instalar Docker + Docker Compose v2, abrir
   só porta 22 (SSH) no firewall — a 3001 fica só em `localhost` (o `docker-compose.yml`
   já expõe assim: `"3001:3001"` bind em todas interfaces, então além do firewall de borda
   do provedor, considerar restringir a bind pra `127.0.0.1:3001:3001` já que quem
   vai acessar é só o `cloudflared` local).
2. **Clonar o repositório** na VPS (deploy key ou token do GitHub, read-only).
3. **Copiar o `.env`** da máquina Windows pra VPS via `scp` sobre SSH (nunca por git/chat).
4. **Subir os containers** (`docker compose up -d`) — API + Redis + Qdrant na VPS,
   **sem tocar no tunnel ainda**. A produção real continua 100% na máquina Windows.
5. **Validar localmente na VPS**: `curl http://localhost:3001/api/v2/health` de dentro da
   própria VPS. Se falhar, ajustar sem pressa — nada em produção foi afetado.
6. **Instalar `cloudflared` na VPS** e copiar `config.yml` + `<tunnel-id>.json` (credentials
   file) da máquina Windows. **Não rodar ainda** — só deixar pronto (`cloudflared tunnel
   run astrum-api` parado).
7. **Cutover real** (janela curta, avisar antes se possível):
   a. Windows: parar o `cloudflared` local (`taskkill` no processo, ou o
      `stop_astrum.bat`/equivalente que já existe em `scripts/infra/`).
   b. VPS: iniciar `cloudflared tunnel run astrum-api`.
   c. Como é o mesmo tunnel ID, o Cloudflare passa a rotear `api.astrumlabs.online` pro
      processo da VPS **imediatamente** — sem esperar TTL de DNS.
8. **Smoke-test** (checklist da seção 4). Se tudo passar, o cutover está feito.

### Rollback (se algo falhar no passo 7 ou 8)

1. VPS: parar o `cloudflared`.
2. Windows: iniciar o `cloudflared` local de novo (o backend Windows nunca foi desligado
   nos passos 1–6, então ele já está pronto pra receber tráfego de novo).
3. Tráfego volta a rotear pro Windows em segundos — mesmo mecanismo do passo 7c, só que
   invertido. Nenhuma mudança de DNS, nenhuma espera de propagação.
4. Investigar a falha na VPS com calma, repetir do passo 4 quando corrigido.

Só depois de **alguns dias** de VPS estável em produção real é que faz sentido desligar
de vez o ambiente Windows (parar os serviços, mas não apagar nada — R5, CLAUDE.md).

---

## 4. Checklist de smoke-test pós-cutover

- [ ] `GET https://api.astrumlabs.online/api/v2/health` → 200
- [ ] Login (`POST /api/v2/auth/login` ou equivalente) com usuário de teste → JWT válido
      (lembrar: é JWT próprio, não Supabase Auth — ver memória `astrum-apps-api-login-separado`)
- [ ] Fluxo `/trial` completo (signup) grava no Supabase de verdade (ver bugs corrigidos em
      `astrum-trial-login-bugs-2026-08-24` — confirmar que não regrediram)
- [ ] Um worker de fila processa um job real de ponta a ponta (ex.: disparar uma cobrança de
      teste ou checar logs do `cobrai.worker.ts` processando algo da fila do Redis)
- [ ] Redis sem `ETIMEDOUT` nos logs do container API nos primeiros minutos
- [ ] `POST /api/v2/cobranca/emergency-stop` e `POST /api/v2/atendimento/emergency-stop`
      respondem (mesmo sem acionar de verdade) — freios de emergência têm que estar de pé
- [ ] Sentry recebendo eventos novos (gerar um erro de teste controlado e confirmar no
      dashboard)
- [ ] Frontend legado (Vercel, `astrumlabs.online`) consegue falar com a API nova sem CORS
      quebrado (`ALLOWED_ORIGINS` migrou certo)
- [ ] Healthcheck monitor adaptado (seção 5) rodando e escrevendo em `logs/healthcheck.log`

---

## 5. Adaptação do healthcheck monitor pra VPS

O `scripts/infra/healthcheck_monitor.mjs` atual depende de duas coisas específicas do
Windows que não existem na VPS (Linux):

1. **Self-heal via `schtasks /run /tn "AstrumBackendRun"`** — Windows Task Scheduler.
2. **Agendamento via Windows Scheduled Task** (`install_healthcheck_monitor.bat` +
   `run_healthcheck_hidden.vbs`), rodando a cada 5min.

Adaptação:

- **Self-heal**: trocar `tryRestart()` de `schtasks /run` para `docker restart astrum-api`
  (o container já tem `restart: unless-stopped`, então crashes simples o Docker já resolve
  sozinho — o monitor só precisa cobrir o caso de o processo estar "vivo mas travado",
  onde o container não crashou mas para de responder). Rodando o monitor **dentro da
  própria VPS**, `docker restart astrum-api` é um comando local, sem SSH remoto.
- **Agendamento**: trocar a Windows Scheduled Task por **cron** (`*/5 * * * * cd
  /caminho/do/repo && node scripts/infra/healthcheck_monitor.mjs >> logs/healthcheck-cron.log
  2>&1`) ou um **systemd timer**, o que for mais consistente com o resto do provisionamento
  da VPS.
- **O que NÃO muda**: a lógica de `checkHealth`, `alert`/Sentry, `FAILS_BEFORE_ACTION`,
  `REALERT_MINUTES` e o check do `PUBLIC_HEALTH_URL` continuam exatamente iguais — eles não
  são específicos de Windows. `PUBLIC_HEALTH_URL` (`https://api.astrumlabs.online/...`)
  continua útil como segundo sinal: se o `LOCAL_HEALTH_URL` falha mas o `PUBLIC_HEALTH_URL`
  funciona, o problema é só no processo local do monitor (ou o monitor está rodando na
  máquina errada); se os dois falham, é a API mesmo.
- Este trabalho de fato (editar o `.mjs`, trocar o agendador) fica pra hora da migração —
  aqui é só o plano.

---

## Fora de escopo deste documento

- Separar workers da API em processo dedicado (**I2** no plano-mãe — depende desta tarefa
  concluir, spec detalhada será escrita depois).
- Decisão final de provedor — fica com o Lucas.
- Qualquer execução real (provisionamento, DNS, cutover) — este arquivo é só o plano.
