# PARTE 2 — IA-11 a IA-46 — Fase 1 (o chão) + Fase 2 (os andares)

> **Para a IA executora (Sonnet):** este arquivo completa o `PARTE1_IA01-IA10_backend.md`
> (IA-01..IA-10). Reestruturado em 2026-07-05 em DUAS FASES:
>
> - **FASE 1 (IA-11 + 14 sessões):** tecnologias cuja implementação depende SÓ de código
>   que existe HOJE no repo — todas expandidas aqui em densidade total ("camisa 9"):
>   arquivos reais auditados, esqueletos de código, migrations, microcópia, testes.
>   Você só chuta.
> - **FASE 2 (21 sessões):** tecnologias que estendem código que ainda vai nascer
>   (IA-04/07/08/09 da Parte 1 e sessões da Fase 1). Ficam como galhos estruturados.
>   **O plano detalhado da Fase 2 será escrito DEPOIS da Fase 1 executada**, auditando os
>   diffs e logs REAIS produzidos (git log, PROGRESS_LOG, código mergeado) — nunca contra
>   código imaginado. Regra RN16 abaixo.
>
> Ordem geral de execução: **Parte 1 (IA-01..IA-10) → Fase 1 (esta) → gate RN16 →
> Plano detalhado da Fase 2 → Fase 2.** Sessões da Fase 1 não dependem da Parte 1
> (podem intercalar se o Lucas mandar), mas NUNCA rode duas sessões em paralelo.
>
> Auditoria de frontend: `.astrum-progress/ia-nextgen/AUDITORIA_FRONTEND.md` (leitura obrigatória).
> Armadilhas: Apêndice B (Parte 1) + Apêndice C (frontend) + Apêndice D (achados novos).

---

## §0 — PROTOCOLO (herda §0 do PLANO_MESTRE_V2.md e §0/RN1–RN7 do PARTE1_IA01-IA10_backend.md)

### 0.1 Ritual de início de TODA sessão
1. Ler `PLANO_MESTRE_V2.md` §0 (R1–R6, DoD) e `PARTE1_IA01-IA10_backend.md` §0/§1/Apêndice B.
2. Ler `.astrum-progress/ia-nextgen/AUDITORIA_FRONTEND.md` INTEIRO.
3. Últimas 3 entradas do `PROGRESS_LOG.md`; `git status` + `git log --oneline -5`.
4. Branch `feat/ia-XX-<slug>` a partir de `main`.
5. Primeira sessão ⬜ da FASE 1 deste arquivo. Fase 2 é INEXECUTÁVEL até o gate RN16.

### 0.2 Regras RN8–RN16
- **RN8 — Nenhuma sessão termina sem tela integrada** (quando a sessão tem UI): rota
  acessível pelo nav real; ponta a ponta com flag ligada sem mock; estados loading
  (Skeleton p/ fetch >300ms), vazio (EmptyState com ação) e erro (o que houve + como
  resolver); print/gravação no PROGRESS_LOG. Sessões marcadas "SEM UI própria" cumprem
  RN8 na página existente que modificam.
- **RN9 — Auditoria antes de codar.** Feita para o geral (AUDITORIA_FRONTEND.md + Apêndice D).
  Cada sessão relê por inteiro os arquivos que vai MODIFICAR antes do primeiro edit.
- **RN10 — Design System único (§1).** Tokens `--astrum-*` aditivos; linguagem de risco
  idêntica em toda tela.
- **RN11 — Flag no client** via `GET /api/v2/flags/public` (IA-11) + `useFeatureFlags()`
  fail-closed. Flag off = zero rastro no DOM.
- **RN12 — Sem tela órfã:** tudo sob a seção de nav "Inteligência" e rota
  `/intelligence/*`. Exceções justificadas no PROGRESS_LOG.
- **RN13 — Acessibilidade/i18n = DoD.** AA, foco visível, teclado, reduced-motion, cor
  nunca sozinha. Strings em `src/lib/i18n/pt-br.ts`.
- **RN14 — Microcópia é produto.** Os textos exatos estão escritos em cada sessão —
  use-os literalmente; mudanças de copy = decisão de produto, registrar no log.
- **RN15 — ML Python = ADR primeiro** (`ADR-ml-python-service.md`, escrita pela primeira
  sessão de Fase 2 que precisar — nenhuma sessão de Fase 1 precisa).
- **RN16 — GATE DA FASE 2.** A Fase 2 só pode começar quando: (a) Fase 1 100% executada
  (checkboxes + PROGRESS_LOG); (b) uma sessão de planejamento dedicada ("IA-F2-PLAN")
  reescrever os 21 galhos em densidade total AUDITANDO O CÓDIGO REAL mergeado — com
  `git log`, números de linha reais e logs de produção/staging das features da Fase 1 e
  da Parte 1. É proibido expandir sessão de Fase 2 contra código que não existe.

### 0.3 Ritual de fim de sessão
Igual à Parte 1 + prints (RN8) + atualizar `AUDITORIA_FRONTEND.md` se mudou nav/tokens/flags.

---

## §1 — ASTRUM-IA DESIGN SYSTEM (tokens obrigatórios — íntegra na revisão anterior deste
## arquivo; resumo operacional)

1. **Cores novas** no `@theme` de `src/index.css` (aditivas — NÃO tocar nos shadcn):
   `--color-astrum-signal:#00C2A8` (ação/ok) · `--color-astrum-fiber:#3D5AFE` (secundária)
   · `--color-astrum-amber:#F5A524` (médio) · `--color-astrum-orange:#F0713C` (alto) ·
   `--color-astrum-red:#E5484D` (crítico) · `--color-astrum-slate:#5B6472` (sem dado).
2. **Risco** = cor + rótulo TEXTO sempre; faixa 4px `border-l-4` em card/linha com risco.
   Proibido `--primary` para risco (no dark é vermelho — armadilha C4).
3. **Tipografia:** Space Grotesk display (`--font-display`, carregar no `index.html`);
   Inter corpo (já é `--font-sans`); **JetBrains Mono para todo número medido** (já é
   `--font-mono`). Escala 12/14/16/20/24/32/40; peso 700 só em número-herói.
4. **Forma:** grid 4px; raio via `--radius-*` (nunca px fixo — C3); sombra 2 níveis.
5. **Botões:** `Button` shadcn existente; 1 primary por tela; destructive sempre com
   ConfirmDialog; loading trava largura.
6. **Componentes compartilhados** (IA-11): `RiskBadge`, `RiskStripeCard`,
   `ConfidenceMeter`, `EmptyState`, `DataTablePro` (paginação sempre), `TimelineList`,
   `StatCard` — em `src/components/intelligence/`, sobre os primitivos `src/components/ui/*`.
7. **Gráficos:** Recharts (lib do repo); série de risco sempre nas 4 cores acima.
8. Campo/técnico = mobile-first; ops/dashboard = desktop-first; motion só com função.

---

## §2 — AUDITORIA — FEITA (2026-07-05): `AUDITORIA_FRONTEND.md` + Apêndice D deste arquivo.

---

## §3 — AS DUAS FASES

### FASE 1 — ordem de execução (base: código que existe hoje)
```
IA-11 Fundação de UI (hub + flags client + tokens)      ← primeiro, sempre
IA-19 Tool registry dinâmico                            ← base agentic (IA-16 usa)
IA-37 Batching de tool calls                            ← pequena, generate
IA-21 Constitutional classifier (nó de veto)
IA-16 GraphRAG leve (tool de grafo de rede)
IA-14 Atendimento multilíngue
IA-30 Compressão de contexto RAG
IA-27 Feature Store leve                                ← base ML (IA-07 da P1 consome)
IA-26 Multi-armed bandit (CobrAI v2)
IA-33 Drift detection
IA-34 Cost attribution por cliente/feature
IA-43 Failover multi-provider (port do src/ai-provider)
IA-44 Sandbox SQL do agente
IA-45 Synthetic data generator
IA-46 Replay engine                                     ← gate técnico do cutover S74/S82
```

### FASE 2 — galhos (INEXECUTÁVEIS até o gate RN16; lista no fim do arquivo)
IA-12 voice biometrics · IA-13 QA de voz · IA-15 OCR+fila de revisão · IA-17 MCP server ·
IA-18 A2A (GATED) · IA-20 debate (GATED) · IA-22 browsing agent · IA-23 LTV ·
IA-24 anomalia de rede · IA-25 forecast demanda · IA-28 perfil de comunicação ·
IA-29 active learning · IA-31 judge+Elo · IA-32 OpenLLMetry · IA-35 orçamento de latência ·
IA-36 edge inference · IA-38 SHAP+tela churn · IA-39 constitutional loop · IA-40 PII voz ·
IA-41 federated eval (GATED) · IA-42 spec tracker.

**Reconciliação dos ~55 itens** (inalterada): 2 duplicatas cruzadas; ~13 absorvidos na
Parte 1; 35 líquidos + IA-11 = IA-11..IA-46.

**Migrations:** os números `0XX_` abaixo são placeholders — RN5: rode
`ls packages/db/src/migrations/` e use o próximo número real NO DIA (Parte 1 também cria
migrations; a ordem de execução real define os números). Padrão RLS canônico =
`023_shadow_results.sql` (policy `tenant_isolation` com `app.current_tenant_id`).

---

## §4 — TEMPLATE POR SESSÃO — já aplicado em todas as sessões da Fase 1 abaixo. A sessão
## IA-F2-PLAN usará este mesmo template para expandir a Fase 2 (ver RN16).

---
---

# FASE 1 — SESSÕES EM DENSIDADE TOTAL

# ✅ IA-11 — Fundação: Central de Inteligência + flags no client + tokens Astrum-IA

