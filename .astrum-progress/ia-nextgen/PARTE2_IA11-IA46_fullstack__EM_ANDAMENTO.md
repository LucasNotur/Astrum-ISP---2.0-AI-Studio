# PARTE 2 — IA-11 a IA-46 — Fase 1 (o chão) + Fase 2 (os andares)

> **Para a IA executora (Sonnet):** este arquivo completa o `PARTE1_IA01-IA10_backend__EM_ANDAMENTO.md`
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

## §0 — PROTOCOLO (herda §0 do PLANO_MESTRE_V2__EM_ANDAMENTO.md e §0/RN1–RN7 do PARTE1_IA01-IA10_backend__EM_ANDAMENTO.md)

### 0.1 Ritual de início de TODA sessão
1. Ler `PLANO_MESTRE_V2__EM_ANDAMENTO.md` §0 (R1–R6, DoD) e `PARTE1_IA01-IA10_backend__EM_ANDAMENTO.md` §0/§1/Apêndice B.
2. Ler `.astrum-progress/ia-nextgen/AUDITORIA_FRONTEND.md` INTEIRO.
3. Últimas 3 entradas do `PROGRESS_LOG.md`; `git status` + `git log --oneline -5`.
4. Branch `feat/ia-XX-<slug>` a partir de `main`.
5. Fase 1 está 100% em main (2026-07-06). O gate RN16 foi CUMPRIDO pela sessão
   IA-F2-PLAN (2026-07-07): a Fase 2 está expandida em densidade total neste arquivo.
   Próxima sessão = primeira ⬜ da ordem da FASE 2 (§3). Ler também o Apêndice E
   (dívidas herdadas da consolidação) antes de qualquer sessão.

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

### FASE 2 — ordem de execução (gate RN16 CUMPRIDO em 2026-07-07; sessões expandidas no fim do arquivo)
```
BLOCO A — medição e quitação de dívidas (sem dependência externa)
IA-32 OpenLLMetry (spans por nó)          ← medição primeiro; IA-35 depende
IA-42 Spec tracker (eval como gate de CI)
IA-38 SHAP + tela de churn                ← quita E1 (SandboxPage) e a dívida de tela da IA-07
IA-23 LTV                                 ← quita E3 (churn-features → feature store)
BLOCO B — agentic e aprendizado
IA-31 LLM-as-judge + Elo
IA-29 Active learning
IA-15 OCR multi-layout + fila de revisão
IA-17 MCP server                          ← quita E4 (SIDE_EFFECT_TOOLS → registry)
IA-22 Web browsing agent
IA-39 Constitutional loop
IA-28 Perfil de comunicação
IA-36 Edge inference (shadow)
IA-35 Orçamento de latência               ← depois da IA-32
BLOCO C — rede e previsão (gate de DADOS: ≥30/60d de histórico)
IA-24 Anomalia de rede                    ← escreve a ADR-ml-python-service (RN15)
IA-25 Forecast de demanda                 ← depois da ADR
BLOCO D — voz (gate: estado da IA-08; A3 pendente)
IA-13 Speech analytics QA                 ← primeira: cria a persistência de chamadas
IA-40 PII em voz
IA-12 Voice biometrics                    ← exige A3 + ADR implementada
BLOCO E — GATED (não agendar; critérios de abertura em cada sessão)
IA-18 A2A · IA-20 Debate · IA-41 Federated eval
```

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

# ✅ IA-37 — Batching de tool calls

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

# ✅ IA-21 — Constitutional classifier (nó de veto dedicado)

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

# ✅ IA-16 — GraphRAG leve (raciocínio relacional sobre a rede física)

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

# ✅ IA-14 — Atendimento multilíngue

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

# ✅ IA-30 — Compressão de contexto RAG

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

# ✅ IA-27 — Feature Store leve

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

# ✅ IA-26 — Multi-armed bandit nas mensagens de cobrança (CobrAI v2)

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

# ✅ IA-33 — Drift detection

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

# ✅ IA-34 — Cost attribution por cliente e feature

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

# ✅ IA-43 — Failover multi-provider (port do `src/ai-provider/`)

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

# ✅ IA-44 — Sandbox SQL do agente (somente leitura, defesa dupla)

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

# ✅ IA-45 — Synthetic data generator

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

# ✅ IA-46 — Replay engine de conversas

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
      `PLANO_MESTRE_V2__EM_ANDAMENTO.md` a linha "replay ≥95% (IA-46) anexado" (editar lá, 1 linha).
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia46): replay engine com dry-run e judge (flag off)`.

---
---

# FASE 2 — SESSÕES EM DENSIDADE TOTAL
# (expandidas pela sessão IA-F2-PLAN em 2026-07-07 — gate RN16 CUMPRIDO)

> **Base da auditoria desta expansão:** `git log` até `64303fa` (Fase 1 100% em main),
> PROGRESS_LOG de 2026-07-06 (consolidação) e 2026-07-05 (sessões individuais), e
> leitura dos arquivos reais citados linha a linha em cada sessão.
> **Migrations:** próximo número livre HOJE = `048` (037–047 usados pela Fase 1;
> atenção à colisão histórica `035_ai_decision_log` + `035_network_metrics` — E5).
> RN5 continua: confirmar o número com `ls packages/db/src/migrations/` NO DIA.
> Padrão RLS = policy `tenant_isolation` com `app.current_tenant_id` (D7).
> **Leitura obrigatória antes de qualquer sessão:** Apêndice E (dívidas herdadas).
> Flags client novas: cada sessão adiciona a sua em `public-flags.ts` (hoje: 14 chaves;
> `costdrill` demonstra o padrão client-only `undefined` = sempre on — E9).

---

# ⬜ IA-32 — OpenLLMetry (spans OTel por nó do grafo)

**Objetivo:** telemetria OpenTelemetry padrão: 1 trace por `processMessage`, 1 span por
nó do grafo e 1 span por chamada LLM, exportados via OTLP para qualquer backend
(Tempo/Jaeger/Traceloop). Complementa o Helicone (custo, RN7) — não o substitui.
É a FONTE de medição do orçamento de latência (IA-35).
**Flags:** `OTEL_ENABLED` (server) / client `otel` (só o card de status).

**Auditoria (2026-07-07):** grafo com 12 nós em `langgraph.service.ts:83-96`
(`classify, guardrails, decide_source, fetch_context, generate, validate, escalate,
block, grade_context, rewrite_query, self_check, safety_veto`); `processMessage` na
:163. Chamadas LLM centralizadas em `vercel-ai.service.ts` (`classifyIntent:176`,
`streamWithTools`, tudo via `withFailover` do model-router IA-43). Observabilidade
existente: `sentry.service.ts`, `langsmith.service.ts`, Helicone headers.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/observability/otel.ts` (+ `.test.ts`) — boot do NodeSDK |
| CRIAR | `apps/api/src/infrastructure/observability/otel-span.helper.ts` (+ `.test.ts`) — `withSpan(name, attrs, fn)` |
| CRIAR | `apps/api/src/domain/ia/otel.routes.ts` — `GET /ia/otel/status` |
| MODIFICAR | `langgraph.service.ts` (envolver os 12 `addNode` com `wrapNode(name, node)`) |
| MODIFICAR | `vercel-ai.service.ts` (span `llm.generate` com attrs model/useCase/tokens) |
| MODIFICAR | `server.ts` (boot ANTES de tudo) · `env.validator.ts` (`OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT?`) · `public-flags.ts` (`otel`) |

Deps npm (pinar): `@opentelemetry/api`, `@opentelemetry/sdk-node`,
`@opentelemetry/exporter-trace-otlp-http`.
Regras: 1. **Decisão registrada:** instrumentação MANUAL nos pontos de interesse (12
nós + LLM) em vez do auto-instrument do Traceloop — LangGraph JS não tem instrumentação
oficial estável; menos mágica, mais controle. 2. Flag off → tracer no-op do
`@opentelemetry/api` e o SDK pesado NEM é importado (import dinâmico no boot). 3.
Atributos mínimos por span: `tenantId`, nome do nó, e no `llm.generate`:
`model`, `useCase`, `tokens` (quando disponível — D4 já corrigido pela IA-34). 4.
Erro no exporter NUNCA derruba mensagem (fail-open RN4, warn 1x/min).

### Frontend
MODIFICAR `src/pages/AIObservabilityPage.tsx` (RELER INTEIRA — RN9; já tem a seção
Providers da IA-43): card **"Telemetria"** — status via `GET /api/v2/ia/otel/status`
(`{enabled, endpoint_mascarado, spans_sessao, ultimo_erro}`) com RiskBadge
(exportando=baixo / erro=alto / desligado=sem-dado). SEM tela própria (RN12 via
AIObservabilityPage; justificar no log).

### Testes
`InMemorySpanExporter`: 1 mensagem pelo grafo (mocks) → trace contém spans dos nós
percorridos, na hierarquia certa; flag off → zero spans E zero import do SDK (spy);
span de nó que lança → status ERROR; atributo tenantId presente em todos.

### Critérios de aceite
- [ ] Flag off: boot sem OTel carregado (log de boot) e suíte inteira verde.
- [ ] Staging flag on: trace completo com os 12 nós visível no backend OTLP (print).
- [ ] Overhead: p95 de `processMessage` com/sem flag difere <5ms (20 msgs, log).
- [ ] RN8 via card na AIObservabilityPage (print).
**Rollback:** `OTEL_ENABLED=false`. **Commit:** `feat(ia32): spans opentelemetry por nó do grafo + status do exporter (flag off)`.

---

# ⬜ IA-42 — Spec tracker (eval da IA-03 como gate de CI)

**Objetivo:** comportamento vira spec executável: o eval de 50 cenários roda em CI com
baseline versionado; regressão de pass-rate quebra o job. SEM UI (exceção RN12 — job de
CI; registrar no log). **Flags:** nenhuma (não roda em runtime de produção).

