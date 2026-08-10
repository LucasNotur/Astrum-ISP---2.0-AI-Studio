# Runbooks de Segurança e Operação — Astrum ISP
**Gerado pela auditoria de 2026-08-10.** Complementa `docs/AUDITORIA_PREPROD_2026-08-10.md`.
Cada runbook é acionável por qualquer pessoa de plantão. Datas/prazos LGPD são legais — não estimativas.

> Pré-requisito de todos: ter um **inventário de segredos** atualizado (quais existem, onde vivem,
> quem tem acesso) e um canal de incidente (ex.: um grupo dedicado). Hoje os segredos vivem em
> `.env` plano no host — o runbook de rotação assume isso e recomenda cofre (SEC-R6).

---

## RB-1 · Chave `service_role` do Supabase vazou (ex.: commit no GitHub)
**Gravidade: máxima.** A `service_role` é a god-key: bypassa RLS e lê/escreve a base de todos os ISPs.

**Primeiros 15 minutos (contenção):**
1. Supabase Dashboard → Settings → API → **Roll `service_role` key** (gera nova, invalida a antiga).
2. Atualizar `SUPABASE_SERVICE_ROLE_KEY` no host de produção e no Vercel (env) → **redeploy/restart** do backend.
3. Se o vazamento foi em repositório: remover do histórico (`git filter-repo`) **e** considerar a chave comprometida para sempre (rotação é a correção real, não o rewrite).
4. Revisar `get_logs`/audit_log por acesso anômalo desde a data provável do vazamento (SELECTs em massa, mudanças de `role`/`tenant_id`, exports).

**Próximas horas (erradicação + avaliação de dano):**
5. Rotacionar TODO segredo que compartilhava o mesmo host/arquivo (`JWT_SECRET`, `ERP_CRED_KEY`, `OPENAI_API_KEY`, `WEBHOOK_HMAC_SECRET`, `REDIS_PASSWORD`) — assuma que quem viu um viu todos.
6. Se houve acesso confirmado a dados pessoais → acionar **RB-6 (notificação LGPD/ANPD)**.
7. Post-mortem: por que a chave chegou ao repo? Mover para cofre (Doppler/Vault) e adicionar secret-scan **bloqueante** (OBS-04).

---

## RB-2 · Suspeita de vazamento/abuso cross-tenant (P0-A / P0-B / MT-01)
Sintoma: um tenant relata ver dados de outro, ou logs mostram um usuário virando `super_admin` sozinho.

1. **Conter o vetor imediato**: aplicar as propostas de `docs/remediation/` na ordem P0-B → P0-A → MT-01
   (em branch, testar, promover). Enquanto isso, mitigação de emergência: `REVOKE SELECT ON public.vw_agent_customers, public.vw_agent_invoices, public.vw_agent_tickets FROM anon, authenticated;`
2. **Identificar contas suspeitas**: `SELECT id, tenant_id, role, updated_at FROM users WHERE role='super_admin' OR updated_at > <janela>;` — validar cada super_admin contra a lista conhecida.
3. **Reverter escaladas**: corrigir `role`/`tenant_id` adulterados (com base no audit_log/backup); revogar sessões dos afetados (ver RB-4).
4. Avaliar quais dados foram acessados; se PII → **RB-6**.
5. Corrigir a raiz (não só a instância): MT-02 (backend por service_role), teste de RLS real (OBS-02).

---

## RB-3 · Rotação de um segredo vazado (procedimento genérico)
Ordem para minimizar downtime (rotacionar **antes** de revogar o antigo quando possível):
1. Gerar novo valor (`scripts/generate-secrets.sh` para os HMAC/cifra).
2. Publicar o novo em **todos** os consumidores (host, Vercel, workers, Docker) — para chaves de cifra
   (`ERP_CRED_KEY`, cifra de CPF) isto exige **recifrar os dados** com a nova chave antes de aposentar a antiga
   (ver SEC-R7 — falta key-id/versão; hoje trocar a chave sem recifrar torna os dados indecifráveis).
3. Invalidar/rotacionar o antigo no provedor.
4. Confirmar funcionamento (health checks, um fluxo real) e registrar a rotação (data, quem, porquê).

---

## RB-4 · Revogar sessões / conter conta comprometida
1. **Uma conta**: bloquear via blacklist (`src/lib/tokenBlacklist.ts` — revoke por `jti` e revoke global por `uid`).
   Setar `updated_at`/timestamp de revogação para invalidar tokens emitidos antes.