**Objetivo:** o chão dos galhos: (a) endpoint público de flags com whitelist; (b) hook
`useFeatureFlags()` fail-closed; (c) tokens + fonte display; (d) componentes §1.6;
(e) seção "Inteligência" no Sidebar + rota `/intelligence` com hub; (f) strings pt-BR.
**Flag (server):** `INTELLIGENCE_HUB_ENABLED` default `false` · **client:** `hub`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/config/public-flags.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/flags.routes.ts` (+ teste) |
| MODIFICAR | `apps/api/src/domain/ia/index.ts` (registrar como as rotas irmãs) |

```ts
// public-flags.ts — whitelist explícita; NUNCA iterar process.env
const PUBLIC_FLAGS: Record<string, string> = {
  hub: 'INTELLIGENCE_HUB_ENABLED',
  // cada sessão IA-XX adiciona AQUI: '<chave client>': '<ENV_SERVER>'
};
export function getPublicFlags(): Record<string, boolean> {
  return Object.fromEntries(Object.entries(PUBLIC_FLAGS).map(
    ([key, env]) => [key, (process.env[env] ?? '').trim().toLowerCase() === 'true'],
  ));
}
```
`flags.routes.ts`: `GET /flags/public` → `{ flags: getPublicFlags() }`, sem auth (só
booleans), `Cache-Control: public, max-age=60`. Confirmar o prefixo real (`/api/v2`)
observando como as irmãs de `domain/ia/*.routes.ts` são registradas.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/lib/feature-flags.ts` + `src/hooks/useFeatureFlags.ts` (+ testes) |
| CRIAR | `src/lib/i18n/pt-br.ts` (objeto tipado; strings de TODAS as telas novas vivem aqui) |
| CRIAR | `src/pages/intelligence/IntelligenceHubPage.tsx` |
| CRIAR | `src/components/intelligence/{RiskBadge,RiskStripeCard,ConfidenceMeter,EmptyState,DataTablePro,TimelineList,StatCard}.tsx` (+ testes de RiskBadge, ConfidenceMeter, DataTablePro no mínimo) |
| MODIFICAR | `src/index.css` (bloco `--color-astrum-*` + `--font-display` no `@theme`) |
| MODIFICAR | `index.html` (Space Grotesk — mesmo mecanismo de carga da Inter; auditar) |
| MODIFICAR | `src/components/layout/Sidebar.tsx` (seção nova) |
| MODIFICAR | `src/App.tsx` (rota no bloco autenticado ~l.2958; `React.lazy`) |
| MODIFICAR | `src/store/useAppStore.ts` (tab `intelligence` no `canAccess` — C7) |

Regras:
1. `fetchPublicFlags()` usa a MESMA base URL de `src/lib/auth-v2.ts` (C6).
   `useFeatureFlags()` = TanStack Query, `queryKey:['public-flags']`, `staleTime:60_000`,
   `retry:1`. **Fail-closed:** erro/loading → `{}`. Expor `flags` e `isLoading`.
2. Sidebar — inserir após "Infra & Gestão", padrão exato dos headers (~l.180/227),
   funcionando colapsado E expandido (C8):
   `flags.hub && hasAccess('intelligence')` → header `Inteligência` + NavItem
   `label="Central de Inteligência"`, `icon={<Sparkles size={24}/>}`, `shortcut="Alt+I"`.
   Flag off → nem o header existe no DOM.
3. Hub: título display "Central de Inteligência" + subtítulo "Módulos de IA do seu
   provedor — ativados por ambiente." + grid (1/2/3 col) de `RiskStripeCard` a partir de
   `BRANCH_REGISTRY: {key, titulo, descricao, icone, rota}[]` filtrado pelas flags client
   (cada sessão futura adiciona sua entrada). Zero galho ativo → EmptyState: ícone
   Sparkles, **"Nenhum módulo de inteligência ativo neste ambiente."** / **"Os módulos são
   ativados por variável de ambiente. Consulte o plano IA-NEXTGEN."** (sem botão — exceção
   RN14 registrada: ativação é operacional).
4. Contratos: `RiskBadge({level:'baixo'|'medio'|'alto'|'critico'|'sem-dado'})` = pill
   ponto colorido + TEXTO; `RiskStripeCard({risk?,children})` = Card + `border-l-4`;
   `ConfidenceMeter({value:0..1})` = barra + % mono, cor ≥0.8 signal / ≥0.6 amber / senão
   orange, `aria-valuenow`; `DataTablePro` = Table shadcn + paginação (20/pág default) +
   `riskAccessor?` + slot `emptyState`; `StatCard({label,value,delta?})` valor mono 32/700.
5. Nenhum hex em componente — só classes de token (dark mode de graça).

### Contrato de API
`GET /api/v2/flags/public` → `200 {"flags":{"hub":true, ...}}`.

### Testes
```powershell
cd apps/api; npx vitest run src/infrastructure/config/public-flags.test.ts src/domain/ia
npx vitest run src/hooks src/components/intelligence
```
public-flags: whitelist não vaza env fora do mapa; `'true'/'TRUE '/'false'/ausente`.
useFeatureFlags: sucesso; erro→`{}`. Sidebar: flag off → `queryByText('Central de
Inteligência')` null; on+acesso → navega. RiskBadge: renderiza o TEXTO do nível.

### Critérios de aceite
- [ ] Default (off): DOM sem a seção; zero regressão nas 27 páginas (smoke manual).
- [ ] On: Sidebar → hub → EmptyState. Print no PROGRESS_LOG (light e dark).
- [ ] `npx tsc --noEmit` (raiz e apps/api) + vitest verdes.
- [ ] AA: RiskBadge e botões nos 2 temas.
**Rollback:** `INTELLIGENCE_HUB_ENABLED=false`.
**Commit:** `feat(ia11): fundação UI — hub Inteligência, flags públicas, tokens astrum`.

---

# ✅ IA-19 — Tool registry dinâmico

**Objetivo:** catálogo ÚNICO de tools (hoje `agentTools` tem 4 defs Zod mas o executor
implementa 8 — 4 tools são inalcançáveis pelo modelo, ver Apêndice D2) + liga/desliga por
tenant com efeito em runtime + contagem de uso, com tela de gestão.
**Flags:** `TOOL_REGISTRY_ENABLED` / client `toolreg`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_agent_tool_settings.sql` |
| CRIAR | `apps/api/src/infrastructure/ai/tool-registry.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/tools-admin.routes.ts` (+ teste) |
| MODIFICAR | `apps/api/src/infrastructure/ai/vercel-ai.service.ts` (`agentTools` completo + param `tools` em `streamWithTools`) |
| MODIFICAR | `apps/api/src/infrastructure/ai/tools.executor.ts` (fix D1 + contador de uso) |
| MODIFICAR | `apps/api/src/domain/agent/agent.nodes.ts` (`nodeGenerate` usa o registry) |
| MODIFICAR | `apps/api/src/infrastructure/config/public-flags.ts` (`toolreg`) |

Migration:
```sql
CREATE TABLE IF NOT EXISTS agent_tool_settings (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (tenant_id, tool_name)
);
CREATE TABLE IF NOT EXISTS tool_usage_daily (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  day DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, tool_name, day)
);
-- RLS nas duas: padrão 023 (policy tenant_isolation)
```

Regras:
1. **Catálogo fica em CÓDIGO** (Zod não serializa; schema dinâmico em JSONB é frágil).
   O banco guarda só `enabled` por tenant + uso. "Dinâmico" = o conjunto oferecido ao
   modelo é resolvido em runtime por tenant, com cache.
2. Completar `agentTools` com as 4 defs Zod faltantes (`check_coverage {cto_id?}`,
   `run_diagnostics {customer_id}`, `schedule_technical_visit {customer_id, reason,
   address?, scheduled_for?}`, `get_billing_status` como alias documentado) — descrições
   em pt-BR no padrão das existentes (`vercel-ai.service.ts:79-112`).
3. `tool-registry.ts`:
```ts
export async function getEnabledTools(tenantId: string): Promise<typeof agentTools> {
  if (!isToolRegistryEnabled()) return agentTools;            // flag off = hoje
  try {
    const cached = await redis.get(`toolreg:${tenantId}`);     // TTL 60s
    const disabled: string[] = cached ? JSON.parse(cached) : await loadDisabled(tenantId);
    return Object.fromEntries(Object.entries(agentTools)
      .filter(([name]) => !disabled.includes(name))) as typeof agentTools;
  } catch (err) {
    infraLogger.warn({ err }, 'tool-registry indisponível — fail-open (todas as tools)');
    return agentTools;                                          // RN4
  }
}
```
4. `streamWithTools(messages, systemContext, tenantId, onToolCall, opts?: { tools? })` —
   `tools: (opts?.tools ?? agentTools) as any` na linha 218. `nodeGenerate` chama
   `getEnabledTools(state.tenantId)` e passa.
5. `ToolsExecutor.execute`: (a) **fix D1** — remover o `case 'check_invoice'` duplicado
   (linha 25; mantém o alias `get_billing_status`); (b) tool desabilitada → `{ error:
   'Ferramenta desativada pelo provedor' }` (defesa em profundidade: o modelo não deveria
   nem vê-la); (c) fire-and-forget upsert `tool_usage_daily` (`calls+1`, `errors+1` se o
   resultado tem `error`), `.catch` com `warn`.
6. Rotas admin (auth = mesmo decorator das irmãs `domain/ia/*.routes.ts`, papel admin):
   `GET /ia/tools` → `[{name, description, enabled, calls7d, errors7d}]`;
   `PATCH /ia/tools/:name` body `{enabled: boolean}` → upsert + `DEL toolreg:{tenantId}`.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ToolsPage.tsx` (+ teste) |
| MODIFICAR | `IntelligenceHubPage.tsx` (BRANCH_REGISTRY: key `toolreg`, título "Ferramentas do Agente", desc "Controle o que a IA pode fazer no seu provedor.", ícone `Wrench`, rota `/intelligence/tools`) |
| MODIFICAR | `src/App.tsx` (rota `/intelligence/tools`) · `src/lib/i18n/pt-br.ts` |

```
┌ Ferramentas do Agente ─────────────────────────────────────────┐
│ O que a IA pode executar neste provedor. Alterações valem em   │
│ até 1 minuto.                                                  │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Ferramenta         Uso 7d   Erros   Status               │   │
│ │ check_invoice       412      2      [Switch on]          │   │
│ │ suspend_signal       18      0      [Switch on]  ⚠️      │   │
│ │ ...                                                      │   │
│ └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```
- `DataTablePro`; colunas Uso/Erros em `font-mono`; erros>0 → texto amber.
- Switch shadcn por linha. Desligar tool FINANCEIRA (`suspend_signal`) → ConfirmDialog:
  título **"Desativar 'Suspender sinal'?"**, corpo **"O agente deixa de conseguir
  suspender sinal de inadimplentes imediatamente. A régua de cobrança automática não é
  afetada."**, botões **"Desativar"** (destructive) / **"Cancelar"**. Demais tools:
  desliga direto.
- Toasts: **"Ferramenta desativada — vale em até 1 minuto."** / **"Ferramenta
  reativada."** Erro de rede: toast erro **"Não foi possível salvar. Verifique sua
  conexão e tente de novo."** + Switch volta ao estado anterior (optimistic rollback).
- Loading: Skeleton de 6 linhas. Vazio: impossível (catálogo em código) — não tratar.

### Contrato de API
`GET /api/v2/ia/tools` → `200 [{"name":"check_invoice","description":"...","enabled":true,"calls7d":412,"errors7d":2}]`
`PATCH /api/v2/ia/tools/suspend_signal` body `{"enabled":false}` → `200 {"ok":true}` · 404 tool inexistente · 403 sem papel.

### Testes
Backend (`cd apps/api; npx vitest run src/infrastructure/ai/tool-registry.test.ts src/infrastructure/ai/tools.executor.test.ts src/domain/ia`):
flag off → `getEnabledTools` retorna `agentTools` sem tocar Redis (spy); disabled filtra;
Redis fora → fail-open; executor recusa desabilitada; contador incrementa (mock supabase);
PATCH limpa o cache. Front: Switch off dispara PATCH e rollback em erro.

### Critérios de aceite
- [ ] Flag off = `agentTools` completo (8 tools) oferecido como hoje; zero query nova.
- [ ] Flag on: desligar `check_coverage` na tela → próxima mensagem o modelo não recebe a
      def (provar por log do `streamWithTools`); executor recusa se forçado.
- [ ] As 4 tools antes inalcançáveis agora aparecem e executam (e2e staging: "agenda uma
      visita técnica pra mim" cria `service_orders`).
- [ ] Fix D1 commitado com teste que teria pego (case duplicado).
- [ ] RN8 completo (nav→tela→dado real; print).
**Rollback:** flags off. **Commit:** `feat(ia19): tool registry por tenant + catálogo unificado (flag off)`.

---

# ⬜ IA-37 — Batching de tool calls

**Objetivo:** tool calls independentes do mesmo step executam em paralelo — hoje o loop é
sequencial (`vercel-ai.service.ts:220-232`: `for … await onToolCall(...)`).
**Flags:** `TOOL_BATCHING_ENABLED` (server only — SEM UI própria; RN8 cumprido com a
métrica na `AIObservabilityPage`).

### Backend
| Ação | Arquivo |
|---|---|
| MODIFICAR | `apps/api/src/infrastructure/ai/vercel-ai.service.ts` (onStepFinish) |
| MODIFICAR | `apps/api/src/infrastructure/ai/vercel-ai.service.test.ts` |

```ts
onStepFinish: async (step) => {
  if (!step.toolCalls?.length || !onToolCall) return;
  const t0 = Date.now();
  if (isToolBatchingEnabled()) {
    const results = await Promise.allSettled(step.toolCalls.map(tc => {
      infraLogger.info({ tool: tc.toolName, args: tc.input, tenantId }, 'Tool called by agent');
      return onToolCall(tc.toolName, tc.input);
    }));
    const failed = results.filter(r => r.status === 'rejected').length;
    infraLogger.info({ tools: step.toolCalls.length, failed, batchMs: Date.now() - t0,
      tenantId }, 'Tool batch executed');
  } else {
    for (const toolCall of step.toolCalls) { /* loop atual, inalterado */ }
  }
},
```
Regras: 1. Rejeição de UMA tool não derruba as outras (`allSettled`); a rejeitada loga
`error` e o resultado dela vira `{error:...}` para o modelo (comportamento do executor já
é retornar objeto de erro — exceção real só se o próprio callback lançar; envolver em
try/catch interno). 2. **Ordem de `toolsExecuted` fica não-determinística** — o
`nodeGenerate` já faz push via callback; testes que assertavam ordem passam a ordenar por
nome. 3. Teto `stepCountIs(5)` inalterado (armadilha B3).

### Testes
3 tools fake com delays 100/100/100ms → flag on: total <200ms; flag off: ≥300ms (fake
timers). 1 rejeitada → outras 2 completam e log registra `failed:1`.

### Critérios de aceite
- [ ] Flag off = byte a byte o loop atual (diff mostra só o branch novo).
- [ ] Log `Tool batch executed` com `batchMs` em staging com flag on.
- [ ] Suíte inteira de `apps/api` verde (nenhum teste dependia da ordem).
**Rollback:** flag off. **Commit:** `feat(ia37): tool calls paralelas no step (flag off)`.

---

# ⬜ IA-21 — Constitutional classifier (nó de veto dedicado)

**Objetivo:** um segundo classificador BARATO e INDEPENDENTE do gerador veta resposta
imprópria antes do envio (categorias fixas de ISP), com fila de revisão humana. Complementa
(não substitui) o `nodeValidate` regex e o futuro self-check da IA-01.
**Flags:** `SAFETY_CLASSIFIER_ENABLED` / client `safety`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_safety_vetoes.sql` |
| CRIAR | `apps/api/src/infrastructure/guardrails/safety-classifier.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/safety.routes.ts` (+ teste) |
| MODIFICAR | `apps/api/src/domain/agent/agent.state.ts` + `agent.nodes.ts` + `langgraph.service.ts` |
| MODIFICAR | `public-flags.ts` (`safety`) |