**Auditoria:** harness REAL em `apps/api/eval/run-eval.ts` (lê
`eval/scenarios/atendimento.jsonl` — 50 linhas conferidas) + `eval/judge.ts`
(`judge(p: JudgeInput, tenantId)` com `JudgeSchema` Zod) + resultados em
`eval/results/*.json` (existe 1 de 2026-07-05). CI em `.github/workflows/ci.yml`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/eval/baseline.json` — snapshot aprovado (por cenário: `{id, pass}`; geral: `rate`) |
| CRIAR | `apps/api/eval/spec-tracker.ts` (+ `.test.ts`) — PURO |
| MODIFICAR | `apps/api/eval/run-eval.ts` (modo `--ci`: roda + compara + exit code + summary markdown) |
| MODIFICAR | `.github/workflows/ci.yml` (job `eval-spec`: schedule nightly + workflow_dispatch) |

```ts
// spec-tracker.ts
export interface SpecComparison { regressions: string[]; newPasses: string[]; rateDelta: number; }
export function compareToBaseline(current: EvalResult, baseline: Baseline): SpecComparison;
// falha (exit 1) se: rate cai >2pp OU um cenário que passava agora falha.
```
Regras: 1. NUNCA por PR — só nightly/manual (custo LLM); gate: o job só roda se o
secret `OPENAI_API_KEY` existir. UseCase Helicone `eval-spec` (RN7). 2. Atualizar
baseline é COMMIT deliberado, nunca automático. 3. Cenário flaky (veredito instável em
3 noites) → campo novo `quarantined: true` no jsonl: fora do gate, listado no summary.

### Testes
spec-tracker puro: regressão de 1 cenário detectada e nomeada; melhora não falha;
rateDelta nos limites (exatamente −2pp não falha; −2.1pp falha); quarentena ignorada.

### Critérios de aceite
- [ ] `npx tsx eval/run-eval.ts --ci` local verde contra o baseline gerado na sessão
      (colar summary no PROGRESS_LOG).
- [ ] Regressão sintética (inverter o expected de 1 cenário) → exit 1 nomeando o cenário.
- [ ] Job nightly verde no GitHub Actions (print).
**Rollback:** remover o job do ci.yml. **Commit:** `feat(ia42): spec tracker — eval de 50 cenários como gate nightly de CI`.

---

# ⬜ IA-38 — Explicabilidade do churn + tela `/intelligence/churn`

**Objetivo:** quitar a dívida de tela da IA-07: clientes por risco + waterfall de
contribuições por feature que SOMA o score exibido. **"SHAP honesto" registrado:** o
modelo real é LINEAR (`computeChurnScore`, `churn-score.ts:61`; pesos em
`CHURN_WEIGHTS:33`) — contribuição exata = peso × valor normalizado, SEM lib. SHAP de
verdade só quando houver modelo não-linear Python (ADR da IA-24).
**Flags:** client `churn`; server: reusar a flag existente do worker de churn (auditar
o nome real em `packages/queue/src/workers/churn.worker.ts` NO DIA — RN9).

**Auditoria:** `churn_scores` (036) gravada pelo `churn.worker.ts` (cron `0 3 * * *`
por tenant, jobId `churn-repeat:{tenantId}`); features em
`churn-features.service.ts:159` (SQL próprio — dívida E3, fica para a IA-23); rota
`GET /api/v2/ia/churn` JÁ existe (`churn.routes.ts:21` — reler o shape); bandas em
`RISK_BANDS` (`churn-score.ts:42`: low/medium/high/critical → RiskBadge
baixo/médio/alto/crítico).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_churn_contributions.sql` → `ALTER TABLE churn_scores ADD COLUMN IF NOT EXISTS contributions JSONB;` |
| MODIFICAR | `apps/api/src/domain/ml/churn-score.ts` (retornar `contributions: {feature, weight, value, contribution}[]` — campo NOVO no resultado, retrocompatível; invariante: soma == score) |
| MODIFICAR | `packages/queue/src/workers/churn.worker.ts` (gravar `contributions`) |
| MODIFICAR | `apps/api/src/domain/ia/churn.routes.ts` (incluir contributions + ordenação por score desc + paginação) |
| MODIFICAR | `public-flags.ts` (`churn`) |

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ChurnPage.tsx` (+ teste) |
| CRIAR | `src/pages/intelligence/SandboxPage.tsx` (+ teste) — **QUITAÇÃO DA DÍVIDA E1**: a spec completa (editor mono, hint fixo, histórico de 20, duplo gate flag+super_admin) está na sessão IA-44 da Fase 1; o backend JÁ existe (`sandbox.routes.ts:81` POST + `:153` histórico + guard super_admin `:65`) |
| MODIFICAR | `src/App.tsx` (rotas `/intelligence/churn` E `/intelligence/sandbox`) · hub (key `churn`, "Risco de Churn", "Quem está prestes a cancelar — e por quê.", ícone `UserMinus`, `/intelligence/churn`) · `pt-br.ts` |

Tela de churn: topo StatCards (clientes em crítico/alto; "MRR em risco" — mono,
centavos→R$, B4); `DataTablePro` Cliente · Score (mono 0-100) · Banda (RiskBadge) ·
MRR (mono) · Atualizado (relativo). Clique → `Sheet` com waterfall (BarChart Recharts
horizontal: contribuição por feature — positivas em orange/red, negativas em signal;
última barra "Score" = soma, invariante VISÍVEL). Vazio: **"Nenhum score de churn
ainda."** / **"O cálculo roda toda noite às 03h."** Erro: padrão IA-21.

### Testes
Invariante `soma(contributions) == score` com 20 fixtures variadas; rota expõe
contributions; waterfall: soma exibida bate com o score do fixture; SandboxPage:
gate super_admin (usuário comum não vê), POST renderiza resultado, erro do guard
renderiza a `hint`.

### Critérios de aceite
- [ ] Waterfall de 3 clientes reais de staging SOMA o score (prints).
- [ ] **E1 quitada:** `/intelligence/sandbox` navegável ponta a ponta (query real,
      print) — o card do hub deixa de apontar para rota morta.
- [ ] Flag client off → nem churn nem sandbox no DOM.
- [ ] RN8 completo nas DUAS telas.
**Rollback:** flag client off. **Commit:** `feat(ia38): tela de churn com waterfall explicável + quitação SandboxPage (E1)`.

---

# ⬜ IA-23 — LTV (lifetime value por cliente)

**Objetivo:** LTV heurístico auditável: `ltv_cents = mrr_cents × margem ×
expectativa_de_vida_meses`, com expectativa = `1 / churn_mensal` (score → probabilidade
mensal por banda). Vira feature no Feature Store (fonte única) e coluna na ChurnPage.
Modelo de sobrevivência Python só via ADR (IA-24).
**Flags:** `LTV_ENABLED` / client `ltv`.
**Depende de:** IA-07 ✓, IA-27 ✓, IA-38 (a tela onde a coluna entra).

**Auditoria:** `FEATURE_DEFS` (`feature-registry.ts:14`) tem 4 features
(tenure_days, overdue_count_90d, tickets_90d, mrr_cents) com
`assertFeatureDefsUnique:63`; `computeAllForTenant` (`feature-store.service.ts:174`)
faz 1 query agregada por feature; worker cron 02h. **Dívida E3 quitada AQUI:**
`churn-features.service.ts:159` (`extractFeatures`) tem SQL próprio para
tenure/overdue/tickets/mrr — trocar por `getFeatures`
(`feature-store.service.ts:214`) com FALLBACK ao SQL atual quando o store está
vazio/stale (fail-open; logar qual fonte serviu).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/ml/ltv.ts` (+ `.test.ts`) — PURO |
| MODIFICAR | `feature-registry.ts` (+ `ltv_cents` ttl 24h, `expected_lifetime_months`) |
| MODIFICAR | `feature-store.service.ts` (`computeAllForTenant` computa as 2 novas lendo o `churn_scores` mais recente por cliente — JOIN, não N+1) |
| MODIFICAR | `churn-features.service.ts` (E3, acima) · `churn.routes.ts` (+ `ltv_cents`) · `public-flags.ts` (`ltv`) |

```ts
// ltv.ts — constantes EXPORTADAS (calibrar com dados reais depois; decisão registrada)
export const MONTHLY_CHURN_BY_BAND = { low: 0.005, medium: 0.02, high: 0.05, critical: 0.10 };
export const LTV_MARGIN = 0.35;          // margem default de ISP; teto 60 meses
export function computeLtv(i: { mrrCents: number; band: RiskBand }): { ltvCents: number; months: number };
```

### Frontend
MODIFICAR `ChurnPage` (coluna **"LTV"** mono R$ + StatCard **"LTV total em risco"** =
soma dos LTV de crítico+alto) · `pt-br.ts`. Tooltip: **"Estimativa: mensalidade ×
margem × expectativa de vida pela probabilidade de churn. Teto de 60 meses."**
SEM tela própria (RN12 via ChurnPage; log).

### Testes
ltv puro: 4 bandas, teto 60 meses, mrr 0 → 0; E3: store populado → usa store (spy);
store vazio → fallback SQL + warn, e o RESULTADO das features é igual nas duas fontes
(fixture); worker grava as 2 features novas.

### Critérios de aceite
- [ ] 5 clientes de staging: `ltv_cents` = conta manual (colar no log).
- [ ] E3: log prova o store como fonte no caminho feliz; suíte de churn intacta.
- [ ] StatCard com dado real (print).
**Rollback:** flags off (features novas param de computar; colunas ficam).
**Commit:** `feat(ia23): ltv heurístico no feature store + coluna na tela de churn (flag off)`.

---

# ⬜ IA-31 — LLM-as-judge permanente + ranking Elo

**Objetivo:** toda comparação A×B que o produto JÁ produz (replay original×candidato;
eval esperado×obtido) alimenta um ranking Elo persistente de "contenders"
(modelo + versão de prompt), respondendo "a configuração de hoje é melhor que a da
semana passada?" com um número. Tela `/intelligence/models`.
**Flags:** `MODEL_ELO_ENABLED` / client `elo`.
**Depende de:** IA-03 ✓ (`eval/judge.ts`), IA-46 ✓ (`judgeOnePair`,
`replay.service.ts:239`).