2. **Todas de um tenant** (ex.: ISP comprometido): `revokeTenantUserTokens(tenantId, ...)` em `src/lib/authVerify.ts:134`.
3. ⚠️ **Atenção fail-open (AUTH-04)**: a checagem de blacklist é fail-open se o Redis cair — durante um incidente,
   confirmar que o Redis está saudável, senão a revogação não é garantida. Correção pendente: fail-closed.
4. Forçar troca de senha (fluxo Supabase Auth) e, para contas privilegiadas, exigir MFA na volta.

---

## RB-5 · Rollback de deploy e cutover de engine
**Rollback de deploy (frontend/Vercel):** promover o deployment anterior no painel Vercel (imutável).
**Backend:** como hoje roda de forma não-gerenciada (INFRA-01), o "rollback" é `git checkout <tag-boa>` + restart —
outra razão para migrar a build de produção para host gerenciado com versões imutáveis.

**Cutover/rollback de engine (R6 / flags):**
- Billing: `COBRAI_ENGINE=legacy|v2` — rollback = voltar a env e reiniciar. ⚠️ **BILL-07**: o guard é lido no import;
  garanta que **os dois workers não sobem juntos** durante a troca (risco de dunning duplo). Pare o worker antigo antes de subir o novo.
- Atendimento: `ATENDIMENTO_ENGINE=legacy|v2` — idem. O espelhamento shadow (`evolutionWebhook.ts:105`) é fire-and-forget e não afeta o rollback.
- Nenhuma das duas engines de um domínio deve receber tráfego real simultaneamente.

---

## RB-6 · Incidente com dados pessoais — LGPD / ANPD
Aplicável quando há acesso não autorizado, vazamento ou perda de dados pessoais de assinantes.
1. **Registrar** o incidente (o que, quando, quantos titulares, quais categorias — inclui CPF? financeiro? localização?).
2. **Conter e erradicar** (RB-1/RB-2/RB-4).
3. **Avaliar risco aos titulares** (probabilidade + gravidade do dano). Considerar o agravante de **transferência
   internacional** — o banco está em `us-east-2` (EUA) e subprocessadores (OpenAI/Anthropic/Gemini/Vercel/Sentry) fora do Brasil.
4. **Comunicar à ANPD e aos titulares** em prazo razoável quando houver risco relevante (Lei 13.709/2018, art. 48).
   Preparar comunicação factual: natureza, dados afetados, medidas tomadas, o que o titular pode fazer.
5. **Post-mortem** e atualização do ROPA/DPIA. Reter evidências (logs, audit_log) — ⚠️ trilha hoje é mutável (BILL-08).

---

## RB-7 · Restore de backup (RPO/RTO — a definir e MEDIR)
> Hoje não há RPO/RTO documentados nem restore testado. Este runbook é o alvo a exercitar (game day).
1. Supabase: PITR/backups gerenciados — validar no plano atual até que ponto no tempo é possível voltar (isto **define o RPO real**).
2. Restaurar em projeto/branch **separado** primeiro; validar integridade (contagens por tenant, FKs).
3. Cronometrar o processo ponta a ponta → **isto define o RTO real**. Registrar. Repetir trimestralmente.
4. Nunca restaurar por cima da produção sem validação prévia no ambiente isolado.

---

## RB-8 · Canal WhatsApp (Evolution API) — número banido ou sessão sequestrada
1. **Banimento pelo WhatsApp**: ter número reserva pré-provisionado; repontar a instância Evolution; comunicar ISPs afetados.
   Com 10k usuários dependendo do canal, single número = risco de continuidade — planejar multi-número/multi-instância.
2. **Sessão/QR sequestrado**: rotacionar a instância, regenerar pareamento, revisar quem teve acesso ao QR/endpoint Evolution.
3. Revisar `EVOLUTION_API_KEY`/`WEBHOOK_HMAC_SECRET` (RB-3) e, ao expor webhooks, adicionar anti-replay (APPSEC-05).

---

## Pendências de processo (Squad S — Governança)
- **Pentest externo black-box humano** antes do go-live (esta auditoria é IA se auto-revisando).
- **Tabletop de resposta a incidente**: rodar RB-1 ao vivo ("a service_role vazou — o que cada um faz em 15 min?").
- **Offboarding**: checklist de revogação de acesso (Supabase, Vercel, GitHub, chaves LLM) quando alguém sai.
- **Break-glass** para a conta Dev/superusuário (`lucaspferraz123@gmail.com`): uso emergencial registrado/auditado,
  não privilégio máximo em uso rotineiro.