Migration: `safety_vetoes(id uuid pk default gen_random_uuid(), tenant_id uuid NOT NULL
REFERENCES tenants(id) ON DELETE CASCADE, conversation_id uuid, response_text text NOT
NULL, categories text[] NOT NULL, review_status text NOT NULL DEFAULT 'pending'
CHECK (review_status IN ('pending','veto_correto','falso_positivo')), created_at
timestamptz NOT NULL DEFAULT now())` + RLS 023 + índice `(tenant_id, review_status,
created_at DESC)`.

Serviço (decisão de modelo REGISTRADA: `gpt-4o-mini` com rubrica fixa — Llama-Guard-3
exigiria provider novo; medir custo/latência e reavaliar em produção):
```ts
export const SafetyVerdictSchema = z.object({
  safe: z.boolean(),
  categories: z.array(z.enum([
    'valor_ou_prazo_inventado',      // promete valor/data sem fonte no contexto
    'promessa_nao_autorizada',       // desconto/isenção/visita que a tool não confirmou
    'dado_de_outro_cliente',         // vazamento cruzado
    'orientacao_perigosa',           // mexer em fiação/poste etc.
    'fora_de_escopo_isp',
  ])).max(3),
});
export async function classifyResponseSafety(response: string, context: string,
  tenantId: string): Promise<SafetyVerdict> { /* generateObject, model gpt-4o-mini,
  headers Helicone UseCase 'safety-veto' (RN7), system: rubrica fixa das 5 categorias
  com 1 exemplo cada; PROMPT NO ARQUIVO, não inline no nó */ }
```
Estado (schema + channels — armadilha B1): `safetyVetoed: z.boolean().optional()`,
`safetyCategories: z.array(z.string()).optional()`.
Nó `nodeSafetyVeto` (short-circuit com flag off, padrão IA-01): roda o classificador
sobre `state.response` + `ragContext+dbContext`; `!safe` → grava `safety_vetoes`
(fire-and-forget) e retorna `safetyVetoed:true`. Fail-open (RN4): erro → `safe`.
Grafo: trocar o conditional de `validate` — `validate` passou → `'safety_veto'`;
`addConditionalEdges('safety_veto', s => s.safetyVetoed ? 'escalate' : END)`. Veto vai
para ESCALATE (humano assume — nunca silêncio para o cliente). Se a IA-01 já tiver sido
executada (self_check existe), o veto entra DEPOIS do validate igualmente — reler o grafo
real no dia (RN9).
Rotas: `GET /ia/safety/vetoes?status=pending` · `PATCH /ia/safety/vetoes/:id`
body `{review_status}` · `GET /ia/safety/stats` (vetos/dia 14d, por categoria).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/GuardrailsPage.tsx` (+ teste) |
| MODIFICAR | hub (key `safety`, "Guardrails", "Vetos do classificador de segurança e revisão humana.", ícone `ShieldCheck`, `/intelligence/guardrails`) · App.tsx · pt-br.ts |

```
┌ Guardrails ────────────────────────────────────────────────────┐
│ [Vetos hoje: 3] [Taxa de veto 7d: 0,8%] [Falsos positivos: 12%]│  ← StatCards mono
│ Pendentes de revisão                                           │
│ ┌─▌(orange) "Sua visita está confirmada para amanhã…"        ┐ │
│ │  promessa_nao_autorizada · há 2h                            │ │
│ │  [Veto correto]  [Falso positivo]                           │ │
│ └──────────────────────────────────────────────────────────---┘ │
└────────────────────────────────────────────────────────────────┘
```
- Lista = `RiskStripeCard` (orange) com o texto vetado (truncado 240 chars, expandir no
  clique), badges das categorias, botões Secondary **"Veto correto"** / Ghost **"Falso
  positivo"**. Toasts: **"Revisão registrada."** Ambos alimentam o dataset futuro (IA-29).
- Vazio: EmptyState ícone ShieldCheck, **"Nenhum veto pendente de revisão."** /
  **"O classificador está ativo e nenhuma resposta foi vetada recentemente."** (sem botão).
- Erro: **"Não foi possível carregar os vetos. Recarregue a página."** + botão "Recarregar".

### Contrato de API
`GET /api/v2/ia/safety/vetoes?status=pending&page=1` →
`200 {"items":[{"id","response_text","categories":["promessa_nao_autorizada"],"created_at"}],"total":3}`.

### Testes
Serviço: mock `ai`; resposta com promessa (fixture) → `safe:false` + categoria certa;
exceção → fail-open. Grafo: flag off = zero chamada (spy); veto → termina em `escalate`
E cliente recebe a mensagem de escalação (nunca a vetada). Front: botões PATCH + toast.

### Critérios de aceite
- [ ] Flag off: nenhuma chamada LLM extra (spy no teste do grafo).
- [ ] Fixture "Confirmo sua visita amanhã às 14h" SEM tool de agendamento no contexto →
      vetada, ticket de escalação criado, linha em `safety_vetoes`.
- [ ] Custo: header Helicone `safety-veto` visível (RN7).
- [ ] RN8 completo na tela (nav→dado real→print).
**Rollback:** flags off. **Commit:** `feat(ia21): classificador de segurança dedicado + fila de revisão (flag off)`.

---

# ⬜ IA-16 — GraphRAG leve (raciocínio relacional sobre a rede física)

**Objetivo:** o agente responde perguntas RELACIONAIS ("se a CTO X cair, quem é afetado?",
"qual CTO tem mais reincidência?") consultando o grafo rede↔clientes↔tickets em SQL —
SEM banco de grafo novo. Vira tool do agente + tela de consulta para ops.
**Flags:** `GRAPHRAG_ENABLED` / client `graphrag`. **Depende de:** IA-19 (catálogo).

### Backend
| Ação | Arquivo |
|---|---|
| AUDITAR+MIGRATION | `customers` tem vínculo com `network_ctos`? (015/016 criaram as tabelas; o vínculo NÃO foi confirmado na auditoria). Se não houver: `0XX_customers_cto_link.sql` → `ALTER TABLE customers ADD COLUMN IF NOT EXISTS cto_id UUID REFERENCES network_ctos(id); CREATE INDEX IF NOT EXISTS idx_customers_cto ON customers(tenant_id, cto_id);` |
| CRIAR | `apps/api/src/domain/rede/network-graph.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/rede/graph.routes.ts` (+ teste) |
| MODIFICAR | `vercel-ai.service.ts` (def Zod da tool) + `tools.executor.ts` (case novo) + `public-flags.ts` |

Tool (entra pelo catálogo da IA-19):
```ts
query_network_graph: {
  description: 'Consulta o grafo da rede física do provedor. Use para perguntas sobre impacto de falha em CTO, reincidência de problemas por região ou capacidade de portas.',
  parameters: z.object({
    mode: z.enum(['impacto_cto', 'reincidencia', 'capacidade']),
    cto_id: z.string().optional().describe('Obrigatório para impacto_cto'),
    days: z.number().min(1).max(90).default(30).describe('Janela p/ reincidencia'),
  }),
},
```
`network-graph.service.ts` — 3 consultas SQL nomeadas (deps injetáveis p/ teste):
`impactoCto(tenantId, ctoId)` → clientes na CTO + nº com ticket aberto + MRR somado em
centavos (B4); `reincidencia(tenantId, days)` → tickets por CTO via `customers.cto_id`,
ordenado desc, top 10; `capacidade(tenantId)` → CTOs com `used_ports/total_ports > 0.85`
(reusar as colunas já vistas em `_checkCoverage`, `tools.executor.ts:96-111`).
Rotas: `GET /rede/graph/impacto/:ctoId` · `GET /rede/graph/reincidencia?days=30` ·
`GET /rede/graph/capacidade` (auth admin, mesmas irmãs).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/NetworkGraphPage.tsx` (+ teste) |
| MODIFICAR | hub (key `graphrag`, "Grafo da Rede", "Impacto de falhas, reincidência e capacidade por CTO.", ícone `Network`, `/intelligence/graph`) · App.tsx · pt-br.ts |