**Auditoria:** contender identificável hoje = `model` + versão de prompt (hash
sha256-12 do prompt-registry, `promptHash:78`); `replay_items` (047) guarda verdict
por item; o eval grava JSON em `eval/results/`. **Decisão de granularidade
registrada:** o replay compara "motor da época" × "motor atual" — a partida é entre
CONFIGURAÇÕES inteiras (snapshot dos params da run), não modelos isolados; é o que dá
para afirmar honestamente.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_elo.sql` |
| CRIAR | `apps/api/src/domain/ml/elo.ts` (+ `.test.ts`) — PURO |
| CRIAR | `apps/api/src/domain/ml/elo-recorder.service.ts` (+ teste) |
| CRIAR | `apps/api/src/domain/ia/models.routes.ts` (+ teste) |
| MODIFICAR | `replay.service.ts` (`executeReplayRun:276` — ao fechar a run com flag on, gravar partidas) |
| MODIFICAR | `public-flags.ts` (`elo`) |

Migration: `elo_contenders(id uuid pk, tenant_id, key text, rating numeric NOT NULL
DEFAULT 1000, games int NOT NULL DEFAULT 0, UNIQUE(tenant_id, key))` +
`elo_matches(id uuid pk, tenant_id, winner_key text, loser_key text, draw boolean,
source text CHECK (source IN ('replay','eval','manual')), ref_id uuid, created_at)`
+ RLS 023 + índice `elo_matches(tenant_id, ref_id)` (idempotência).
```ts
// elo.ts
export function expectedScore(ra: number, rb: number): number;      // 1/(1+10^((rb-ra)/400))
export function updateElo(ra: number, rb: number, result: 1 | 0 | 0.5, k = 32): [number, number];
```
Regras: 1. Item `equivalente` do replay = EMPATE (0.5) entre "época" e "atual". 2. Item
`divergente` NÃO vira partida automática — o judge de equivalência não diz quem é
MELHOR; divergência entra numa fila de decisão humana na tela (botões "Original melhor"
/ "Candidato melhor") e só então vira partida (source `manual`). Escopo honesto,
registrado. 3. `recordMatch` idempotente por `(tenant, ref_id)` — reprocessar run não
duplica. 4. Rotas: `GET /ia/models/ranking` · `GET /ia/models/pending` ·
`POST /ia/models/matches/:itemId/resolve` body `{winner: 'original'|'candidate'}`.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ModelsPage.tsx` (+ teste) |
| MODIFICAR | hub (key `elo`, "Ranking de Modelos", "Elo das configurações de modelo e prompt do seu ambiente.", ícone `Trophy`, `/intelligence/models`) · App.tsx · pt-br.ts |

Ranking: `DataTablePro` Contender (mono) · Rating (mono, 700 só no líder) · Partidas ·
Últimos 5 (✓/✗/= como pontos coloridos). Abaixo, fila **"Divergências aguardando
decisão"**: lado a lado original × candidato (padrão da ReplayPage), botões Secondary
**"Original melhor"** / **"Candidato melhor"** → toast **"Partida registrada."** Vazio:
**"Nenhuma partida ainda."** / **"Rode um replay para gerar as primeiras
comparações."** + botão primary **"Ir para o Replay"** → `/intelligence/replay`.

### Testes
elo puro: simetria (ganho de A = perda de B), empate move menos que vitória, K
respeitado; recorder: idempotência por ref_id; replay fecha → N empates gravados
(mock); resolve → ratings movem na direção certa; flag off → `executeReplayRun` byte a
byte (spy no recorder).

### Critérios de aceite
- [ ] Replay de 50 em staging → ranking com 2 contenders e partidas == itens
      equivalentes (query no log).
- [ ] Decidir 3 divergências na tela → rating muda na direção certa (prints).
- [ ] Flag off: replay inalterado (spy).
**Rollback:** flags off. **Commit:** `feat(ia31): ranking elo de configurações via replay + fila de decisão (flag off)`.

---

# ⬜ IA-29 — Active learning (sinais humanos → dataset)

**Objetivo:** unificar TODO feedback humano do produto em `labeled_examples` — a fonte
de few-shot/eval/fine-tune futura: revisões de veto (IA-21), 👍/👎 da rota de feedback,
divergências resolvidas (IA-31), correções de OCR (IA-15, quando existir). Fila de
rotulagem `/intelligence/feedback` com teclas 1/2/3.
**Flags:** `ACTIVE_LEARNING_ENABLED` / client `activelearn`.

**Auditoria:** fontes REAIS hoje — `safety_vetoes.review_status`
('veto_correto'|'falso_positivo'; PATCH em `safety.routes.ts:58`);
`POST /api/v2/ia/feedback` já existe (`feedback.routes.ts:14` — RELER para ver o que
grava e onde, RN9); `replay_items.verdict` (047). OCR entra quando a IA-15 rodar
(source já prevista no CHECK).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_labeled_examples.sql` |
| CRIAR | `apps/api/src/domain/ml/active-learning.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/labeling.routes.ts` (+ teste) |
| MODIFICAR | `safety.routes.ts` (PATCH → fire-and-forget `recordExample`) · `feedback.routes.ts` (idem) · `models.routes.ts` da IA-31 (resolve → idem) |
| MODIFICAR | `public-flags.ts` (`activelearn`) |

Migration: `labeled_examples(id uuid pk, tenant_id, source text CHECK (source IN
('safety_review','feedback','replay_resolution','ocr_correction','manual')), input
text NOT NULL, output text, label text, payload jsonb, created_at, labeled_at
timestamptz, exported_at timestamptz)` + RLS 023 + índice
`(tenant_id, source, created_at DESC)` + UNIQUE `(tenant_id, source, md5(input))`
(dedupe).
Regras: 1. `recordExample` = fire-and-forget SEMPRE (nenhuma rota fica mais lenta por
causa do dataset). 2. Fila de rotulagem = linhas com `label IS NULL` (ex.: respostas
escaladas amostradas; feedback sem categoria). Teclas: **1** aprova, **2** reprova,
**3** pula. 3. `GET /ia/labeling/export?source=&since=` → download JSONL (marca
`exported_at`).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/LabelingPage.tsx` (+ teste) |
| MODIFICAR | hub (key `activelearn`, "Fila de Rotulagem", "Seu feedback vira dado de treino.", ícone `Tags`, `/intelligence/feedback`) · App.tsx · pt-br.ts |

Card único centrado (mobile-first): o exemplo (input + output), badge da origem
(slate), botões grandes **"1 · Correto"** / **"2 · Incorreto"** / **"3 · Pular"** com
atalhos de teclado (keydown; visível no botão; aria-keyshortcuts). Contador **"12
pendentes"** (mono). A cada 10 rotulados: toast **"10 exemplos rotulados —
obrigado!"** Botão Secondary **"Exportar JSONL"**. Vazio: **"Fila limpa."** / **"Novos
exemplos chegam conforme o uso do produto."** (sem botão).

### Testes
Dedupe por (tenant,source,md5); export escapa newline interna; PATCH de veto gera
exemplo (spy, mock supabase); teclas 1/2/3 disparam POST certo; flag off = zero write
novo nas rotas modificadas (spy).

### Critérios de aceite
- [ ] Rotular 10 em staging só com teclado (gravação no log).
- [ ] Export JSONL válido (`jq -c . | wc -l` no log).
- [ ] Revisão de veto na GuardrailsPage → exemplo aparece na fila (e2e).
**Rollback:** flags off. **Commit:** `feat(ia29): active learning — labeled_examples + fila de rotulagem (flag off)`.

---

# ⬜ IA-15 — OCR multi-layout + fila de revisão

**Objetivo:** além do boleto (IA-04), extrair conta de energia e fatura de concorrente
(negociação/portabilidade); TODA extração com confiança <0.85 cai numa fila de revisão
humana mobile-first; correções alimentam a IA-29.
**Flags:** `OCR_MULTILAYOUT_ENABLED` / client `reviewqueue`.
**Depende de:** IA-04 ✓.

**Auditoria:** `vision.service.ts` real — `BoletoSchema:21`, `extractBoleto:45`
(gpt-4o vision + generateObject), `classifyFieldPhoto:85`, `formatBoletoPrompt:127`,
flag `isVisionStructuredEnabled:17`; plugado no WhatsApp via
`media-processor.service.ts` `processInboundMedia:49` com deps INJETÁVEIS
(`extractBoleto?`/`classifyFieldPhoto?` nas linhas 38-48) — estender pelo MESMO seam.
Conferir NO DIA se `BoletoSchema` já tem campo `confidence`; se não, adicionar aos 3
schemas (mudança aditiva).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_ocr_review.sql` |
| MODIFICAR | `apps/api/src/infrastructure/vision/vision.service.ts` (+ `EnergyBillSchema`, `CompetitorInvoiceSchema`, `classifyDocumentType`, `extractByType`) |
| MODIFICAR | `apps/api/src/adapters/whatsapp/media-processor.service.ts` (roteia por tipo; grava `ocr_extractions`) |
| CRIAR | `apps/api/src/domain/ia/ocr-review.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`reviewqueue`) |