3 abas (Tabs shadcn): **Impacto** (Select de CTO — carregar de `getNetworkCTOs` que JÁ
existe em `src/lib/db.ts` — + botão primary **"Calcular impacto"** → StatCards: clientes
afetados, com ticket aberto, MRR em risco (R$ mono) + DataTablePro dos clientes) ·
**Reincidência** (DataTablePro: CTO, tickets na janela, faixa de risco por quartil; select
de janela 7/30/90d) · **Capacidade** (RiskStripeCards das CTOs >85% ocupação: "CTO Centro
— 15/16 portas — crítico"). Link Ghost por CTO: **"Ver no mapa"** → `navigate('/map')`
(a MapPage existe). Vazio (Impacto sem CTO escolhida): **"Escolha uma CTO para simular o
impacto de uma falha."** Erro: padrão IA-21.

### Contrato de API
`GET /api/v2/rede/graph/impacto/:ctoId` → `200 {"cto":{"id","name"},"customers_total":38,
"customers_with_open_ticket":5,"mrr_at_risk_cents":379620,"customers":[{"id","name","plan","status"}]}`.

### Testes
Serviço com deps mock: impacto soma MRR certo em CENTAVOS; reincidência ordena; capacidade
filtra >0.85. Executor: tool nova roteia. Front: aba Impacto renderiza StatCards do fixture.

### Critérios de aceite
- [ ] Pergunta no chat "se a CTO <nome> cair, quantos clientes afeta?" → agente usa a tool
      e responde com o número EXATO do SQL (e2e staging, seed conhecido).
- [ ] MRR em risco bate com `SELECT SUM(monthly_value_cents)` manual (colar no log).
- [ ] Flag off: tool fora do catálogo; tela fora do hub/DOM.
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia16): graphrag leve — tool de grafo de rede + tela (flag off)`.

---

# ⬜ IA-14 — Atendimento multilíngue

**Objetivo:** cliente escreve em EN/ES → agente responde no idioma dele; a busca RAG
continua funcionando (query traduzida p/ pt-BR antes do retrieval). Sem pipeline de
tradução para pt: o GPT-4o responde direto no idioma (mais barato e natural).
**Flags:** `LIVE_TRANSLATION_ENABLED` / client `translate`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/ai/language-detector.ts` (+ `.test.ts`) — PURO |
| MODIFICAR | `agent.state.ts` (+`detectedLanguage: z.string().optional()`) + channels (B1) |
| MODIFICAR | `agent.nodes.ts` (`nodeClassify` detecta; `nodeFetchContext` traduz query p/ RAG; `nodeGenerate` instrui idioma) |
| MODIFICAR | `public-flags.ts` (`translate`) |

Regras:
1. Detector HEURÍSTICO puro (zero custo): stopwords pt/en/es (30 por idioma, no arquivo);
   score por contagem; empate ou <2 hits → `'pt'` (conservador). NUNCA LLM para detectar.
2. `nodeClassify` (flag on): `detectedLanguage = detectLanguage(state.userMessage)`;
   incluir no log existente do nó.
3. `nodeFetchContext`: se `detectedLanguage !== 'pt'` e vai buscar no Qdrant → traduzir a
   query com `gpt-4o-mini` (`generateObject {translated: z.string()}`, UseCase
   `rag-query-translate`, fail-open: erro → query original).
4. `nodeGenerate`: sufixo no `systemContext`: `\n\nIMPORTANTE: o cliente escreveu em
   ${nome do idioma}. Responda TODO o atendimento nesse idioma.` Idioma persiste na
   resposta salva: `message.worker` já grava `metadata` — adicionar `language`.

### Frontend
| Ação | Arquivo |
|---|---|
| MODIFICAR | `src/pages/AIConfigPage.tsx` (RELER INTEIRA antes — RN9): card "Atendimento multilíngue" com Switch + texto **"Quando ativo, a IA detecta o idioma do cliente e responde em inglês ou espanhol automaticamente. Português continua sendo o idioma padrão."** |
| MODIFICAR | `src/pages/ChatPage.tsx` (RELER INTEIRA): badge do idioma (`EN`/`ES`, slate, com tooltip "Detectado automaticamente") no cabeçalho da conversa quando `metadata.language !== 'pt'` |

SEM tela própria no hub (RN12 cumprido via AIConfigPage, que já está no nav — registrar
justificativa no PROGRESS_LOG). Toast do Switch: **"Atendimento multilíngue ativado."**