Migration: `ocr_extractions(id uuid pk, tenant_id, customer_id, conversation_id,
media_url text, doc_type text CHECK (doc_type IN
('boleto','energia','concorrente','desconhecido')), extraction jsonb NOT NULL,
confidence numeric, review_status text NOT NULL DEFAULT 'auto' CHECK (review_status IN
('auto','pending','approved','corrected')), corrected jsonb, reviewed_by text,
created_at timestamptz DEFAULT now())` + RLS 023 + índice
`(tenant_id, review_status, created_at DESC)`.
Regras: 1. **Decisão de custo registrada:** `classifyDocumentType(imageUrl)` roda
ANTES com `gpt-4o-mini` vision (1 enum barato) e só então o extract caro do tipo
detectado (UseCases `ocr-classify` / `ocr-extract-{tipo}`, RN7). 2. Schemas novos:
energia `{distribuidora, valor_cents, kwh, vencimento, confidence}`; concorrente
`{operadora, plano, valor_cents, confidence}` (B4: centavos). 3. confidence <0.85 →
`pending`; ≥0.85 → `auto`. 4. `PATCH /ia/ocr/:id` `{action:'approve'|'correct',
corrected?}`; correção → fire-and-forget `recordExample` (IA-29, source
`ocr_correction`) SE a IA-29 já rodou (checar flag; senão só grava `corrected`).

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ReviewQueuePage.tsx` (+ teste) — MOBILE-FIRST |
| MODIFICAR | hub (key `reviewqueue`, "Revisão de Documentos", "Confirme extrações de boletos e faturas com baixa confiança.", ícone `FileSearch`, `/intelligence/review-queue`) · App.tsx · pt-br.ts |

Card por item: imagem (zoom no toque), campos extraídos como inputs EDITÁVEIS
pré-preenchidos, `ConfidenceMeter`, botões primary **"Aprovar"** / secondary
**"Corrigir e aprovar"** (habilita ao editar). Navegação item a item (contador "3 de
7"). Vazio: **"Nenhum documento aguardando revisão."** / **"Extrações com confiança
alta são aprovadas automaticamente."** Erro: padrão IA-21.

### Testes
`classifyDocumentType` mock roteia para o schema certo; <0.85 → pending e ≥0.85 →
auto; PATCH correct grava `corrected` + exemplo IA-29 (spy); linha JSON inválida do
modelo → `desconhecido` + pending (nunca aborta o media-processor); página renderiza
inputs do fixture e habilita "Corrigir e aprovar" ao editar.

### Critérios de aceite
- [ ] 3 documentos reais em staging (boleto, energia, concorrente) extraídos com os
      campos certos (prints).
- [ ] Item de baixa confiança na fila, revisado NO CELULAR (print viewport 375px).
- [ ] Flag off: pipeline do boleto EXATAMENTE como a IA-04 deixou (teste snapshot do
      fluxo `processInboundMedia`).
**Rollback:** flags off. **Commit:** `feat(ia15): ocr multi-layout + fila de revisão humana (flag off)`.

---

# ⬜ IA-17 — MCP server (tools read-only por API key)

**Objetivo:** expor as tools READ-ONLY do agente via Model Context Protocol — o dono do
ISP pluga o Claude (ou outro cliente MCP) nos dados dele com API key por tenant.
Escrita NUNCA sai por MCP.
**Flags:** `MCP_SERVER_ENABLED` / client `mcp`.
**Depende de:** IA-19 ✓.

**Auditoria:** catálogo = 9 tools (`agentTools`, `vercel-ai.service.ts:94-166`);
executor `ToolsExecutor` (`tools.executor.ts:11`, cases :38-60). Read-only reais:
`check_invoice`, `get_billing_status`, `query_knowledge_base`, `check_coverage`,
`run_diagnostics`, `query_network_graph`. Escrita: `suspend_signal`, `create_ticket`,
`schedule_technical_visit` — hoje listadas em `SIDE_EFFECT_TOOLS`
(`replay.service.ts:76`). **Dívida E4 quitada AQUI:** mover `SIDE_EFFECT_TOOLS` para
`tool-registry.ts` (fonte única) com reexport em `replay.service.ts` para não quebrar
imports.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_mcp_keys.sql` |
| MODIFICAR | `tool-registry.ts` (export `SIDE_EFFECT_TOOLS` + `READ_ONLY_TOOLS` derivado; teste: união == catálogo) |
| CRIAR | `apps/api/src/infrastructure/mcp/mcp-server.ts` (+ teste) |
| CRIAR | `apps/api/src/domain/ia/mcp-admin.routes.ts` (+ teste) |
| MODIFICAR | `server.ts` (montar transporte) · `public-flags.ts` (`mcp`) |

Migration: `mcp_api_keys(id uuid pk, tenant_id, name text NOT NULL, key_hash text NOT
NULL UNIQUE, enabled boolean NOT NULL DEFAULT true, tools text[] NOT NULL, last_used_at
timestamptz, created_at timestamptz DEFAULT now())` + RLS 023. A chave é exibida UMA
vez na criação; só o sha256 persiste.
Regras: 1. Dep `@modelcontextprotocol/sdk` (instalar, pinar) com transporte
**Streamable HTTP** em `POST /api/v2/mcp` — conferir o adapter Fastify/Node do SDK NO
DIA (a API do transporte muda entre minors). 2. Tools oferecidas = `READ_ONLY_TOOLS ∩
key.tools ∩ getEnabledTools(tenant)` (IA-19) — resolvido POR REQUISIÇÃO. 3. Execução
delega ao `ToolsExecutor` com o tenantId DA KEY (nunca do payload). 4. Auth: Bearer →
sha256 → lookup; rate limit 60 req/min por key (reusar o mecanismo de rate limit do
server.ts — auditar qual é). 5. Cada chamada conta em `tool_usage_daily` (IA-19,
`recordToolUsage:182`). 6. Rotas admin: `GET/POST /ia/mcp/keys` ·
`PATCH /ia/mcp/keys/:id` `{enabled, tools}` · `DELETE /ia/mcp/keys/:id`.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/McpPage.tsx` (+ teste) |
| MODIFICAR | hub (key `mcp`, "Conexões MCP", "Conecte o Claude e outros clientes aos dados do seu provedor.", ícone `Plug`, `/intelligence/mcp`) · App.tsx · pt-br.ts |

Lista de keys (`DataTablePro`: Nome · Criada · Último uso · Tools (contagem) · Switch)
+ botão primary **"Nova chave"** → Dialog: nome + checkboxes SÓ das tools read-only →
resultado: chave em bloco mono + botão copiar + aviso amber **"Guarde agora — a chave
não será exibida de novo."** + snippet copiável do `claude_desktop_config.json` com a
URL do ambiente. Delete → ConfirmDialog **"Revogar esta chave?"** / **"Integrações
usando esta chave param de funcionar imediatamente."**

### Testes
Key inválida → 401; **tool de ESCRITA nunca listada mesmo se injetada em `key.tools`
(o teste mais importante — defesa dupla)**; executor recebe o tenant da key; plaintext
da chave não persiste (grep no insert); E4: `READ_ONLY ∪ SIDE_EFFECT == catálogo`
(quebra se alguém adicionar tool sem classificar).

### Critérios de aceite
- [ ] Claude Desktop real conectado em staging executa `check_coverage` (print da
      conversa).
- [ ] `suspend_signal` inacessível via MCP (tentativa manual → erro; colar no log).
- [ ] Revogar key → chamada seguinte 401 (curl no log).
- [ ] RN8 completo.
**Rollback:** flags off (`POST /api/v2/mcp` → 404). **Commit:** `feat(ia17): mcp server read-only por api key/tenant (flag off)`.

---

# ⬜ IA-22 — Web browsing agent (allowlist + citação obrigatória)

**Objetivo:** tool `browse_url` — o agente consulta páginas externas (status da
operadora upstream, site da prefeitura, página do próprio ISP) SOMENTE em domínios da
allowlist do tenant, com extração de texto legível e citação da fonte na resposta.
**Flags:** `BROWSING_ENABLED` / client `browse`.
**Depende de:** IA-19 ✓ (catálogo/registry); padrão de defesa em camadas da IA-44 ✓.

**Auditoria:** extração JÁ existe — `extractReadableContent` (`site-scrape.ts:10`,
usada no scrape do onboarding; REUSAR — R5) + `contentHash:17`. Se ela for regex-based
e insuficiente, avaliar `cheerio` (dep a instalar) NA SESSÃO — registrar a decisão.
SSRF é o risco central: o fetch roda DENTRO da infra.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_browse_allowlist.sql` → `browse_allowlist(tenant_id, domain text, added_by, created_at, PRIMARY KEY (tenant_id, domain))` + RLS 023 |
| CRIAR | `apps/api/src/infrastructure/browse/url-guard.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/infrastructure/browse/browser.service.ts` (+ teste) |
| MODIFICAR | `vercel-ai.service.ts` (def `browse_url`) + `tools.executor.ts` (case novo) |
| CRIAR | `apps/api/src/domain/ia/browse-admin.routes.ts` (`GET/POST/DELETE /ia/browse/allowlist`) |
| MODIFICAR | `public-flags.ts` (`browse`) |

`url-guard.ts` (a suíte crítica): (a) só http/https; (b) domínio (eTLD+1, lowercase) ∈
allowlist — política EXPLÍCITA: domínio exato E subdomínios diretos (`*.dominio.com`)
— documentar e testar; (c) resolver DNS e RECUSAR IP privado/loopback/link-local/
metadata (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, 169.254.169.254) — e conectar NO
IP RESOLVIDO (anti-rebinding: lookup custom no Agent do undici — conferir a API NO
DIA); (d) redirects: máx 3, NUNCA cross-domain.
`browser.service.ts`: timeout 5s, máx 500KB, User-Agent identificado
(`AstrumISP-Agent/1.0`), `extractReadableContent`, retorno `{url_final, title, text
(máx 4000 chars), fetched_at}`; cache Redis 10min por URL.
Tool def: descrição **"Consulta uma página web da lista de sites confiáveis do
provedor. SEMPRE cite a URL da fonte na resposta ao cliente."** Recusa do guard →
`{error: 'Domínio fora da lista de sites permitidos.'}`. `nodeValidate`: resposta que
usou `browse_url` sem URL na resposta → `validationIssue` (regex barata).

### Frontend
MODIFICAR `ToolsPage` — aba nova **"Navegação"** (Tabs; só com flag `browse`): lista de
domínios + input validado + botão **"Adicionar"**; remover → ConfirmDialog **"Remover
este site?"** / **"O agente deixa de poder consultá-lo imediatamente."** Microcópia do
topo: **"O agente só navega nos domínios desta lista. Páginas são lidas como texto —
sem login, sem formulários."** SEM tela própria (RN12 via ToolsPage; log).

### Testes
url-guard: TODOS os ranges privados recusados; rebinding (DNS muda entre check e
fetch — mock lookup) recusado; domínio fora → recusa; subdomínio conforme política;
redirect cross-domain cortado; 500KB trunca sem explodir. Executor roteia; validate
pega resposta sem citação.

### Critérios de aceite
- [ ] e2e staging: allowlist com uma status page real → "a operadora X está com
      problema?" → resposta cita a URL (print).
- [ ] `http://169.254.169.254/` recusada (log).
- [ ] Flag off: tool fora do catálogo; aba fora do DOM.
**Rollback:** flags off. **Commit:** `feat(ia22): browsing agent com allowlist e citação obrigatória (flag off)`.

---

# ⬜ IA-39 — Constitutional loop (constituição editável por tenant)

**Objetivo:** o tenant edita os princípios de atendimento ("nunca prometer prazo sem OS
criada", "sempre oferecer 2ª via antes de falar de suspensão"); em intents SENSÍVEIS a
resposta passa por 1 ciclo crítica→revisão contra a constituição ANTES do safety_veto.
Complementa a IA-21 (rubrica fixa e VETADORA; aqui é editável e REVISORA).
**Flags:** `CONSTITUTIONAL_LOOP_ENABLED` / client `constitution`.
**Depende de:** IA-21 ✓.

**Auditoria:** grafo real (`langgraph.service.ts:83-146`): `generate → self_check →
validate → safety_veto → (escalate|END)`. Ponto de inserção: nó `constitutional_review`
entre `validate` (passou) e `safety_veto` — RELER as edges no dia (RN9). Intents
sensíveis (enum real, `agent.state.ts:19-22`): `cancel_service`, `complaint`, e
`support_billing` quando `sentiment ∈ {negative, frustrated}`. Padrão de nó: factory
em `nodes/*.node.ts` com deps injetadas (estabelecido pela IA-01/IA-21; barrel em
`agent.nodes.ts:44-59`).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_tenant_constitutions.sql` → `tenant_constitutions(tenant_id uuid PRIMARY KEY, principles text[] NOT NULL, updated_by text, updated_at timestamptz DEFAULT now())` + RLS 023 (validar máx 10 princípios × 280 chars na APLICAÇÃO — array CHECK em SQL é frágil) |
| CRIAR | `apps/api/src/infrastructure/guardrails/constitution.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/agent/nodes/constitutional-review.node.ts` (+ `.test.ts`) |
| MODIFICAR | `agent.state.ts` (+ `constitutionApplied: z.boolean().optional()`) + `langgraph.service.ts` (nó + edges + CHANNEL novo — armadilha B1) + `agent.nodes.ts` (barrel) |
| CRIAR | rotas `GET/PUT /ia/constitution` em `apps/api/src/domain/ia/constitution.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`constitution`) |

`constitution.service.ts`: `getConstitution(tenantId)` (cache Redis 60s; DEFAULT de
fábrica = 4 princípios CONSTANTES no arquivo) · `critiqueAndRevise(response,
principles, context)` → `gpt-4o-mini` generateObject `{violates: boolean,
principle_index: number|null, revised_response: string|null}`, UseCase
`constitutional-review` (RN7), fail-open (RN4).
Nó: short-circuit com flag off OU intent não-sensível; `violates` → substitui
`response` pela revisada + `constitutionApplied: true`. **1 ciclo, NUNCA loop.**

### Frontend
MODIFICAR `GuardrailsPage` (RELER INTEIRA — RN9) — vira Tabs: aba atual **"Vetos"** +
aba nova **"Constituição"**: lista editável (máx 10; input + adicionar; lixeira com
ConfirmDialog). Microcópia topo: **"Princípios que a IA segue ao revisar as próprias
respostas em conversas sensíveis (cancelamento, reclamação). Frases curtas e diretas
funcionam melhor."** Botão primary **"Salvar constituição"** → toast **"Constituição
atualizada — vale para as próximas conversas."** Nos vetos, badge slate **"revisada
pela constituição"** quando `constitutionApplied`. SEM tela nova (RN12 via
GuardrailsPage; log).

### Testes
Nó: flag off → zero LLM (spy); intent `other` → skip; `violates` → response
substituída, 1 ciclo só; fail-open em erro. Service: cache; default de fábrica quando
não há linha. Rotas: PUT valida limites (11 princípios → 400). Front: aba salva e
lista.

### Critérios de aceite
- [ ] Staging: princípio "nunca prometa visita sem OS criada" + fixture que promete →
      resposta final SEM a promessa (colar antes/depois no log).
- [ ] Latência extra p50 <800ms no caminho sensível (log com timestamps).
- [ ] Flag off: grafo byte a byte (suíte `langgraph.service.test.ts` verde sem
      mudança).
**Rollback:** flags off. **Commit:** `feat(ia39): constitutional loop editável por tenant (flag off)`.

---

# ⬜ IA-28 — Perfil de comunicação (formal ↔ coloquial ↔ técnico)

**Objetivo:** a IA adapta o TOM ao cliente — UM único eixo (decisão anti-creepy
registrada: nada de perfil psicológico); perfil visível e com opt-out no cadastro do
cliente. Heurística TS pura, ZERO LLM.
**Flags:** `COMM_PROFILE_ENABLED` / client `commprofile`.
**Depende de:** IA-05 ✓ (composer), IA-27 ✓ (o perfil persiste como FEATURE).