### Testes
Detector: 12 fixtures (4 por idioma, incluindo "hi, my internet is down" e "hola no tengo
internet"), curtas → 'pt'. Grafo: flag on + msg EN → `systemContext` contém a instrução e
busca usou query traduzida (spy no HybridSearchService mock); flag off → zero mudança.

### Critérios de aceite
- [ ] "My internet is not working since yesterday" → resposta 100% em inglês (e2e staging,
      print da conversa).
- [ ] Query RAG traduzida logada (UseCase `rag-query-translate` no Helicone).
- [ ] Flag off: nenhum campo novo em uso, nenhuma chamada extra.
**Rollback:** flags off. **Commit:** `feat(ia14): atendimento multilíngue com RAG traduzido (flag off)`.

---

# ⬜ IA-30 — Compressão de contexto RAG

**Objetivo:** cortar ≥30% dos tokens de contexto sem perder resposta: dedupe de sentenças
entre chunks + orçamento de tokens por seção. LLMLingua é Python — fase TS primeiro
(determinística, grátis); reavaliar LLMLingua na Fase 2 se o ganho estagnar.
**Flags:** `PROMPT_COMPRESSION_ENABLED` (server; client `compression` só p/ o StatCard).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/rag/context-compressor.ts` (+ `.test.ts`) — PURO |
| CRIAR | `packages/db/src/migrations/0XX_context_savings.sql` → `ALTER TABLE ai_performance_logs ADD COLUMN IF NOT EXISTS context_tokens_saved INTEGER;` |
| MODIFICAR | `agent.nodes.ts` (`nodeGenerate` comprime `systemContext` antes do stream) |
| MODIFICAR | `public-flags.ts` |

```ts
// context-compressor.ts — reusar estimateTokens (exportar de context-window.service.ts,
// hoje é função interna na linha 30 — export nomeado, sem mudar comportamento)
export interface CompressionResult { text: string; tokensBefore: number; tokensAfter: number; }
export function compressContext(sections: { label: string; text: string; budgetTokens: number }[],
): CompressionResult {
  // 1. Por seção: split em sentenças (regex /(?<=[.!?…])\s+/), normalizar
  //    (lowercase+trim+colapsar espaços), dedupe global via Set — a MESMA sentença vinda
  //    de 2 chunks do RAG entra 1x (mantém a 1ª ocorrência, ordem preservada).
  // 2. Truncar cada seção ao budget (corte em fronteira de sentença, nunca no meio).
  // 3. Montar com os labels originais. Retornar contagens.
}
```
Budgets default (constantes exportadas): RAG 2000 · DB 500 · Zep 500 tokens.
`nodeGenerate`: flag on → montar as 3 seções (já existem como `ragContext/dbContext/
zepContext`, linhas 222-226 de agent.nodes.ts) via compressor; logar
`{tokensBefore, tokensAfter, savedPct}`; somar `tokensSaved` no registro de custo da
IA-34 quando ela existir (campo `context_tokens_saved`).

### Frontend
MODIFICAR `src/pages/AICostsPage.tsx` (RELER INTEIRA — ela lê `ai_performance_logs`
direto do supabase client): StatCard **"Economia por compressão"** = soma de
`context_tokens_saved` no período × preço médio de input do 4o (usar o `MODEL_COSTS`
local da página, linha 23) — formato "1,2M tokens · ~$6,10". Tooltip: **"Tokens de
contexto removidos por deduplicação antes de chamar o modelo."** Sem tela própria (RN12
via AICostsPage; justificar no log).

### Testes
Compressor: dedupe entre seções preserva 1ª ocorrência; corte respeita fronteira de
sentença; budget 0 → seção vazia; texto menor que budget → intacto (tokensBefore==After).
Grafo: flag off → `systemContext` idêntico ao atual (snapshot test).

### Critérios de aceite
- [ ] Corpus de 20 queries reais de staging: média de economia ≥30% COM pass-rate do eval
      (IA-03, se já executada; senão 10 respostas comparadas manualmente) estável —
      relatório no PROGRESS_LOG.
- [ ] Flag off = contexto byte a byte igual (snapshot).
- [ ] StatCard com dado real na AICostsPage (print).
**Rollback:** flag off. **Commit:** `feat(ia30): compressão determinística de contexto RAG (flag off)`.

---

# ⬜ IA-27 — Feature Store leve

**Objetivo:** UMA fonte de features por entidade (cliente) para todo ML do produto —
treino e serving leem o mesmo valor. Sem Feast: tabela + registry TS tipado + worker
noturno. A IA-07 (churn, Parte 1) DEVE consumir daqui quando executar (nota cruzada:
ao executar IA-07, verificar se esta sessão já rodou e usar `feature-store.service` no
lugar de SQL próprio — registrar no PROGRESS_LOG de lá).
**Flags:** `FEATURE_STORE_ENABLED` / client `features`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_feature_store.sql` |
| CRIAR | `apps/api/src/domain/ml/feature-registry.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ml/feature-store.service.ts` (+ `.test.ts`) |
| CRIAR | `packages/queue/src/workers/feature-store.worker.ts` (padrão dos irmãos: imports relativos, `setupDLQ`, `addSentryToWorker` — copiar de `cobrai.worker.ts`; cron `0 2 * * *` America/Sao_Paulo; boot atrás da flag, log padrão engine-flags) |
| CRIAR | `apps/api/src/domain/ia/features.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` |

Migration:
```sql
CREATE TABLE IF NOT EXISTS feature_values (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,            -- 'customer' no MVP
  entity_id UUID NOT NULL,
  feature TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity_type, entity_id, feature)
);
-- RLS padrão 023 + índice (tenant_id, feature, computed_at DESC)
```
Registry (features iniciais, TODAS computáveis com dados de HOJE):
```ts
export const FEATURE_DEFS = [
  { name: 'tenure_days',            entity: 'customer', ttlHours: 24,
    describe: 'Dias desde o cadastro do cliente' },
  { name: 'overdue_count_90d',      entity: 'customer', ttlHours: 24,
    describe: 'Faturas vencidas nos últimos 90 dias' },
  { name: 'tickets_90d',            entity: 'customer', ttlHours: 24,
    describe: 'Tickets abertos nos últimos 90 dias' },
  { name: 'mrr_cents',              entity: 'customer', ttlHours: 24,
    describe: 'Mensalidade em centavos' },                       // B4
] as const;
```
`feature-store.service.ts`: `computeAllForTenant(tenantId)` — 1 query agregada por
feature (não N+1 por cliente!) com upsert em lote de 500; `getFeatures(tenantId,
customerId): Promise<Record<string, number|string>>` p/ serving; `getFreshness(tenantId)`
p/ a tela. Rota: `GET /ia/features` → catálogo + freshness + contagem de entidades.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/FeaturesPage.tsx` (+ teste) |
| MODIFICAR | hub (key `features`, "Catálogo de Features", "As variáveis que alimentam os modelos preditivos.", ícone `Database`, `/intelligence/features`) · App.tsx · pt-br.ts |

`DataTablePro` read-only: Feature (mono) · Descrição · Entidades (mono) · Atualizada
(relativo, `date-fns` já é dep; >24h → texto amber + RiskBadge médio "desatualizada") ·
TTL. Vazio (worker nunca rodou): EmptyState **"Nenhuma feature computada ainda."** /
**"O cálculo roda toda noite às 02h. Você também pode aguardar a primeira execução do
worker."** (sem botão de forçar no MVP — operação é via fila).

### Contrato de API
`GET /api/v2/ia/features` → `200 [{"name":"tenure_days","describe":"...","entities":812,
"computed_at":"2026-07-05T02:00:11Z","ttl_hours":24}]`.

### Testes
Registry: nomes únicos (teste que quebra se alguém duplicar). Service: upsert idempotente
(rodar 2x não muda contagem); `getFeatures` retorna mapa completo; freshness. Worker:
tenant com 3 clientes seed → 12 linhas (4 features × 3).

### Critérios de aceite
- [ ] Worker roda 1 tenant staging: `SELECT count(*) FROM feature_values` = clientes ×
      features (colar no log). Reexecução idêntica (idempotência).
- [ ] `getFeatures` responde <50ms p/ 1 cliente (é 1 PK lookup).
- [ ] RN8 na tela (freshness real; print).
**Rollback:** flags off (worker não sobe). **Commit:** `feat(ia27): feature store leve + catálogo (flag off)`.

---

# ⬜ IA-26 — Multi-armed bandit nas mensagens de cobrança (CobrAI v2)

**Objetivo:** em vez de template fixo por régua, variantes de mensagem competem via
Thompson sampling; conversão = pagamento em ≤7 dias. **Honestidade R6:** isso instrumenta
o worker V2 (`packages/queue/src/workers/cobrai.worker.ts`); dados reais só fluem após o
cutover `COBRAI_ENGINE=v2` (S76). Constrói-se e testa-se agora; liga-se depois.
**Flags:** `BANDIT_ENABLED` / client `bandit`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_campaign_variants.sql` |
| CRIAR | `apps/api/src/domain/cobranca/bandit.ts` (+ `.test.ts`) — PURO |
| CRIAR | `apps/api/src/domain/cobranca/variant-picker.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/campaigns.routes.ts` (+ teste) |
| MODIFICAR | `packages/queue/src/workers/cobrai.worker.ts` (RELER INTEIRO — RN9: achar o ponto onde o template da regra vira mensagem; o serviço de regras usa `interpolateTemplate` de `cobrai-rules.service.ts:20-27`) |
| MODIFICAR | `public-flags.ts` |

Migration:
```sql
CREATE TABLE IF NOT EXISTS campaign_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,        -- ex.: 'overdue_d3' (regra da régua)
  variant_key TEXT NOT NULL,         -- 'a', 'b', ...
  template TEXT NOT NULL,            -- mesmo formato {{var}} do interpolateTemplate
  alpha INTEGER NOT NULL DEFAULT 1,  -- sucessos+1 (prior Beta(1,1))
  beta INTEGER NOT NULL DEFAULT 1,   -- fracassos+1
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  UNIQUE (tenant_id, campaign_key, variant_key)
);
CREATE TABLE IF NOT EXISTS variant_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL, variant_id UUID NOT NULL REFERENCES campaign_variants(id),
  invoice_id UUID NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT CHECK (outcome IN ('paid','expired')), resolved_at TIMESTAMPTZ
);
-- RLS 023 nas duas + índice variant_sends (tenant_id, outcome) WHERE outcome IS NULL
```
`bandit.ts` — puro, com RNG injetável p/ teste determinístico:
```ts
/** Amostra Gamma(shape,1) — Marsaglia & Tsang (2000); shape>=1 aqui pois alpha,beta>=1 */
export function sampleGamma(shape: number, rng: () => number): number { /* d=shape-1/3;
  c=1/sqrt(9d); loop: x=normal(rng) via Box-Muller, v=(1+c*x)^3, aceita se
  ln(u) < 0.5x²+d-dv+d*ln(v) */ }
export function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const a = sampleGamma(alpha, rng), b = sampleGamma(beta, rng); return a / (a + b);
}
export function pickVariant(vs: {id: string; alpha: number; beta: number}[],
  rng: () => number = Math.random): string {
  return vs.map(v => ({ id: v.id, s: sampleBeta(v.alpha, v.beta, rng) }))
           .sort((x, y) => y.s - x.s)[0].id;
}
```
Regras: 1. Picker no worker (flag on + variantes ativas ≥2 para a `campaign_key`; senão
template da regra, comportamento atual intacto). Grava `variant_sends`. 2. Recompensa:
job diário reprocessa `variant_sends` com `outcome IS NULL`: fatura paga ≤7d do envio →
`alpha+1, outcome='paid'`; >7d → `beta+1, outcome='expired'`. Fatura CANCELADA não conta
(nem alpha nem beta — outcome 'expired' com nota). 3. Pausar variante → sai do sorteio na
hora. 4. Rotas: `GET /ia/campaigns` (variantes + taxa + IC) · `PATCH
/ia/campaigns/variants/:id` `{status}` · `POST /ia/campaigns/variants` (criar variante).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/CampaignsPage.tsx` (+ teste) |
| MODIFICAR | hub (key `bandit`, "Campanhas Inteligentes", "Variantes de mensagem de cobrança competindo por conversão.", ícone `Target`, `/intelligence/campaigns`) · App.tsx · pt-br.ts |

Por campanha (Card): BarChart Recharts — conversão por variante (barras em fiber; a líder
em signal) + tabela: Variante · Template (truncado, tooltip completo) · Envios (mono) ·
Conversão % (mono) · Status. Botão Ghost por linha **"Pausar"** → ConfirmDialog
**"Pausar a variante B?"** / **"Ela sai do sorteio imediatamente. Os envios já feitos
continuam contando conversão."** → toast **"Variante pausada — tráfego realocado."**
Botão Secondary **"Nova variante"** → Dialog com textarea do template + hint das
variáveis `{{nome}} {{valor}} {{vencimento}} {{link}}` (conferir as vars REAIS usadas
pelos templates do tenant ao reler o worker). Badge por campanha: **"explorando"**
(slate) se IC das variantes se sobrepõe, **"convergiu"** (signal) senão (IC 95% beta:
aproximação normal está OK no MVP). Vazio: **"Nenhuma campanha com variantes ainda."** /
botão primary **"Criar primeira variante"**.

### Testes
`bandit.ts` com RNG seedado: `sampleBeta(90,10)` médio ≈0.9 (±0.05 em 2000 amostras);
`pickVariant` converge — simulação 1000 rodadas, variante com p=0.3 vs 0.1 recebe >70%
do tráfego na metade final. Picker: flag off → template da regra (spy). Recompensa:
paga em 5d → alpha+1; 8d → beta+1; cancelada → não conta.

### Critérios de aceite
- [ ] Flag off: worker v2 byte a byte como antes (teste).
- [ ] Simulação sintética documentada no PROGRESS_LOG (convergência provada).
- [ ] R6 intacto: NENHUMA linha tocada em `/src` (grep no diff).
- [ ] RN8 na tela com dados da simulação em staging.
**Rollback:** flags off. **Commit:** `feat(ia26): thompson sampling nas mensagens CobrAI v2 (flag off)`.

---

# ⬜ IA-33 — Drift detection

**Objetivo:** alerta quando a distribuição de intents/sentimentos muda vs baseline (PSI)
— modelo degradando ou clientela mudando. Requer persistir contagens (hoje o intent só
vai pro log — gap real).
**Flags:** `DRIFT_DETECTION_ENABLED` / client `drift`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_drift.sql` |
| CRIAR | `apps/api/src/domain/ml/psi.ts` (+ `.test.ts`) — PURO |
| CRIAR | `packages/queue/src/workers/drift.worker.ts` (cron `0 4 * * *`, padrão irmãos) |
| CRIAR | `apps/api/src/domain/ia/drift.routes.ts` (+ teste) |
| MODIFICAR | `agent.nodes.ts` (`nodeClassify`: upsert fire-and-forget em `ai_intent_daily`) |
| MODIFICAR | `public-flags.ts` |

Migration: `ai_intent_daily(tenant_id uuid NOT NULL, day date NOT NULL, intent text NOT
NULL, sentiment text, count integer NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, day,
intent, COALESCE(sentiment,''))` — atenção: PK com COALESCE exige índice único de
expressão, não PK; usar `UNIQUE INDEX`) + `drift_reports(id uuid pk, tenant_id, metric
text, psi numeric, severity text CHECK (severity IN ('ok','medio','alto')), details
jsonb, created_at timestamptz default now())` + RLS 023.
```ts
// psi.ts
export function psi(expected: Record<string, number>, actual: Record<string, number>): number {
  // união de categorias; proporções com suavização epsilon=1e-4 (categoria ausente não
  // explode o ln); PSI = Σ (pA - pE) * ln(pA/pE)
}
export function psiSeverity(v: number): 'ok'|'medio'|'alto' {
  return v < 0.1 ? 'ok' : v < 0.25 ? 'medio' : 'alto';   // cortes clássicos de PSI
}
```
Worker: por tenant, `actual` = últimos 7d de `ai_intent_daily`, `expected` = 28d
anteriores; PSI de intents e de sentimentos; grava `drift_reports`; severity ≠ ok → também
cria notificação (reusar o mecanismo de `notifications` — tabela existe desde a 016;
auditar o insert padrão). Rotas: `GET /ia/drift/reports?days=30` · `GET /ia/drift/current`.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/DriftPage.tsx` (+ teste) |
| MODIFICAR | hub (key `drift`, "Drift do Modelo", "A conversa dos clientes mudou? O modelo continua calibrado?", ícone `Activity`, `/intelligence/drift`) · App.tsx · pt-br.ts |

Topo: 2 `RiskStripeCard` (Intents / Sentimentos) com PSI atual (mono, 3 casas) +
RiskBadge (`ok`→baixo, `medio`→médio, `alto`→alto). Meio: BarChart agrupado —
distribuição 7d × baseline 28d por intent (7d em fiber, baseline em slate 40%). Base:
LineChart do PSI diário 30d com linhas de corte 0.1/0.25 tracejadas. Vazio (menos de 7d
de dados): **"Coletando a linha de base."** / **"O primeiro relatório de drift sai com 7
dias de conversas classificadas."** Erro: padrão.

### Testes
psi: distribuições idênticas → 0; categoria nova com 20% → >0.1; suavização não explode
com categoria ausente; severity nos cortes exatos (0.1/0.25). Worker: fixture 7d vs 28d
gera report coerente. nodeClassify: flag on grava contagem (mock), flag off não.

### Critérios de aceite
- [ ] Deslocamento sintético (injetar 7d com 40% `cancel_service` vs baseline 5%) →
      report `alto` + notificação criada (staging, colar query no log).
- [ ] Flag off: zero write novo no nodeClassify (spy).
- [ ] RN8 na tela.
**Rollback:** flags off. **Commit:** `feat(ia33): drift PSI de intents/sentimento + painel (flag off)`.

---

# ⬜ IA-34 — Cost attribution por cliente e feature

**Objetivo:** de "gastamos $X" para "gastamos $X com o cliente Y na feature Z".
A base JÁ existe (migration 028: `tokens_in/out, model, cost_usd` em
`ai_performance_logs`; `AICostsPage` lê e calcula) — faltam as dimensões e o plumbing.
**Flags:** server nenhuma nova (gravação extra é inócua) / client `costdrill` (abas novas).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_ai_costs_dimensions.sql` → `ALTER TABLE ai_performance_logs ADD COLUMN IF NOT EXISTS customer_id UUID, ADD COLUMN IF NOT EXISTS conversation_id UUID, ADD COLUMN IF NOT EXISTS use_case TEXT; CREATE INDEX IF NOT EXISTS idx_aiperf_customer ON ai_performance_logs (tenant_id, customer_id, created_at);` |
| CRIAR | `apps/api/src/infrastructure/observability/cost-recorder.ts` (+ `.test.ts`) |
| MODIFICAR | `langgraph.service.ts` (`processMessage` grava 1 linha agregada por mensagem) |
| MODIFICAR | `agent.nodes.ts` (`nodeGenerate`: capturar usage — hoje `state.tokensUsed` fica 0 SEMPRE, ver D4) |
| MODIFICAR | `public-flags.ts` (`costdrill`) |

Regras:
1. **Fix D4:** no `nodeGenerate`, após consumir o stream: `const usage = await
   streamResult.usage;` (AI SDK v6 expõe promise de usage no resultado do `streamText` —
   confirmar o nome exato do campo na versão instalada ANTES de codar; se indisponível,
   estimar com `estimateTokens` e marcar `estimated:true`). Retornar
   `tokensUsed: usage.totalTokens` no patch do nó.
2. `cost-recorder.ts`: `recordMessageCost({tenantId, customerId, conversationId, model,
   tokensIn, tokensOut, useCase})` → `cost_usd` calculado com TABELA DE PREÇO ÚNICA
   server-side (constante exportada `MODEL_PRICING` — os valores hoje vivem duplicados no
   client, `AICostsPage.tsx:23-30`; o server passa a ser a fonte; a página migra a ler
   `cost_usd` gravado em vez de recalcular). Fire-and-forget + fail-open.
3. `processMessage` (linhas 127-154): após `finalState`, gravar com
   `use_case='agent_response'`. Chamadas avulsas (classify etc.) continuam via Helicone;
   atribuição fina por nó fica para quando IA-32 (OTel) existir — escopo honesto.

### Frontend
MODIFICAR `src/pages/AICostsPage.tsx` (RELER INTEIRA — RN9): adicionar Tabs **"Visão
geral"** (o conteúdo atual, intacto) / **"Por cliente"** / **"Por feature"** — as 2 novas
só renderizam com flag client `costdrill`.
- Por cliente: `DataTablePro` — Cliente · Conversas (mono) · Tokens (mono) · Custo $
  (mono) · % do total (barra inline fiber). Ordenado por custo desc. Drill-down `Sheet`:
  conversas do cliente com custo cada, link para a conversa no ChatPage.
- Por feature: mesma tabela por `use_case` (`agent_response`, `classify-intent`, ... —
  os UseCases já padronizados pela RN7).
- Vazio (colunas novas ainda sem dado): **"Sem dados de atribuição ainda."** / **"Os
  custos passam a ser atribuídos por cliente a partir da ativação desta versão — os
  dados antigos não são reprocessados."**

### Testes
cost-recorder: preço certo por modelo (fixture 4o e 4o-mini, 6 casas); falha de insert
não propaga. processMessage: grava com os IDs do estado (mock). Front: soma da coluna
% = 100 ± arredondamento (teste da função de agregação, extraída pura).

### Critérios de aceite
- [ ] 10 mensagens e2e em staging → 10 linhas com `customer_id`/`use_case` preenchidos e
      `cost_usd > 0` (colar SELECT no log).
- [ ] Soma do drill-down = total do período (consistência, teste + verificação manual).
- [ ] D4 corrigido: `tokensUsed` real no retorno do grafo (era sempre 0).
- [ ] Aba antiga intacta sem a flag client.
**Rollback:** flag client off (server continua gravando — inócuo e útil).
**Commit:** `feat(ia34): atribuição de custo por cliente/feature + fix tokensUsed`.

---

# ⬜ IA-43 — Failover multi-provider (port do `src/ai-provider/`)

**Objetivo:** OpenAI caiu → Anthropic/Gemini assumem. **R3 manda PORTAR** a lógica que já
existe (`src/ai-provider/`: `ai-provider.service.ts`, `types.ts`, adapters
openai/anthropic/gemini) — decisão de port registrada: a POLÍTICA (ordem, classificação
de erro retryável, circuito) é portada; os CLIENTES viram providers do AI SDK
(`@ai-sdk/anthropic`, `@ai-sdk/google` — instalar) porque o motor novo é 100% AI SDK.
Reimplementar a política do zero = violação de R3.
**Flags:** `PROVIDER_FAILOVER_ENABLED` / client `failover`.

### Backend
| Ação | Arquivo |
|---|---|
| AUDITAR | `src/ai-provider/ai-provider.service.ts` + `types.ts` INTEIROS (RN9) — extrair: ordem de fallback, classificação de erros, timeouts |
| CRIAR | `apps/api/src/infrastructure/ai/providers/model-router.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/providers.routes.ts` (+ teste) |
| MODIFICAR | `vercel-ai.service.ts` (trocar `openai('gpt-4o[-mini]')` fixos por `getModel(tier)`) |
| MODIFICAR | `apps/api/src/infrastructure/config/env.validator.ts` (`ANTHROPIC_API_KEY?`, `GOOGLE_API_KEY?`, `PROVIDER_ORDER?`) + `public-flags.ts` |

```ts
// model-router.ts
type Tier = 'mini' | 'full';
const TIER_MODELS: Record<string, Record<Tier, string>> = {
  openai:    { mini: 'gpt-4o-mini',            full: 'gpt-4o' },              // R3
  anthropic: { mini: 'claude-haiku-4-5-20251001', full: 'claude-sonnet-5' },
  google:    { mini: 'gemini-2.5-flash',        full: 'gemini-2.5-pro' },
};   // ⚠️ conferir IDs vigentes dos 3 na doc oficial NO DIA (nomes mudam)
export function getModel(tier: Tier): LanguageModel { /* flag off → openai direto (hoje);
  flag on → 1º provider da ordem com circuito FECHADO e key presente */ }
export async function withFailover<T>(tier: Tier, fn: (m: LanguageModel) => Promise<T>): Promise<T> {
  /* tenta na ordem; erro retryável (5xx/timeout/rate-limit — classificação PORTADA do
     legado) → abre circuito opossum (reusar circuit-breaker.config.ts de adapters/openai)
     e tenta o próximo; erro não-retryável (4xx de conteúdo) propaga.
     Streaming: failover SÓ antes do 1º token (depois, aborta e propaga — honesto). */
}
```
`generateObject`/`generateText` do `vercel-ai.service` passam por `withFailover`;
`streamWithTools` usa `getModel('full')` (failover pré-stream). Log obrigatório:
`{event:'provider_failover', from, to, reason, tenantId}`.
Rota: `GET /ia/providers/status` → por provider: key presente, circuito
(aberto/fechado/meio-aberto via opossum stats), latência média 24h (Redis rolling).