**Auditoria:** o registry aceita feature textual (`FeatureValue = number|string|null`,
`feature-registry.ts:55`) — ZERO tabela nova. Mecanismo de sufixo no `systemContext`
já existe (IA-14 idioma, `generate.node.ts`) — mesmo ponto. Cache semântico precisa
ser desabilitado quando há sufixo personalizado (padrão IA-14; auditar
`isEligibleForCache`, `semantic-cache.service.ts:147`).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/ml/comm-style.ts` (+ `.test.ts`) — PURO |
| CRIAR | `packages/db/src/migrations/0XX_comm_optout.sql` → `ALTER TABLE customers ADD COLUMN IF NOT EXISTS comm_profile_opt_out BOOLEAN NOT NULL DEFAULT FALSE;` |
| MODIFICAR | `feature-registry.ts` (+ `comm_style` value_text, `comm_style_confidence`; ttl 24h) |
| MODIFICAR | `feature-store.service.ts` (`computeAllForTenant` computa das últimas 50 msgs/cliente — query em batch, não N+1) |
| MODIFICAR | `generate.node.ts` (sufixo condicionado) · `public-flags.ts` (`commprofile`) |

`inferCommStyle(messages: string[])` → `{style: 'formal'|'coloquial'|'tecnico',
confidence: 0..1}` — sinais: % de emoji/internetês ("vc","blz","pq","mn") → coloquial;
termos técnicos ("pppoe","onu","latência","ip fixo","dns","roteador em bridge") →
técnico; senão formal. Listas CONSTANTES no arquivo. <10 msgs → formal com
confidence 0.
`generate.node.ts`: flag on + `!opt_out` + confidence ≥0.6 → sufixo (3 strings EXATAS,
RN14): **"Tom da conversa: o cliente se comunica de forma informal; seja leve, use
frases curtas, evite jargão."** / **"...de forma técnica; pode usar termos de rede com
precisão."** / **"...de forma formal; trate por senhor/senhora e evite gírias."**

### Frontend
MODIFICAR a página de DETALHE do cliente do legado (auditar o arquivo real nas 22
páginas — `AUDITORIA_FRONTEND.md`; RELER INTEIRA antes — RN9): card **"Comunicação"**
com badge do estilo (slate) + `ConfidenceMeter` + Switch **"Adaptar tom
automaticamente"** (desligar = opt-out; toast **"A IA volta ao tom padrão com este
cliente."**). Microcópia LGPD: **"Estimado pelo estilo de escrita das mensagens deste
cliente. Nenhum dado é compartilhado."** SEM tela no hub (RN12 via página do cliente;
log).

### Testes
comm-style: fixtures dos 3 estilos + <10 msgs → formal/0; worker grava a feature;
generate: opt-out → sem sufixo; confidence 0.5 → sem sufixo; cache semântico não
cacheia com sufixo presente; flag off → snapshot do systemContext idêntico.

### Critérios de aceite
- [ ] Staging: cliente com histórico "vc pode ver isso pra mim? blz" → resposta
      perceptivelmente informal (print antes/depois).
- [ ] Opt-out na tela → próxima resposta volta ao padrão (e2e).
- [ ] Flag off: zero mudança (snapshot).
**Rollback:** flags off. **Commit:** `feat(ia28): perfil de comunicação 1-eixo com opt-out (flag off)`.

---

# ⬜ IA-36 — Edge inference (triagem na borda, modo shadow)

**Objetivo:** classificar intent na borda (Cloudflare Workers AI,
`@cf/meta/llama-3.1-8b-instruct` — conferir o modelo vigente NO DIA) — SÓ assume a
triagem depois de concordância ≥85% com o central medida em SHADOW. Esta sessão
implementa o shadow + painel; o cutover é decisão futura com o número na mão.
**Flags:** env `EDGE_INFERENCE_MODE` enum `off|shadow` (o valor `active` NÃO existe
nesta sessão — honestidade de escopo) / client `edge`.

**Auditoria:** alvo = `classifyIntent` (`vercel-ai.service.ts:176`, gpt-4o-mini via
`withFailover('mini')`, schema `CustomerIntentSchema:54` — 7 intents + urgency +
sentiment). Workers AI expõe REST
`https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/ai/edge-classifier.ts` (+ `.test.ts`) |
| CRIAR | `packages/db/src/migrations/0XX_edge_shadow.sql` |
| MODIFICAR | `vercel-ai.service.ts` (`classifyIntent`: shadow fire-and-forget) |
| CRIAR | `GET /ia/edge/agreement` em `apps/api/src/domain/ia/edge.routes.ts` (+ teste) |
| MODIFICAR | `env.validator.ts` (`CF_ACCOUNT_ID?`, `CF_AI_API_TOKEN?`, `EDGE_INFERENCE_MODE`) · `public-flags.ts` (`edge`) |

Migration: `edge_shadow_results(id uuid pk, tenant_id, message_hash text NOT NULL,
central_intent text NOT NULL, edge_intent text, agree boolean, edge_ms int, created_at
timestamptz DEFAULT now())` + RLS 023. **SEM o texto da mensagem — só hash (LGPD).**
Regras: 1. `classifyAtEdge(message, history)`: REST com timeout 2s; prompt curto
pedindo JSON do MESMO enum de 7 intents; parse defensivo (JSON inválido → null, conta
como discordância `edge_intent=null`). 2. Shadow NUNCA bloqueia nem atrasa o caminho
central: fire-and-forget em paralelo, `.catch` → warn. 3. Sem env CF → shadow vira
no-op com warn 1x no boot.

### Frontend
MODIFICAR `AIObservabilityPage` — card **"Triagem na borda"**: taxa de concordância
(mono %, RiskBadge ≥85% baixo / ≥70% médio / abaixo alto), latência média edge ×
central (mono), barras por intent. Microcópia: **"O modelo de borda só assume a
triagem quando concordar com o central em pelo menos 85% por 14 dias."** SEM tela
própria (RN12; log).

### Testes
Parse defensivo (JSON lixo → null, não explode); shadow não atrasa o central (fake
timers: central resolve antes do edge); `agree` correto; sem env → no-op; hash no
insert (nunca o texto — teste com grep no payload do mock).

### Critérios de aceite
- [ ] 100 mensagens em staging → `SELECT count(*), avg(agree::int)` colado no log;
      painel bate com a query.
- [ ] p95 do `classifyIntent` central INALTERADO com shadow on (comparar logs).
- [ ] Zero PII na tabela (SELECT no log).
**Rollback:** `EDGE_INFERENCE_MODE=off`. **Commit:** `feat(ia36): edge inference em shadow + painel de concordância (off)`.

---

# ⬜ IA-35 — Orçamento de latência por nó

**Objetivo:** p95 por nó do grafo contra budgets DECLARADOS; estouro → notificação.
Nota de realismo mantida: não existe "speculative decoding" sobre a API da OpenAI —
o ganho vem de MEDIR e atacar o nó certo.
**Flags:** `LATENCY_BUDGET_ENABLED` / client `latency`.
**Depende de:** IA-32 (os spans são a fonte).

**Auditoria/decisão registrada:** em vez de CONSULTAR o backend OTLP (acoplamento a
Tempo/Jaeger), o `withSpan` da IA-32 ganha um hook `onEnd` que alimenta agregado local
barato: rolling 24h no Redis + fechamento diário em Postgres. Notificações = tabela
`notifications` (016; auditar o insert padrão, mesmo caminho da IA-33).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/observability/latency-budget.ts` (+ `.test.ts`) |
| CRIAR | `packages/db/src/migrations/0XX_node_latency.sql` |
| MODIFICAR | `otel-span.helper.ts` (hook `onEnd` → `recordNodeLatency` quando flag on) |
| MODIFICAR | `packages/queue/src/workers/drift.worker.ts` (**decisão registrada:** job `latency-rollup` no cron 04h do drift — NÃO criar 14º worker) |
| CRIAR | `GET /ia/latency/report` em `apps/api/src/domain/ia/latency.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`latency`) |

`BUDGETS_MS` exportado (valores INICIAIS — recalibrar com 7d de dados reais, registrar):
`classify 800 · guardrails 50 · decide_source 20 · fetch_context 1200 · grade_context
700 · rewrite_query 700 · generate 6000 · self_check 900 · validate 20 · safety_veto
900 · escalate 100` (+ `constitutional_review 900` se a IA-39 já rodou — conferir o
grafo no dia). Migration: `node_latency_daily(node text, day date, p50 numeric, p95
numeric, count int, PRIMARY KEY (node, day))` — agregado GLOBAL de infra, sem
tenant_id/RLS; acesso só admin (decisão registrada). Estouro: p95(7d) > budget×1.2 →
notificação com dedupe 1/dia por nó.

### Frontend
MODIFICAR `AIObservabilityPage` — seção **"Latência por nó"**: barras horizontais
(Recharts) p95 vs budget (o excedente do budget em orange), valores mono; select
24h/7d. Microcópia: **"p95 por etapa do pipeline. O orçamento é a linha; o que passa
dela é o que o cliente sente."** SEM tela própria (RN12; log).

### Testes
Percentil correto (fixtures com distribuição conhecida); estouro cria notificação com
dedupe; flag off → `onEnd` não grava (spy no Redis); rollup idempotente (2 execuções =
mesmas linhas).

### Critérios de aceite
- [ ] 24h de staging → report com p95 real dos nós (print).
- [ ] Estouro sintético no `generate` (sleep no mock) → notificação criada (query no
      log).
- [ ] Flag off: zero escrita no Redis.
**Rollback:** flags off. **Commit:** `feat(ia35): orçamento de latência p95 por nó (flag off)`.

---

# ⬜ IA-24 — Anomalia de rede (EWMA/z-score) + ADR ML/Python

**Objetivo:** detectar CTO com comportamento anômalo (packet loss/latência fora da
banda esperada) ANTES do cliente reclamar, com estatística TS pura; e ESCREVER a
`ADR-ml-python-service.md` (RN15) — a decisão de como o produto ganha um serviço
Python (Isolation Forest aqui; sobrevivência p/ LTV; SHAP real p/ churn; embeddings
de voz p/ IA-12).
**Flags:** `NETWORK_ANOMALY_ENABLED` / client `netanomaly`.
**Depende de:** IA-09 ✓. **GATE DE DADOS:** ≥30 dias de `network_metrics` em staging —
verificar `SELECT min(collected_at) FROM network_metrics` ANTES de começar; sem 30d,
registrar o bloqueio no PROGRESS_LOG e pular para a próxima da ordem.

**Auditoria:** `network_metrics` (035) — `metric CHECK IN ('latency_ms',
'packet_loss_pct','signal_dbm','clients_online')`, índice `(tenant_id, cto_id, metric,
collected_at DESC)`; ingest `POST /api/v2/rede/metrics` batch até 500
(`metrics-ingest.routes.ts:25`); `cto-alert.worker.ts` roda cron 15min com threshold
FIXO de 5% packet loss + dedupe de ticket — a anomalia é o upgrade ESTATÍSTICO desse
threshold. Notificações: tabela `notifications` (016).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `docs/adr/ADR-ml-python-service.md` — status `proposed`; a DECISÃO é do Lucas |
| CRIAR | `apps/api/src/domain/rede/anomaly.ts` (+ `.test.ts`) — PURO |
| CRIAR | `packages/db/src/migrations/0XX_network_anomalies.sql` |
| MODIFICAR | `packages/queue/src/workers/cto-alert.worker.ts` (flag on: além do threshold fixo — MANTIDO —, roda detecção na janela 48h) |
| CRIAR | `GET /ia/network/anomalies?days=7` + `GET /ia/network/health` em `apps/api/src/domain/rede/anomaly.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`netanomaly`) |

ADR: contexto (4 demandas de ML que o TS não cobre), opções (A: FastAPI sidecar no
mesmo deploy; B: serviço separado com fila; C: continuar TS-only), recomendação A com
contrato HTTP interno + healthcheck + fallback TS (fail-open), consequências.
**Nenhuma linha de Python nesta sessão.**
```ts
// anomaly.ts
export function ewma(series: number[], alpha = 0.3): number[];
export function zscore(value: number, mean: number, std: number): number;
export function detectAnomalies(points: {t: string; v: number}[],
  opts?: { zThreshold?: number; minPoints?: number }   // default 3 / 48
): { bands: {t: string; expected: number; upper: number}[]; anomalies: {t: string; v: number; z: number}[] };
```
Migration: `network_anomalies(id uuid pk, tenant_id, cto_id, metric text, value
numeric, expected numeric, zscore numeric, severity text CHECK (severity IN
('medio','alto')), created_at timestamptz DEFAULT now())` + RLS 023. Severity: z≥3
médio, z≥4 alto. Worker: anomalia → grava + notificação com dedupe 6h por
(cto, metric); flag off → byte a byte o worker atual.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/NetworkHealthPage.tsx` (+ teste) |
| MODIFICAR | hub (key `netanomaly`, "Saúde da Rede", "Anomalias estatísticas por CTO antes do cliente reclamar.", ícone `HeartPulse`, `/intelligence/network-health`) · App.tsx · pt-br.ts |

Grid de `RiskStripeCard` por CTO com anomalia ativa (métrica, valor vs esperado mono,
"há 2h") + LineChart da métrica com banda EWMA sombreada e pontos anômalos marcados +
link Ghost **"Ver impacto"** → `/intelligence/graph` (IA-16, aba Impacto). Vazio:
**"Rede dentro do esperado."** / **"Nenhuma anomalia nas últimas 24 horas."** (sem
botão). Erro: padrão IA-21.

### Testes
ewma/zscore: série com degrau → detecta; ruído gaussiano → não detecta; `minPoints`
respeitado (47 pontos → vazio); worker flag off inalterado (snapshot de chamadas);
dedupe 6h; severity nos cortes.

### Critérios de aceite
- [ ] Injeção sintética em staging (batch com packet_loss 3σ acima) → anomalia +
      notificação (queries no log).
- [ ] Falsos positivos controlados: 7d de dados reais → ≤2 anomalias/dia/tenant
      (senão subir zThreshold; registrar a calibração no log).
- [ ] ADR commitada, linkada no PROGRESS_LOG, decisão marcada como pendente do Lucas.
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia24): anomalia de rede ewma/z-score + ADR ml-python (flag off)`.

---

# ⬜ IA-25 — Forecast de demanda (staffing)

**Objetivo:** prever o volume de tickets 14 dias à frente (média móvel sazonal por
dia-da-semana sobre DuckDB) e traduzir em staffing sugerido. Prophet/Python só via ADR
aprovada (IA-24).
**Flags:** `DEMAND_FORECAST_ENABLED` / client `forecast`.
**Depende de:** IA-24 (ADR escrita). **Gate de dados:** ≥60d de tickets no DuckDB.

**Auditoria:** DuckDB REAL — `duckdb.service.ts` (`getDuckDB:20`); ETL já sincroniza
`syncTickets` (`etl.service.ts:133`) e `syncMessages:67`, com rota admin
`POST /api/v2/admin/etl/sync` (`etl.routes.ts:6`); schema em `analytics.schema.ts:8`.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/ml/forecast.ts` (+ `.test.ts`) — PURO |
| CRIAR | `apps/api/src/domain/ia/forecast.routes.ts` (+ teste) — `GET /ia/forecast/demand?days=14` |
| MODIFICAR | `env.validator.ts` (`AGENT_CAPACITY_PER_DAY?` default 25) · `public-flags.ts` (`forecast`) |

```ts
// forecast.ts
export function seasonalMovingAverage(daily: {date: string; count: number}[], horizon = 14):
  { date: string; forecast: number; low: number; high: number }[];