### Frontend
| Ação | Arquivo |
|---|---|
| MODIFICAR | `src/pages/AIObservabilityPage.tsx` (RELER INTEIRA): seção "Providers" — 3 Cards: nome, RiskBadge (fechado=baixo "operando" / meio-aberto=médio "instável" / aberto=crítico "fora"), latência média (mono), "sem chave" (slate) quando não configurado. Polling 30s (TanStack Query refetchInterval) |
| MODIFICAR | `src/pages/AIConfigPage.tsx`: card "Ordem de fallback" — lista arrastável (`@hello-pangea/dnd`, já é dep) das 3 providers; persistir em config do tenant SÓ se já existir mecanismo de config por tenant na página (auditar); senão exibir a ordem da env como read-only com nota **"Definida pelo ambiente (PROVIDER_ORDER)."** — não inventar tabela de config nova nesta sessão |

### Testes
model-router: flag off → sempre openai; ordem respeitada; key ausente pula; circuito
aberto pula; erro não-retryável NÃO faz failover; classificação de erro portada (casos do
legado reproduzidos como fixtures). Rota de status: shape estável.

### Critérios de aceite
- [ ] Staging com `OPENAI_API_KEY` inválida de propósito + flag on → mensagem respondida
      pela Anthropic; log `provider_failover` + badge crítico no painel (prints).
- [ ] Flag off: zero mudança de comportamento (openai direto).
- [ ] Diff mostra a política PORTADA (comentários citando o arquivo legado de origem) —
      R3 auditável.
**Rollback:** flag off. **Commit:** `feat(ia43): failover multi-provider portado do ai-provider legado (flag off)`.

---

# ⬜ IA-44 — Sandbox SQL do agente (somente leitura, defesa dupla)

**Objetivo:** consultas analíticas com segurança física: role Postgres read-only +
validação de AST — nunca "confiar no prompt". Console super-admin prova o sandbox; expor
como tool do agente é decisão FUTURA (Fase 2, com o registry IA-19 maduro).
**Flags:** `AGENT_SANDBOX_ENABLED` / client `sandbox`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_agent_readonly_role.sql` |
| CRIAR | `apps/api/src/infrastructure/sandbox/sql-guard.ts` (+ `.test.ts`) — PURO |
| CRIAR | `apps/api/src/infrastructure/sandbox/sandbox-db.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/sandbox.routes.ts` (+ teste) |
| MODIFICAR | `env.validator.ts` (`SANDBOX_DB_URL?`) + `public-flags.ts` |

Migration (idempotente com `DO $$ ... IF NOT EXISTS`):
```sql
-- role sem login direto em prod supabase? CONFIRMAR: no Supabase, criar role e GRANT é
-- permitido via SQL; a connection string do sandbox usa um usuário dedicado (criar no
-- painel/CLI e documentar no README da migration — a migration cria role+grants).
CREATE ROLE agent_readonly NOLOGIN;  -- guard IF NOT EXISTS via DO-block
CREATE OR REPLACE VIEW vw_agent_customers AS
  SELECT id, tenant_id, plan, status, created_at FROM customers;      -- SEM nome/cpf/endereço (LGPD)
CREATE OR REPLACE VIEW vw_agent_invoices AS
  SELECT id, tenant_id, customer_id, amount_cents, status, due_date, paid_at FROM invoices;
CREATE OR REPLACE VIEW vw_agent_tickets AS
  SELECT id, tenant_id, customer_id, category, priority, status, created_at FROM tickets;
GRANT SELECT ON vw_agent_customers, vw_agent_invoices, vw_agent_tickets TO agent_readonly;
ALTER ROLE agent_readonly SET statement_timeout = '3s';
ALTER ROLE agent_readonly SET default_transaction_read_only = on;
```
`sql-guard.ts`: parser `pgsql-ast-parser` (instalar; é TS puro) — aceita SOMENTE
1 statement `SELECT`; recusa CTE com DML, `SELECT ... INTO`, funções na denylist
(`pg_sleep`, `pg_read_file`, `dblink`, `lo_*`); recusa tabela fora da allowlist
(`vw_agent_*`); injeta `LIMIT 500` se ausente; injeta filtro `tenant_id = $1` se a view
tem a coluna e o WHERE não filtra (defesa 3). `sandbox-db.service.ts`: Pool `pg` (dep já
existe) com `SANDBOX_DB_URL`, `statement_timeout` também na connection.
Rota: `POST /ia/sandbox/query` body `{sql}` — **super_admin apenas** (mesmo padrão de
verificação do Sidebar: role da tabela `users`); resposta `{columns, rows, ms}` ou
`{error, hint}`. Toda execução logada (`sandbox_queries` — tabela simples na mesma
migration, com sql, user, ms, rows).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/SandboxPage.tsx` (+ teste) |
| MODIFICAR | hub (key `sandbox`, "Sandbox SQL", "Console analítico somente leitura, com histórico auditado.", ícone `Terminal`, `/intelligence/sandbox` — card só aparece se flag E super_admin) · App.tsx · pt-br.ts |

Editor: textarea `font-mono` (sem lib de editor no MVP), hint fixo: **"Somente SELECT
sobre vw_agent_customers, vw_agent_invoices, vw_agent_tickets. Limite 500 linhas, 3s."**
Botão primary **"Executar consulta"** (loading trava largura) · resultado em
`DataTablePro` + tempo (mono) · erro do guard em card vermelho com a `hint` (ex.:
**"UPDATE não é permitido — o sandbox é somente leitura."**) · histórico (últimas 20,
clique recarrega no editor). Duplo gate no client: flag + `isSuperAdmin` (mesma checagem
do Sidebar, `Sidebar.tsx:92-106`).

### Testes
sql-guard (a suíte MAIS importante da sessão): `UPDATE`/`DELETE`/`DROP`/`INSERT` →
recusa; `WITH x AS (DELETE ...) SELECT` → recusa; `SELECT pg_sleep(10)` → recusa;
`SELECT * FROM customers` (tabela real, fora da allowlist) → recusa; `SELECT * FROM
vw_agent_invoices` → aceita com LIMIT injetado; multi-statement `SELECT 1; DROP ...` →
recusa. Service: timeout dispara em query lenta (staging). Rota: papel comum → 403.

### Critérios de aceite
- [ ] Defesa DUPLA provada em staging: guard desligado à força (teste interno) e
      `UPDATE` ainda falha pela role (`ERROR: cannot execute UPDATE in a read-only
      transaction`) — colar as duas saídas no log.
- [ ] View sem PII: `SELECT * FROM vw_agent_customers` não tem nome/CPF (print).
- [ ] RN8 no console (query real, resultado real, print).
**Rollback:** flags off. **Commit:** `feat(ia44): sandbox SQL read-only com defesa dupla (flag off)`.

---

# ⬜ IA-45 — Synthetic data generator

**Objetivo:** dataset sintético de conversas/tickets p/ load test e eval — gerado via
Batch API (50% desconto, `batch.service.ts` já implementa o fluxo JSONL→upload→poll),
gravado SÓ em tenant sandbox.
**Flags:** `SYNTH_DATA_ENABLED` / client `synthdata` (card do hub só p/ super_admin).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_tenant_sandbox_flag.sql` → `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE;` |
| CRIAR | `apps/api/src/domain/ia/synthetic-generator.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/synthetic.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` |

Regras:
1. **Guarda dupla:** service E rota verificam `tenants.is_sandbox === true` — senão
   `403 {error: 'Geração sintética só é permitida em tenants de teste.'}`. NUNCA flag
   client como única barreira.
2. Params: `{conversations: 1..2000, intentMix: Record<intent, pct> (soma 100),
   mediaPct: 0..30}`. Prompt de geração: personas de cliente de ISP BR (nomes FICTÍCIOS
   — instruir o modelo a nunca gerar CPF válido), 2-6 turnos por conversa, saída JSON
   por linha (schema zod validado na volta; linha inválida = descartada e contada).
3. Fluxo: montar JSONL → `batch.service.ts` (reusar upload/poll — RELER o arquivo além
   da linha 60 auditada para usar as funções reais) → parse → inserts em lote
   (`conversations`, `messages`, `tickets` com `created_by:'synthetic'`).
4. Rotas: `POST /ia/synthetic/generate` → `202 {job_id}` · `GET /ia/synthetic/jobs/:id`
   → `{status: 'queued'|'generating'|'inserting'|'done'|'failed', generated, discarded}`.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/SyntheticPage.tsx` (+ teste) |
| MODIFICAR | hub (key `synthdata`, "Dados Sintéticos", "Gere conversas de teste para load e avaliação.", ícone `FlaskConical`, `/intelligence/synthetic`) · App.tsx · pt-br.ts |