// média das últimas 4 ocorrências do mesmo dia-da-semana × fator de tendência
// (média 14d ÷ média 28d, clamp 0.7..1.3); IC = ±1.5×desvio dos resíduos.
export function suggestStaffing(forecast: number, perAgentPerDay: number): number; // ceil
```
Rota: lê a série agregada por dia do DuckDB; <60d de histórico → `409 {error, hint:
"Rode a sincronização de analytics e acumule histórico."}`.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/StaffingPage.tsx` (+ teste) |
| MODIFICAR | hub (key `forecast`, "Previsão de Demanda", "Quantos atendimentos vêm aí — e quanta gente precisa.", ícone `TrendingUp`, `/intelligence/staffing`) · App.tsx · pt-br.ts |

BarChart: 28d passados (slate) + 14d previstos (fiber, IC como área) + `DataTablePro`
(Dia · Dia da semana · Previsto com IC (mono) · Atendentes sugeridos (mono)) + StatCard
**"Pico previsto"**. Nota metodológica: **"Média sazonal por dia da semana com
tendência. Previsões são estimativas — confie mais no intervalo do que no ponto."**
Vazio/409: **"Histórico insuficiente para prever."** / **"São necessários 60 dias de
tickets sincronizados."** + botão Secondary **"Sincronizar analytics"** (dispara a
rota de ETL existente).

### Testes
forecast puro: série sintética com sazonalidade semanal → o padrão aparece na
previsão; tendência clampada em 0.7/1.3; IC cresce com o ruído; staffing arredonda
para cima; rota: <60d → 409.

### Critérios de aceite
- [ ] Backtest no log: treinar até d−14 e comparar com o real — MAPE ≤30% em staging
      (registrar o número; se pior, registrar e ajustar janelas).
- [ ] Tela com dado real (print).
- [ ] Flag off: tela fora do DOM; zero rota nova exposta sem flag server.
**Rollback:** flags off. **Commit:** `feat(ia25): forecast sazonal de demanda + staffing (flag off)`.

---

# ⬜ IA-13 — Speech analytics QA (scorecard de 100% das chamadas)

**Objetivo:** toda chamada de voz ganha transcript PERSISTIDO + scorecard automático
(rubrica ISP de 6 critérios via gpt-4o-mini) + tela `/intelligence/voice-qa`. É a
PRIMEIRA sessão de voz da Fase 2: cria a persistência que IA-40 e IA-12 usam.
**Flags:** `VOICE_QA_ENABLED` / client `voiceqa`.
**Depende de:** IA-08 A1+A2 ✓. **GATE parcial:** IA-08 A3 (identificação — PENDENTE
desde 2026-07-06, E2) NÃO bloqueia transcript/scorecard, mas bloqueia atribuir chamada
a customer — o MVP grava por telefone/tenant com `customer_id` NULLABLE.

**Auditoria:** `RealtimeBridge` (`realtime-bridge.service.ts:60`) já troca eventos com
a OpenAI Realtime — os eventos de transcrição
(`conversation.item.input_audio_transcription.completed` /
`response.audio_transcript.done` — conferir os nomes na versão instalada NO DIA)
passam pelo bridge e HOJE são descartados. `voice-call.ts` tem a máquina de estados
(`transition:31`, `initialCall:68`). NADA de chamada é persistido hoje (auditado:
zero tabela de voz). `BridgeDeps` (:50) é seam injetável — estender por ele.

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_voice_calls.sql` |
| MODIFICAR | `realtime-bridge.service.ts` (`BridgeDeps` + `onTranscript?: (turn) => void`; flag on → acumula e persiste no fim da chamada, fire-and-forget) |
| MODIFICAR | `prompt-registry.ts` (PromptId `voice_qa` + rubrica de 6 critérios) |
| CRIAR | `apps/api/src/domain/atendimento/voice-qa.service.ts` (+ `.test.ts`) |
| CRIAR | `packages/queue/src/workers/voice-qa.worker.ts` (fila sob demanda, padrão `replay.worker.ts` — sem cron; job enfileirado no fim da chamada) |
| CRIAR | `GET /ia/voice/calls` + `GET /ia/voice/calls/:id` em `apps/api/src/domain/ia/voice.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`voiceqa`) |

Migration: `voice_calls(id uuid pk, tenant_id, customer_id uuid NULL, phone_last4
text, phone_hash text, started_at, ended_at, duration_s int, status text)` +
`voice_transcripts(id uuid pk, call_id uuid REFERENCES voice_calls(id) ON DELETE
CASCADE, tenant_id, role text CHECK (role IN ('customer','agent')), content text,
t_offset_ms int)` + `voice_scorecards(call_id uuid PRIMARY KEY REFERENCES
voice_calls(id), tenant_id, total int, criteria jsonb, model text, created_at)` + RLS
023. **Telefone NUNCA em claro: só last4 + hash.**
Rubrica (6 critérios fixos, 0-100 + justificativa cada): saudação identificou o
provedor · confirmou o problema · linguagem clara sem jargão · resolveu ou encaminhou
corretamente · confirmou a resolução com o cliente · despedida com próximos passos.
`scoreCall(callId)`: transcript → generateObject (schema Zod dos 6), UseCase
`voice-qa` (RN7), fail-open.

### Frontend
| Ação | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/VoiceQaPage.tsx` (+ teste) |
| MODIFICAR | hub (key `voiceqa`, "Qualidade de Voz", "Scorecard automático de todas as chamadas.", ícone `PhoneCall`, `/intelligence/voice-qa`) · App.tsx · pt-br.ts |

Lista (`DataTablePro`: Quando · Duração (mono) · Telefone (•••1234) · Nota (mono;
signal ≥80 / amber ≥60 / orange abaixo)) → detalhe: RadarChart (Recharts) dos 6
critérios + `TimelineList` do transcript (cliente/agente alternados, offset mono) +
card com a justificativa por critério. Vazio: **"Nenhuma chamada analisada."** /
**"As chamadas aparecem aqui quando o atendimento por telefone estiver ativo
(VOICE_ENGINE=mvp)."**

### Testes
Bridge: `onTranscript` chamado nos eventos (fixtures de evento Realtime); persistência
agrupa por chamada e ordena por offset; `scoreCall`: schema válido, total coerente com
os critérios; telefone mascarado SEMPRE (teste que FALHA se número completo aparecer
em qualquer insert); página renderiza radar do fixture.

### Critérios de aceite
- [ ] Chamada real em staging (`VOICE_ENGINE=mvp`) → transcript + scorecard no banco e
      na tela (prints).
- [ ] Cobertura 100%: 5 chamadas → 5 scorecards (query no log).
- [ ] Custo por chamada visível no Helicone (`voice-qa`).
- [ ] Flag off: bridge byte a byte (zero persistência; snapshot).
**Rollback:** flags off. **Commit:** `feat(ia13): speech qa — transcript persistido + scorecard por rubrica (flag off)`.

---

# ⬜ IA-40 — PII em voz (mascarar ANTES de persistir)

**Objetivo:** transcripts de voz nunca persistem PII em claro: CPF, telefone, e-mail,
cartão DITADOS são mascarados antes do INSERT (LGPD by design), com marcação visível
na tela.
**Flags:** `VOICE_PII_MASK_ENABLED` / client `voicepii`.
**Depende de:** IA-13 (o ponto ÚNICO de persistência criado lá).

**Auditoria:** detector REAL já existe e é puro — `detectAndMaskPII`
(`pii-detector.service.ts:82`), `PIIType:34`, `maskPII:127` — REUSAR (R5). Risco
específico de voz: número DITADO pode virar "um dois três quatro..." — a transcrição
da Realtime normalmente normaliza para dígitos (CONFIRMAR em staging), mas cobrir a
variante por extenso é escopo desta sessão.

### Backend
| Ação | Arquivo |
|---|---|
| MODIFICAR | `pii-detector.service.ts` (+ `spokenNumbersToDigits(text)` pt-BR pura exportada: "um dois três"→"123", "meia"→"6"; aplicada SÓ com opção `{spoken: true}` — snapshot dos consumidores atuais INALTERADO) |
| MODIFICAR | ponto de persistência da IA-13 (pipeline: turno → flag on → `detectAndMaskPII(turn, {spoken:true})` → INSERT do MASCARADO + `pii_entities` (tipos + offsets pós-máscara; NUNCA o valor original)) |
| CRIAR | `packages/db/src/migrations/0XX_voice_pii.sql` → `ALTER TABLE voice_transcripts ADD COLUMN IF NOT EXISTS pii_entities JSONB;` |
| CRIAR | `apps/api/scripts/mask-existing-transcripts.ts` (one-shot retroativo, idempotente) |
| MODIFICAR | `public-flags.ts` (`voicepii`) |

### Frontend
MODIFICAR `VoiceQaPage` — trecho mascarado renderiza chip slate **`[CPF]`** /
**`[telefone]`** com tooltip **"Removido automaticamente antes de salvar (LGPD)."**;
contador no detalhe: **"3 dados pessoais mascarados nesta chamada."** SEM tela própria
(RN12 via VoiceQaPage; log).

### Testes (a suíte crítica)
CPF ditado por extenso mascarado; telefone com DDD; e-mail com "arroba"; falso
positivo controlado: protocolo de 8 dígitos NÃO mascara (regra: só padrões com
validação estrutural — CPF com dígito verificador); snapshot dos consumidores atuais
do detector inalterado; o INSERT nunca contém o original (teste no seam); script
retroativo 2× = mesmo resultado.

### Critérios de aceite
- [ ] Chamada staging ditando um CPF → banco SEM o CPF (SELECT no log) e chip na tela
      (print).
- [ ] `{spoken:true}` não ativa no caminho WhatsApp/texto (snapshot).
- [ ] Script retroativo idempotente provado no log.
**Rollback:** flag off para NOVAS chamadas (recomendação registrada: manter ON).
**Commit:** `feat(ia40): máscara de pii em transcripts de voz antes de persistir (flag off)`.

---

# ⬜ IA-12 — Voice biometrics (trilho com consentimento LGPD)

**Objetivo:** cliente que CONSENTIU tem identidade reforçada na chamada; badge
"verificado por voz". **Honestidade técnica registrada:** a API Realtime NÃO expõe
speaker embeddings; embedding real (resemblyzer/pyannote) é Python → depende da ADR
(IA-24) IMPLEMENTADA. Esta sessão entrega o TRILHO completo: consentimento,
verificação por desafio de conhecimento (fallback), port de verificação com adapter
`null` — zero Python.
**Flags:** `VOICE_BIOMETRICS_ENABLED` / client `voicebio`.
**Depende de:** IA-08 A3 (identificação — E2, PENDENTE) + IA-13 ✓ + ADR (IA-24).
**Não agendar antes da A3.**

**Auditoria:** `CustomerIdentifier` já é seam injetável do bridge
(`realtime-bridge.service.ts:45` — `(ctx: {cpf?, phone?}) => Promise<string|null>`);
nenhuma tabela de consentimento existe (auditar colunas de `customers` NO DIA).

### Backend
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_voice_biometry.sql` |
| CRIAR | `apps/api/src/domain/atendimento/voice-verify.port.ts` (+ adapter `nullVoiceVerify` + teste) |
| MODIFICAR | integração A3 do bridge (identificado + consentiu → `verify()`; `'unavailable'` → desafio de conhecimento via prompt `voice_identity` no registry: confirmar data de nascimento OU 3 primeiros dígitos do CPF ANTES de dados sensíveis) |
| CRIAR | `POST /ia/voice/consent` + `DELETE /ia/voice/consent/:customerId` em rotas de voz (+ teste) |
| MODIFICAR | `prompt-registry.ts` (`voice_identity`) · `public-flags.ts` (`voicebio`) |

Migration: `voice_biometry_consents(customer_id uuid PRIMARY KEY, tenant_id,
consented_at timestamptz NOT NULL, consent_channel text, revoked_at timestamptz)` +
`voice_prints(customer_id uuid PRIMARY KEY, tenant_id, print bytea, model_version
text, created_at)` + RLS 023. `print` é OPACO (gerado pelo serviço Python futuro);
sem pgvector novo.
```ts
export interface IVoiceVerifyPort {
  enroll(callId: string, customerId: string): Promise<'ok' | 'unavailable'>;
  verify(callId: string, customerId: string): Promise<{ verified: boolean; confidence: number } | 'unavailable'>;
}
```
**LGPD:** revogação (`DELETE`) apaga `voice_prints` imediatamente (art. 18); sem
consentimento, `verify()` NUNCA é chamado.

### Frontend
Badge **"Verificado por voz"** (signal) / **"Identidade por desafio"** (slate) no
detalhe da chamada (VoiceQaPage); card de consentimento no cadastro do cliente
(Switch + microcópia: **"Com o consentimento, a voz do cliente reforça a identificação
nas chamadas. Revogável a qualquer momento; o registro de voz é apagado na
revogação."**). SEM tela própria (RN12; log).

### Testes
Sem consentimento → `verify` NUNCA chamado (spy — o teste mais importante); revogação
apaga `voice_prints` (mock verifica delete); adapter null → fluxo cai no desafio;
contrato do port respeitado.

### Critérios de aceite
- [ ] e2e staging (com A3): cliente sem consentimento → desafio de conhecimento no
      áudio (transcript no log).
- [ ] Consentir → revogar → SELECT prova `voice_prints` vazio.
- [ ] Zero Python nesta sessão; adapter HTTP só nasce com a ADR implementada.
**Rollback:** flags off. **Commit:** `feat(ia12): trilho de biometria de voz — consentimento + desafio + port (flag off)`.

---

# 🔒 IA-18 — A2A protocol (GATED)

**GATE (não agendar até TODOS):** (a) cutover `ATENDIMENTO_ENGINE=v2` estável ≥30d;
(b) IA-10 multi-agent com tráfego real; (c) existir um parceiro/agente externo
CONCRETO para interoperar — sem contraparte, é especulação.
**Objetivo (quando abrir):** expor o agente Astrum como agente A2A (Agent Card em
`/.well-known/agent.json`, tasks com lifecycle submitted→working→completed via
JSON-RPC) para agentes externos (ERP, marketplace de ISPs) delegarem/receberem tarefas.
**Esqueleto já auditado:** auth por API key generaliza a da IA-17 (`mcp_api_keys` →
`agent_api_keys`); a fronteira read-only/side-effect (E4) vale idêntica; o supervisor
da IA-10 (`buildMultiAgentGraph`, `multi-agent.supervisor.ts:77`; domínios
`atendimento|cobranca|retencao|escalation` em `multi-agent.state.ts:11`) é o executor
natural de uma task A2A.
**Ao abrir o gate:** rodar uma mini-sessão de expansão (padrão IA-F2-PLAN) auditando a
spec A2A VIGENTE — ela muda rápido; detalhar hoje apodrece.
**Flags:** `A2A_ENABLED` / client `a2a`. **Commit futuro:** `feat(ia18): a2a server mínimo (flag off)`.

---

# 🔒 IA-20 — Multi-agent debate (GATED)

**GATE:** (a) IA-10 com tráfego real (pós-cutover); (b) regra de custo definida pelo
Lucas: debate = ~3× chamadas full — só para decisões acima de um limiar (ex.:
suspensão de cliente com MRR ≥ R$200; desconto de retenção >20%).
**Objetivo (quando abrir):** decisões FINANCEIRAS de alto valor passam por debate:
agente-pró e agente-contra (gpt-4o, 1 rodada cada) + juiz (gpt-4o) → decisão final com
os votos GRAVADOS no audit trail imutável.
**Esqueleto já auditado:** `ai_decision_log` (035) tem `decision_type CHECK IN
('agent_response','escalation','tool_call','block')` → precisará de migration
`ALTER TABLE ... DROP CONSTRAINT / ADD CHECK` incluindo `'debate_vote'` (as RULEs
`no_update`/`no_delete` não impedem ALTER — ok, E6); writer canônico =
`recordDecision` (`ai-audit.service.ts:115`, hash-chain com `computeHash:44` e
`verifyChain:58`); UI: `TimelineList` (IA-11) pronta para a tela
`/intelligence/decisions`.
**Flags:** `DEBATE_ENABLED` / client `decisions`. **Commit futuro:** `feat(ia20): debate pró/contra/juiz em decisões financeiras (flag off)`.

---

# 🔒 IA-41 — Federated evaluation (GATED)

**GATE:** (a) ≥3 tenants grandes ativos; (b) análise LGPD ESCRITA e aprovada pelo
Lucas (agregação entre tenants é zona sensível — mesmo agregado pode vazar sinal);
(c) IA-42 rodando (a métrica federada é o pass-rate do eval).
**Objetivo (quando abrir):** comparar qualidade ENTRE tenants sem mover dado bruto:
cada tenant computa agregados locais → agregação com ruído (DP, ε documentado) →
benchmark "você vs mediana anônima" no hub.
**Esqueleto já auditado:** todas as métricas-fonte já existem POR TENANT — pass-rate
(eval IA-03/IA-42), taxa de veto (`GET /ia/safety/stats`, `safety.routes.ts:86`),
drift PSI (`drift_reports`, 043). O que falta é decisão de produto/jurídico, não
código.
**Flags:** `FEDERATED_EVAL_ENABLED` / client `fedeval`. **Commit futuro:** `feat(ia41): benchmark federado com ruído dp (flag off)`.

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

## APÊNDICE E — DÍVIDAS E ACHADOS DA AUDITORIA IA-F2-PLAN (2026-07-07 — li o código mergeado por você)

- **E1 — SandboxPage NÃO existe.** A IA-44 entregou o backend completo
  (`sandbox.routes.ts`: POST `:81`, histórico `:153`, guard super_admin `:65`), mas a
  consolidação das sessões paralelas NÃO trouxe `src/pages/intelligence/SandboxPage.tsx`
  nem a rota no `App.tsx` — o card `sandbox` do hub (BRANCH_REGISTRY) aponta para rota
  MORTA. Quitação atribuída à **IA-38** (primeira sessão de Fase 2 com UI); a spec da
  tela está na IA-44 da Fase 1.
- **E2 — IA-08 A3 pendente** (tools/identificação na voz — PROGRESS_LOG 2026-07-06).
  Gate duro para IA-12; IA-13/IA-40 rodam sem ela (`customer_id` nullable).
- **E3 — `churn-features.service.ts:159` usa SQL próprio** e NÃO o Feature Store — a
  nota cruzada da IA-27 não foi aplicada porque a IA-07 rodou ANTES da IA-27.
  Quitação na **IA-23** (com fallback fail-open).
- **E4 — `SIDE_EFFECT_TOOLS` vive em `replay.service.ts:76`** — a fonte única deveria
  ser o registry. Quitação na **IA-17** (mover para `tool-registry.ts` + reexport).
- **E5 — Migrations `035` duplicadas** (`035_ai_decision_log` + `035_network_metrics`)
  — herança das sessões paralelas; o runner aguenta, mas NÃO repetir o padrão.
  Próximo número livre em 2026-07-07 = `048` (RN5: conferir NO DIA).
- **E6 — `ai_decision_log.decision_type` tem CHECK restritivo** (4 valores) — a IA-20
  precisará de ALTER para `'debate_vote'`; as RULEs de imutabilidade não impedem ALTER.
- **E7 — `metadata.language` ainda não persiste** no `message.worker` (observação da
  IA-14) — não bloqueia nenhuma sessão da Fase 2; entra no cutover S74.
- **E8 — Typecheck:** 14 erros pré-existentes em `packages/queue/src/workers/
  message.worker.ts` (imports relativos — conhecidos; NÃO atribuir às sessões novas).
- **E9 — Padrão `costdrill`:** flag client-only (`public-flags.ts:24`, env `undefined`
  = sempre on) — disponível para flags de UI inócuas da Fase 2.
- **E10 — Catálogo real = 9 tools** (`agentTools`, `vercel-ai.service.ts:94-166` —
  as 8 da IA-19 + `query_network_graph` da IA-16). Toda sessão que adicionar tool
  (IA-22) DEVE classificá-la como read-only ou side-effect (teste da IA-17 quebra se
  não classificar).