Aviso permanente no topo (card amber): **"Disponível apenas em tenants de teste. Os dados
gerados são fictícios e marcados como sintéticos."** Form: slider Conversas (25 passos) ·
sliders do mix por intent (soma trava em 100, mostrar restante) · slider % mídia · botão
primary **"Gerar dataset"** → vira barra de progresso com fase (**"Gerando com a Batch
API — isso pode levar até 24h; pode fechar a página."**) via polling 30s. Done → toast
**"1.240 conversas sintéticas criadas."** + StatCards (geradas, descartadas). Tenant real:
página mostra só o card de bloqueio **"Este provedor não é um ambiente de teste."** (sem
form — não provocar o 403).

### Testes
Guarda: tenant real → 403 no service E na rota (2 testes). Parser: linha JSON inválida
descartada sem abortar o lote. Mix: soma ≠100 → 400 com mensagem clara.

### Critérios de aceite
- [ ] Tenant sandbox staging: 50 conversas geradas end-to-end (Batch API real), contagens
      no log; `created_by='synthetic'` em 100% (SELECT no log).
- [ ] Tenant real: 403 provado por curl (colar no log).
- [ ] RN8 (form→progresso→toast; prints).
**Rollback:** flags off. **Commit:** `feat(ia45): gerador de dados sintéticos via batch (flag off)`.

---

# ⬜ IA-46 — Replay engine de conversas

**Objetivo:** reexecutar conversas REAIS contra o motor atual (com as flags/modelo/prompt
do ambiente) e comparar com o que foi respondido na época — o gate técnico do cutover
S74/S82. Estende `shadow-mode.ts` (o `computeEquivalenceRate` com judge injetável JÁ
existe — `shadow-mode.ts:73-83` — reusar, não recriar).
**Flags:** `REPLAY_ENGINE_ENABLED` / client `replay`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_replay.sql` |
| CRIAR | `apps/api/src/domain/atendimento/replay.service.ts` (+ `.test.ts`) |
| CRIAR | `packages/queue/src/workers/replay.worker.ts` (fila `replay`, sem cron — sob demanda) |
| CRIAR | `apps/api/src/domain/ia/replay.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` |

Migration: `replay_runs(id uuid pk, tenant_id, params jsonb NOT NULL, status text NOT
NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')), total int,
equivalent int, pass_rate numeric, created_at, finished_at)` + `replay_items(id uuid pk,
run_id uuid REFERENCES replay_runs(id) ON DELETE CASCADE, tenant_id, conversation_id,
user_message text, original_response text, candidate_response text, verdict text CHECK
(verdict IN ('equivalente','divergente','erro')), judge_rationale text)` + RLS 023.

Regras:
1. Amostragem: `params = {from, to, sample: 10..500}` — pares (msg user → resposta
   assistant seguinte) da tabela `messages`, aleatório uniforme, EXCLUINDO
   `created_by='synthetic'`.
2. Worker: para cada par, `langGraphService.processMessage` com o contexto do par
   (tenant/customer/conversation reais) — **CUIDADO D5: replay NÃO pode ter efeito
   colateral.** Tools de escrita (suspend_signal, create_ticket, schedule_technical_visit)
   executam em modo dry-run: o worker injeta um `ToolsExecutor` decorado que intercepta
   as tools de escrita e retorna `{success:true, dryRun:true}` sem tocar o banco (a lista
   de tools de escrita vem do catálogo IA-19 — marcar `sideEffect: true` nas defs).
   Envio WhatsApp: o replay chama o grafo, nunca o `message.worker` — não passa pelo
   `sendWhatsAppResponse` (confirmar por leitura que o envio está no worker, não no
   grafo — auditado: está no worker, `message.worker.ts:83-88`. OK).
3. Judge: `computeEquivalenceRate` com judge `gpt-4o-mini` (generateObject
   `{equivalent: boolean, rationale: max 200}`, UseCase `replay-judge`). Rationale
   gravada por item.
4. Rotas: `POST /ia/replay` → `202 {run_id}` · `GET /ia/replay/runs` ·
   `GET /ia/replay/runs/:id` (com itens paginados, filtro `verdict=divergente`).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ReplayPage.tsx` (+ teste) |
| MODIFICAR | hub (key `replay`, "Replay de Conversas", "Rode conversas reais contra o motor atual antes de qualquer cutover.", ícone `RefreshCw`, `/intelligence/replay`) · App.tsx · pt-br.ts |

Wizard 2 passos (não 3 — o "alvo" é o ambiente atual, sem escolha no MVP):
**1. Amostra** (date range + slider 10..500 + resumo "≈ N conversas do período") →
**2. Confirmar** (card: "O replay reexecuta as conversas SEM enviar mensagens e SEM
executar ações reais (modo seco)." + botão primary **"Iniciar replay"**). Corridas:
`DataTablePro` (data, amostra, status com badge, pass-rate mono — faixa signal ≥95%,
amber ≥85%, orange abaixo). Detalhe da corrida: StatCard herói do pass-rate + lista de
DIVERGENTES: lado a lado original × candidato (2 colunas, mobile empilha) + rationale do
judge em itálico. Botão Secondary **"Exportar relatório"** → download JSON da corrida.
Vazio: **"Nenhum replay executado."** / botão primary **"Iniciar o primeiro replay"**.
Toast ao enfileirar: **"Replay iniciado — acompanhe o status aqui."**

### Contrato de API
`POST /api/v2/ia/replay` body `{"from":"2026-06-01","to":"2026-06-30","sample":100}` →
`202 {"run_id":"..."}`. `GET /ia/replay/runs/:id` → `{"status":"done","total":100,
"equivalent":93,"pass_rate":0.93,"items":[...]}`.

### Testes
Amostragem: exclui sintéticos; uniforme (estatístico frouxo). Dry-run: replay com
conversa cuja resposta original criou ticket → NENHUM insert em tickets (spy) e item
registra `dryRun`. Judge: rationale gravada. Pass-rate = equivalent/total.

### Critérios de aceite
- [ ] Replay de 50 conversas reais de staging: relatório com pass-rate + divergentes
      legíveis lado a lado (prints).
- [ ] ZERO efeito colateral provado: contagens de tickets/OS/mensagens antes = depois
      (colar no log).
- [ ] Referência cruzada: adicionar ao checklist do cutover S74/S82 no
      `PLANO_MESTRE_V2.md` a linha "replay ≥95% (IA-46) anexado" (editar lá, 1 linha).
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia46): replay engine com dry-run e judge (flag off)`.

---
---

# FASE 2 — GALHOS (INEXECUTÁVEIS até o gate RN16)

> A sessão **IA-F2-PLAN** (roda depois da Fase 1) expande cada galho abaixo para o
> template §4 auditando o código REAL mergeado: `git log --oneline`, PROGRESS_LOG,
> arquivos das sessões IA-01..IA-46-Fase1 e logs de staging. Proibido expandir antes.

- **IA-12 Voice biometrics** — dep IA-08. Embedding de voz + consentimento LGPD;
  badge "verificado por voz" na tela de chamada.
- **IA-13 Speech analytics QA** — dep IA-08. Scorecard de 100% das chamadas
  (`gpt-4o-mini` + rubrica); tela `/intelligence/voice-qa` com player + Timeline + radar.
- **IA-15 OCR multi-layout + fila de revisão** — dep IA-04. Conta de energia/fatura
  concorrente; `/intelligence/review-queue` mobile-first; correções alimentam IA-29.
- **IA-17 MCP server** — dep IA-19 (usa o catálogo). Tools read-only por API key/tenant;
  UI de keys + toggles + snippet copiável.
- **IA-18 A2A protocol** — GATED (pós-cutover, com IA-10).
- **IA-20 Multi-agent debate** — GATED (dep IA-10); votos gravados no `ai_decision_log`
  (IA-06); Timeline de decisões financeiras.
- **IA-22 Web browsing agent** — dep IA-19/IA-44 (allowlist + isolamento); cheerio;
  citação de fonte obrigatória.
- **IA-23 LTV** — dep IA-07 + IA-27; fase heurística (tenure×ARPU×churn) → Python (ADR).
- **IA-24 Anomalia de rede** — dep IA-09 (≥30d de `network_metrics`); z-score/EWMA TS →
  **escreve a ADR-ml-python-service.md** p/ Isolation Forest; `/intelligence/network-health`.
- **IA-25 Forecast de demanda** — dep ADR; fase média móvel sazonal TS sobre DuckDB;
  `/intelligence/staffing`.
- **IA-28 Perfil de comunicação** — dep IA-05; SÓ eixo formal↔coloquial↔técnico (decisão
  de produto anti-creepy); card no cliente + opt-out.
- **IA-29 Active learning** — dep IA-15/IA-21/IA-03; unifica sinais humanos em
  `labeled_examples`; fila `/intelligence/feedback` com teclas 1/2/3.
- **IA-31 LLM-as-judge + Elo** — dep IA-03/IA-46; ranking em `/intelligence/models`.
- **IA-32 OpenLLMetry** — sem dependência dura; prioridade baixa; spans por nó do grafo;
  status do exporter na AIObservabilityPage.
- **IA-35 Orçamento de latência** — dep IA-32 (medição primeiro). Nota de realismo já
  registrada: "speculative decoding" real não existe sobre API da OpenAI; a sessão é
  p95 por nó + otimizações guiadas.
- **IA-36 Edge inference** — triagem CF Workers AI; gate de concordância ≥85% vs
  `classifyIntent` antes de ligar.
- **IA-38 SHAP + tela de churn** — dep IA-07 (+IA-23 p/ SHAP real); `/intelligence/churn`
  com waterfall que SOMA o score exibido; quita a dívida de tela da IA-07.
- **IA-39 Constitutional loop** — dep IA-21; constituição editável por tenant; revisão
  só em intents sensíveis.
- **IA-40 PII em voz** — dep IA-08/IA-13; mascara ANTES de persistir; trechos marcados
  no player.
- **IA-41 Federated evaluation** — GATED (≥3 tenants grandes + análise LGPD registrada).
- **IA-42 Spec tracker** — dep IA-03; job de CI, sem UI (exceção RN12 justificada).

---

## APÊNDICE C — ARMADILHAS DE FRONTEND
Detalhe no `AUDITORIA_FRONTEND.md` §5. Bolso: C1 App.tsx monólito (rotas ~l.2958; não
refatorar) · C2 `@/` = raiz (`@/src/...`) · C3 dark muda `--radius` (nunca raio fixo) ·
C4 `--primary` dark é vermelho (risco = `--astrum-*`) · C5 e2e Playwright aponta p/
apps/web condenado · C6 sem proxy vite (base URL do Fastify = padrão `auth-v2.ts`) ·
C7 tab nova exige `canAccess` · C8 Sidebar colapsada (testar os 2 modos).

## APÊNDICE D — ACHADOS DA AUDITORIA DE 2026-07-05 (li o código por você)

- **D1 — Bug real:** `tools.executor.ts:24-26` tem `case 'check_invoice'` DUPLICADO
  (já casado na linha 18) — código morto que mascara a intenção do alias
  `get_billing_status`. Corrigir na IA-19 com teste.
- **D2 — Gap real:** `agentTools` (`vercel-ai.service.ts:79-112`) define 4 tools, mas o
  executor implementa 8 — `check_coverage`, `run_diagnostics`,
  `schedule_technical_visit` (e o alias `get_billing_status`) são INALCANÇÁVEIS pelo
  modelo hoje. A IA-19 corrige.
- **D3 — Reuso obrigatório:** `computeEquivalenceRate` (`shadow-mode.ts:73-83`) já
  aceita judge injetável — IA-46 usa; recriar é violar R5/estilo da casa.
- **D4 — Bug real:** `state.tokensUsed` NUNCA é populado (fica 0 em todo retorno do
  grafo — `agent.state.ts:61` + nenhum nó escreve). IA-34 corrige capturando `usage` do
  `streamText`.
- **D5 — Regra de ouro do replay:** o envio WhatsApp fica no `message.worker.ts:83-88`
  (fora do grafo) — replay chama o grafo direto e NUNCA envia; tools de escrita em
  dry-run via decorator (IA-46).
- **D6 — Padrão de porta:** `cobrai-rules.service.ts` usa ports injetáveis
  (`ICobrancaDbPort`) — os serviços novos de cobrança (IA-26) seguem esse padrão, não o
  de import direto do supabase.
- **D7 — RLS canônica:** `023_shadow_results.sql` (policy `tenant_isolation` +
  `app.current_tenant_id`) é o modelo para TODA migration nova deste plano.
- **D8 — Preços duplicados:** `MODEL_COSTS` vive no client (`AICostsPage.tsx:23-30`) —
  IA-34 move a fonte para o server (`MODEL_PRICING`) e o client passa a ler `cost_usd`.
