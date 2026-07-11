# PARTE 2 â€” IA-11 a IA-46 â€” Fase 1 (o chÃ£o) + Fase 2 (os andares)

> **Para a IA executora (Sonnet):** este arquivo completa o `PARTE1_IA01-IA10_backend__CONCLUIDO.md`
> (IA-01..IA-10). Reestruturado em 2026-07-05 em DUAS FASES:
>
> - **FASE 1 (IA-11 + 14 sessÃµes):** tecnologias cuja implementaÃ§Ã£o depende SÃ“ de cÃ³digo
>   que existe HOJE no repo â€” todas expandidas aqui em densidade total ("camisa 9"):
>   arquivos reais auditados, esqueletos de cÃ³digo, migrations, microcÃ³pia, testes.
>   VocÃª sÃ³ chuta.
> - **FASE 2 (21 sessÃµes):** tecnologias que estendem cÃ³digo que ainda vai nascer
>   (IA-04/07/08/09 da Parte 1 e sessÃµes da Fase 1). Ficam como galhos estruturados.
>   **O plano detalhado da Fase 2 serÃ¡ escrito DEPOIS da Fase 1 executada**, auditando os
>   diffs e logs REAIS produzidos (git log, PROGRESS_LOG, cÃ³digo mergeado) â€” nunca contra
>   cÃ³digo imaginado. Regra RN16 abaixo.
>
> Ordem geral de execuÃ§Ã£o: **Parte 1 (IA-01..IA-10) â†’ Fase 1 (esta) â†’ gate RN16 â†’
> Plano detalhado da Fase 2 â†’ Fase 2.** SessÃµes da Fase 1 nÃ£o dependem da Parte 1
> (podem intercalar se o Lucas mandar), mas NUNCA rode duas sessÃµes em paralelo.
>
> Auditoria de frontend: `.astrum-progress/ia-nextgen/AUDITORIA_FRONTEND.md` (leitura obrigatÃ³ria).
> Armadilhas: ApÃªndice B (Parte 1) + ApÃªndice C (frontend) + ApÃªndice D (achados novos).

---

## Â§0 â€” PROTOCOLO (herda Â§0 do PLANO_MESTRE_V2__EM_ANDAMENTO.md e Â§0/RN1â€“RN7 do PARTE1_IA01-IA10_backend__CONCLUIDO.md)

### 0.1 Ritual de inÃ­cio de TODA sessÃ£o
1. Ler `PLANO_MESTRE_V2__EM_ANDAMENTO.md` Â§0 (R1â€“R6, DoD) e `PARTE1_IA01-IA10_backend__CONCLUIDO.md` Â§0/Â§1/ApÃªndice B.
2. Ler `.astrum-progress/ia-nextgen/AUDITORIA_FRONTEND.md` INTEIRO.
3. Ãšltimas 3 entradas do `PROGRESS_LOG.md`; `git status` + `git log --oneline -5`.
4. Branch `feat/ia-XX-<slug>` a partir de `main`.
5. Fase 1 estÃ¡ 100% em main (2026-07-06). O gate RN16 foi CUMPRIDO pela sessÃ£o
   IA-F2-PLAN (2026-07-07): a Fase 2 estÃ¡ expandida em densidade total neste arquivo.
   PrÃ³xima sessÃ£o = primeira â¬œ da ordem da FASE 2 (Â§3). Ler tambÃ©m o ApÃªndice E
   (dÃ­vidas herdadas da consolidaÃ§Ã£o) antes de qualquer sessÃ£o.

### 0.2 Regras RN8â€“RN16
- **RN8 â€” Nenhuma sessÃ£o termina sem tela integrada** (quando a sessÃ£o tem UI): rota
  acessÃ­vel pelo nav real; ponta a ponta com flag ligada sem mock; estados loading
  (Skeleton p/ fetch >300ms), vazio (EmptyState com aÃ§Ã£o) e erro (o que houve + como
  resolver); print/gravaÃ§Ã£o no PROGRESS_LOG. SessÃµes marcadas "SEM UI prÃ³pria" cumprem
  RN8 na pÃ¡gina existente que modificam.
- **RN9 â€” Auditoria antes de codar.** Feita para o geral (AUDITORIA_FRONTEND.md + ApÃªndice D).
  Cada sessÃ£o relÃª por inteiro os arquivos que vai MODIFICAR antes do primeiro edit.
- **RN10 â€” Design System Ãºnico (Â§1).** Tokens `--astrum-*` aditivos; linguagem de risco
  idÃªntica em toda tela.
- **RN11 â€” Flag no client** via `GET /api/v2/flags/public` (IA-11) + `useFeatureFlags()`
  fail-closed. Flag off = zero rastro no DOM.
- **RN12 â€” Sem tela Ã³rfÃ£:** tudo sob a seÃ§Ã£o de nav "InteligÃªncia" e rota
  `/intelligence/*`. ExceÃ§Ãµes justificadas no PROGRESS_LOG.
- **RN13 â€” Acessibilidade/i18n = DoD.** AA, foco visÃ­vel, teclado, reduced-motion, cor
  nunca sozinha. Strings em `src/lib/i18n/pt-br.ts`.
- **RN14 â€” MicrocÃ³pia Ã© produto.** Os textos exatos estÃ£o escritos em cada sessÃ£o â€”
  use-os literalmente; mudanÃ§as de copy = decisÃ£o de produto, registrar no log.
- **RN15 â€” ML Python = ADR primeiro** (`ADR-ml-python-service.md`, escrita pela primeira
  sessÃ£o de Fase 2 que precisar â€” nenhuma sessÃ£o de Fase 1 precisa).
- **RN16 â€” GATE DA FASE 2.** A Fase 2 sÃ³ pode comeÃ§ar quando: (a) Fase 1 100% executada
  (checkboxes + PROGRESS_LOG); (b) uma sessÃ£o de planejamento dedicada ("IA-F2-PLAN")
  reescrever os 21 galhos em densidade total AUDITANDO O CÃ“DIGO REAL mergeado â€” com
  `git log`, nÃºmeros de linha reais e logs de produÃ§Ã£o/staging das features da Fase 1 e
  da Parte 1. Ã‰ proibido expandir sessÃ£o de Fase 2 contra cÃ³digo que nÃ£o existe.

### 0.3 Ritual de fim de sessÃ£o
Igual Ã  Parte 1 + prints (RN8) + atualizar `AUDITORIA_FRONTEND.md` se mudou nav/tokens/flags.

---

## Â§1 â€” ASTRUM-IA DESIGN SYSTEM (tokens obrigatÃ³rios â€” Ã­ntegra na revisÃ£o anterior deste
## arquivo; resumo operacional)

1. **Cores novas** no `@theme` de `src/index.css` (aditivas â€” NÃƒO tocar nos shadcn):
   `--color-astrum-signal:#00C2A8` (aÃ§Ã£o/ok) Â· `--color-astrum-fiber:#3D5AFE` (secundÃ¡ria)
   Â· `--color-astrum-amber:#F5A524` (mÃ©dio) Â· `--color-astrum-orange:#F0713C` (alto) Â·
   `--color-astrum-red:#E5484D` (crÃ­tico) Â· `--color-astrum-slate:#5B6472` (sem dado).
2. **Risco** = cor + rÃ³tulo TEXTO sempre; faixa 4px `border-l-4` em card/linha com risco.
   Proibido `--primary` para risco (no dark Ã© vermelho â€” armadilha C4).
3. **Tipografia:** Space Grotesk display (`--font-display`, carregar no `index.html`);
   Inter corpo (jÃ¡ Ã© `--font-sans`); **JetBrains Mono para todo nÃºmero medido** (jÃ¡ Ã©
   `--font-mono`). Escala 12/14/16/20/24/32/40; peso 700 sÃ³ em nÃºmero-herÃ³i.
4. **Forma:** grid 4px; raio via `--radius-*` (nunca px fixo â€” C3); sombra 2 nÃ­veis.
5. **BotÃµes:** `Button` shadcn existente; 1 primary por tela; destructive sempre com
   ConfirmDialog; loading trava largura.
6. **Componentes compartilhados** (IA-11): `RiskBadge`, `RiskStripeCard`,
   `ConfidenceMeter`, `EmptyState`, `DataTablePro` (paginaÃ§Ã£o sempre), `TimelineList`,
   `StatCard` â€” em `src/components/intelligence/`, sobre os primitivos `src/components/ui/*`.
7. **GrÃ¡ficos:** Recharts (lib do repo); sÃ©rie de risco sempre nas 4 cores acima.
8. Campo/tÃ©cnico = mobile-first; ops/dashboard = desktop-first; motion sÃ³ com funÃ§Ã£o.

---

## Â§2 â€” AUDITORIA â€” FEITA (2026-07-05): `AUDITORIA_FRONTEND.md` + ApÃªndice D deste arquivo.

---

## Â§3 â€” AS DUAS FASES

### FASE 1 â€” ordem de execuÃ§Ã£o (base: cÃ³digo que existe hoje)
```
IA-11 FundaÃ§Ã£o de UI (hub + flags client + tokens)      â† primeiro, sempre
IA-19 Tool registry dinÃ¢mico                            â† base agentic (IA-16 usa)
IA-37 Batching de tool calls                            â† pequena, generate
IA-21 Constitutional classifier (nÃ³ de veto)
IA-16 GraphRAG leve (tool de grafo de rede)
IA-14 Atendimento multilÃ­ngue
IA-30 CompressÃ£o de contexto RAG
IA-27 Feature Store leve                                â† base ML (IA-07 da P1 consome)
IA-26 Multi-armed bandit (CobrAI v2)
IA-33 Drift detection
IA-34 Cost attribution por cliente/feature
IA-43 Failover multi-provider (port do src/ai-provider)
IA-44 Sandbox SQL do agente
IA-45 Synthetic data generator
IA-46 Replay engine                                     â† gate tÃ©cnico do cutover S74/S82
```

### FASE 2 â€” ordem de execuÃ§Ã£o (gate RN16 CUMPRIDO em 2026-07-07; sessÃµes expandidas no fim do arquivo)
```
BLOCO A â€” mediÃ§Ã£o e quitaÃ§Ã£o de dÃ­vidas (sem dependÃªncia externa)
IA-32 OpenLLMetry (spans por nÃ³)          â† mediÃ§Ã£o primeiro; IA-35 depende
IA-42 Spec tracker (eval como gate de CI)
IA-38 SHAP + tela de churn                â† quita E1 (SandboxPage) e a dÃ­vida de tela da IA-07
IA-23 LTV                                 â† quita E3 (churn-features â†’ feature store)
BLOCO B â€” agentic e aprendizado
IA-31 LLM-as-judge + Elo
IA-29 Active learning
IA-15 OCR multi-layout + fila de revisÃ£o
IA-17 MCP server                          â† quita E4 (SIDE_EFFECT_TOOLS â†’ registry)
IA-22 Web browsing agent
IA-39 Constitutional loop
IA-28 Perfil de comunicaÃ§Ã£o
IA-36 Edge inference (shadow)
IA-35 OrÃ§amento de latÃªncia               â† depois da IA-32
BLOCO C â€” rede e previsÃ£o (gate de DADOS: â‰¥30/60d de histÃ³rico)
IA-24 Anomalia de rede                    â† escreve a ADR-ml-python-service (RN15)
IA-25 Forecast de demanda                 â† depois da ADR
BLOCO D â€” voz (gate: estado da IA-08; A3 concluÃ­da 2026-07-09)
IA-13 Speech analytics QA                 â† primeira: cria a persistÃªncia de chamadas
IA-40 PII em voz
IA-12 Voice biometrics                    â† exige A3 + ADR implementada
BLOCO E â€” GATED (nÃ£o agendar; critÃ©rios de abertura em cada sessÃ£o)
IA-18 A2A Â· IA-20 Debate Â· IA-41 Federated eval
```

**ReconciliaÃ§Ã£o dos ~55 itens** (inalterada): 2 duplicatas cruzadas; ~13 absorvidos na
Parte 1; 35 lÃ­quidos + IA-11 = IA-11..IA-46.

**Migrations:** os nÃºmeros `0XX_` abaixo sÃ£o placeholders â€” RN5: rode
`ls packages/db/src/migrations/` e use o prÃ³ximo nÃºmero real NO DIA (Parte 1 tambÃ©m cria
migrations; a ordem de execuÃ§Ã£o real define os nÃºmeros). PadrÃ£o RLS canÃ´nico =
`023_shadow_results.sql` (policy `tenant_isolation` com `app.current_tenant_id`).

---

## Â§4 â€” TEMPLATE POR SESSÃƒO â€” jÃ¡ aplicado em todas as sessÃµes da Fase 1 abaixo. A sessÃ£o
## IA-F2-PLAN usarÃ¡ este mesmo template para expandir a Fase 2 (ver RN16).

---
---

# FASE 1 â€” SESSÃ•ES EM DENSIDADE TOTAL

# âœ… IA-11 â€” FundaÃ§Ã£o: Central de InteligÃªncia + flags no client + tokens Astrum-IA

**Objetivo:** o chÃ£o dos galhos: (a) endpoint pÃºblico de flags com whitelist; (b) hook
`useFeatureFlags()` fail-closed; (c) tokens + fonte display; (d) componentes Â§1.6;
(e) seÃ§Ã£o "InteligÃªncia" no Sidebar + rota `/intelligence` com hub; (f) strings pt-BR.
**Flag (server):** `INTELLIGENCE_HUB_ENABLED` default `false` Â· **client:** `hub`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/config/public-flags.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/flags.routes.ts` (+ teste) |
| MODIFICAR | `apps/api/src/domain/ia/index.ts` (registrar como as rotas irmÃ£s) |

```ts
// public-flags.ts â€” whitelist explÃ­cita; NUNCA iterar process.env
const PUBLIC_FLAGS: Record<string, string> = {
  hub: 'INTELLIGENCE_HUB_ENABLED',
  // cada sessÃ£o IA-XX adiciona AQUI: '<chave client>': '<ENV_SERVER>'
};
export function getPublicFlags(): Record<string, boolean> {
  return Object.fromEntries(Object.entries(PUBLIC_FLAGS).map(
    ([key, env]) => [key, (process.env[env] ?? '').trim().toLowerCase() === 'true'],
  ));
}
```
`flags.routes.ts`: `GET /flags/public` â†’ `{ flags: getPublicFlags() }`, sem auth (sÃ³
booleans), `Cache-Control: public, max-age=60`. Confirmar o prefixo real (`/api/v2`)
observando como as irmÃ£s de `domain/ia/*.routes.ts` sÃ£o registradas.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/lib/feature-flags.ts` + `src/hooks/useFeatureFlags.ts` (+ testes) |
| CRIAR | `src/lib/i18n/pt-br.ts` (objeto tipado; strings de TODAS as telas novas vivem aqui) |
| CRIAR | `src/pages/intelligence/IntelligenceHubPage.tsx` |
| CRIAR | `src/components/intelligence/{RiskBadge,RiskStripeCard,ConfidenceMeter,EmptyState,DataTablePro,TimelineList,StatCard}.tsx` (+ testes de RiskBadge, ConfidenceMeter, DataTablePro no mÃ­nimo) |
| MODIFICAR | `src/index.css` (bloco `--color-astrum-*` + `--font-display` no `@theme`) |
| MODIFICAR | `index.html` (Space Grotesk â€” mesmo mecanismo de carga da Inter; auditar) |
| MODIFICAR | `src/components/layout/Sidebar.tsx` (seÃ§Ã£o nova) |
| MODIFICAR | `src/App.tsx` (rota no bloco autenticado ~l.2958; `React.lazy`) |
| MODIFICAR | `src/store/useAppStore.ts` (tab `intelligence` no `canAccess` â€” C7) |

Regras:
1. `fetchPublicFlags()` usa a MESMA base URL de `src/lib/auth-v2.ts` (C6).
   `useFeatureFlags()` = TanStack Query, `queryKey:['public-flags']`, `staleTime:60_000`,
   `retry:1`. **Fail-closed:** erro/loading â†’ `{}`. Expor `flags` e `isLoading`.
2. Sidebar â€” inserir apÃ³s "Infra & GestÃ£o", padrÃ£o exato dos headers (~l.180/227),
   funcionando colapsado E expandido (C8):
   `flags.hub && hasAccess('intelligence')` â†’ header `InteligÃªncia` + NavItem
   `label="Central de InteligÃªncia"`, `icon={<Sparkles size={24}/>}`, `shortcut="Alt+I"`.
   Flag off â†’ nem o header existe no DOM.
3. Hub: tÃ­tulo display "Central de InteligÃªncia" + subtÃ­tulo "MÃ³dulos de IA do seu
   provedor â€” ativados por ambiente." + grid (1/2/3 col) de `RiskStripeCard` a partir de
   `BRANCH_REGISTRY: {key, titulo, descricao, icone, rota}[]` filtrado pelas flags client
   (cada sessÃ£o futura adiciona sua entrada). Zero galho ativo â†’ EmptyState: Ã­cone
   Sparkles, **"Nenhum mÃ³dulo de inteligÃªncia ativo neste ambiente."** / **"Os mÃ³dulos sÃ£o
   ativados por variÃ¡vel de ambiente. Consulte o plano IA-NEXTGEN."** (sem botÃ£o â€” exceÃ§Ã£o
   RN14 registrada: ativaÃ§Ã£o Ã© operacional).
4. Contratos: `RiskBadge({level:'baixo'|'medio'|'alto'|'critico'|'sem-dado'})` = pill
   ponto colorido + TEXTO; `RiskStripeCard({risk?,children})` = Card + `border-l-4`;
   `ConfidenceMeter({value:0..1})` = barra + % mono, cor â‰¥0.8 signal / â‰¥0.6 amber / senÃ£o
   orange, `aria-valuenow`; `DataTablePro` = Table shadcn + paginaÃ§Ã£o (20/pÃ¡g default) +
   `riskAccessor?` + slot `emptyState`; `StatCard({label,value,delta?})` valor mono 32/700.
5. Nenhum hex em componente â€” sÃ³ classes de token (dark mode de graÃ§a).

### Contrato de API
`GET /api/v2/flags/public` â†’ `200 {"flags":{"hub":true, ...}}`.

### Testes
```powershell
cd apps/api; npx vitest run src/infrastructure/config/public-flags.test.ts src/domain/ia
npx vitest run src/hooks src/components/intelligence
```
public-flags: whitelist nÃ£o vaza env fora do mapa; `'true'/'TRUE '/'false'/ausente`.
useFeatureFlags: sucesso; erroâ†’`{}`. Sidebar: flag off â†’ `queryByText('Central de
InteligÃªncia')` null; on+acesso â†’ navega. RiskBadge: renderiza o TEXTO do nÃ­vel.

### CritÃ©rios de aceite
- [ ] Default (off): DOM sem a seÃ§Ã£o; zero regressÃ£o nas 27 pÃ¡ginas (smoke manual).
- [ ] On: Sidebar â†’ hub â†’ EmptyState. Print no PROGRESS_LOG (light e dark).
- [ ] `npx tsc --noEmit` (raiz e apps/api) + vitest verdes.
- [ ] AA: RiskBadge e botÃµes nos 2 temas.
**Rollback:** `INTELLIGENCE_HUB_ENABLED=false`.
**Commit:** `feat(ia11): fundaÃ§Ã£o UI â€” hub InteligÃªncia, flags pÃºblicas, tokens astrum`.

---

# âœ… IA-19 â€” Tool registry dinÃ¢mico

**Objetivo:** catÃ¡logo ÃšNICO de tools (hoje `agentTools` tem 4 defs Zod mas o executor
implementa 8 â€” 4 tools sÃ£o inalcanÃ§Ã¡veis pelo modelo, ver ApÃªndice D2) + liga/desliga por
tenant com efeito em runtime + contagem de uso, com tela de gestÃ£o.
**Flags:** `TOOL_REGISTRY_ENABLED` / client `toolreg`.

### Backend
| AÃ§Ã£o | Arquivo |
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
-- RLS nas duas: padrÃ£o 023 (policy tenant_isolation)
```

Regras:
1. **CatÃ¡logo fica em CÃ“DIGO** (Zod nÃ£o serializa; schema dinÃ¢mico em JSONB Ã© frÃ¡gil).
   O banco guarda sÃ³ `enabled` por tenant + uso. "DinÃ¢mico" = o conjunto oferecido ao
   modelo Ã© resolvido em runtime por tenant, com cache.
2. Completar `agentTools` com as 4 defs Zod faltantes (`check_coverage {cto_id?}`,
   `run_diagnostics {customer_id}`, `schedule_technical_visit {customer_id, reason,
   address?, scheduled_for?}`, `get_billing_status` como alias documentado) â€” descriÃ§Ãµes
   em pt-BR no padrÃ£o das existentes (`vercel-ai.service.ts:79-112`).
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
    infraLogger.warn({ err }, 'tool-registry indisponÃ­vel â€” fail-open (todas as tools)');
    return agentTools;                                          // RN4
  }
}
```
4. `streamWithTools(messages, systemContext, tenantId, onToolCall, opts?: { tools? })` â€”
   `tools: (opts?.tools ?? agentTools) as any` na linha 218. `nodeGenerate` chama
   `getEnabledTools(state.tenantId)` e passa.
5. `ToolsExecutor.execute`: (a) **fix D1** â€” remover o `case 'check_invoice'` duplicado
   (linha 25; mantÃ©m o alias `get_billing_status`); (b) tool desabilitada â†’ `{ error:
   'Ferramenta desativada pelo provedor' }` (defesa em profundidade: o modelo nÃ£o deveria
   nem vÃª-la); (c) fire-and-forget upsert `tool_usage_daily` (`calls+1`, `errors+1` se o
   resultado tem `error`), `.catch` com `warn`.
6. Rotas admin (auth = mesmo decorator das irmÃ£s `domain/ia/*.routes.ts`, papel admin):
   `GET /ia/tools` â†’ `[{name, description, enabled, calls7d, errors7d}]`;
   `PATCH /ia/tools/:name` body `{enabled: boolean}` â†’ upsert + `DEL toolreg:{tenantId}`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ToolsPage.tsx` (+ teste) |
| MODIFICAR | `IntelligenceHubPage.tsx` (BRANCH_REGISTRY: key `toolreg`, tÃ­tulo "Ferramentas do Agente", desc "Controle o que a IA pode fazer no seu provedor.", Ã­cone `Wrench`, rota `/intelligence/tools`) |
| MODIFICAR | `src/App.tsx` (rota `/intelligence/tools`) Â· `src/lib/i18n/pt-br.ts` |

```
â”Œ Ferramentas do Agente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ O que a IA pode executar neste provedor. AlteraÃ§Ãµes valem em   â”‚
â”‚ atÃ© 1 minuto.                                                  â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚ â”‚ Ferramenta         Uso 7d   Erros   Status               â”‚   â”‚
â”‚ â”‚ check_invoice       412      2      [Switch on]          â”‚   â”‚
â”‚ â”‚ suspend_signal       18      0      [Switch on]  âš ï¸      â”‚   â”‚
â”‚ â”‚ ...                                                      â”‚   â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```
- `DataTablePro`; colunas Uso/Erros em `font-mono`; erros>0 â†’ texto amber.
- Switch shadcn por linha. Desligar tool FINANCEIRA (`suspend_signal`) â†’ ConfirmDialog:
  tÃ­tulo **"Desativar 'Suspender sinal'?"**, corpo **"O agente deixa de conseguir
  suspender sinal de inadimplentes imediatamente. A rÃ©gua de cobranÃ§a automÃ¡tica nÃ£o Ã©
  afetada."**, botÃµes **"Desativar"** (destructive) / **"Cancelar"**. Demais tools:
  desliga direto.
- Toasts: **"Ferramenta desativada â€” vale em atÃ© 1 minuto."** / **"Ferramenta
  reativada."** Erro de rede: toast erro **"NÃ£o foi possÃ­vel salvar. Verifique sua
  conexÃ£o e tente de novo."** + Switch volta ao estado anterior (optimistic rollback).
- Loading: Skeleton de 6 linhas. Vazio: impossÃ­vel (catÃ¡logo em cÃ³digo) â€” nÃ£o tratar.

### Contrato de API
`GET /api/v2/ia/tools` â†’ `200 [{"name":"check_invoice","description":"...","enabled":true,"calls7d":412,"errors7d":2}]`
`PATCH /api/v2/ia/tools/suspend_signal` body `{"enabled":false}` â†’ `200 {"ok":true}` Â· 404 tool inexistente Â· 403 sem papel.

### Testes
Backend (`cd apps/api; npx vitest run src/infrastructure/ai/tool-registry.test.ts src/infrastructure/ai/tools.executor.test.ts src/domain/ia`):
flag off â†’ `getEnabledTools` retorna `agentTools` sem tocar Redis (spy); disabled filtra;
Redis fora â†’ fail-open; executor recusa desabilitada; contador incrementa (mock supabase);
PATCH limpa o cache. Front: Switch off dispara PATCH e rollback em erro.

### CritÃ©rios de aceite
- [ ] Flag off = `agentTools` completo (8 tools) oferecido como hoje; zero query nova.
- [ ] Flag on: desligar `check_coverage` na tela â†’ prÃ³xima mensagem o modelo nÃ£o recebe a
      def (provar por log do `streamWithTools`); executor recusa se forÃ§ado.
- [ ] As 4 tools antes inalcanÃ§Ã¡veis agora aparecem e executam (e2e staging: "agenda uma
      visita tÃ©cnica pra mim" cria `service_orders`).
- [ ] Fix D1 commitado com teste que teria pego (case duplicado).
- [ ] RN8 completo (navâ†’telaâ†’dado real; print).
**Rollback:** flags off. **Commit:** `feat(ia19): tool registry por tenant + catÃ¡logo unificado (flag off)`.

---

# âœ… IA-37 â€” Batching de tool calls

**Objetivo:** tool calls independentes do mesmo step executam em paralelo â€” hoje o loop Ã©
sequencial (`vercel-ai.service.ts:220-232`: `for â€¦ await onToolCall(...)`).
**Flags:** `TOOL_BATCHING_ENABLED` (server only â€” SEM UI prÃ³pria; RN8 cumprido com a
mÃ©trica na `AIObservabilityPage`).

### Backend
| AÃ§Ã£o | Arquivo |
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
Regras: 1. RejeiÃ§Ã£o de UMA tool nÃ£o derruba as outras (`allSettled`); a rejeitada loga
`error` e o resultado dela vira `{error:...}` para o modelo (comportamento do executor jÃ¡
Ã© retornar objeto de erro â€” exceÃ§Ã£o real sÃ³ se o prÃ³prio callback lanÃ§ar; envolver em
try/catch interno). 2. **Ordem de `toolsExecuted` fica nÃ£o-determinÃ­stica** â€” o
`nodeGenerate` jÃ¡ faz push via callback; testes que assertavam ordem passam a ordenar por
nome. 3. Teto `stepCountIs(5)` inalterado (armadilha B3).

### Testes
3 tools fake com delays 100/100/100ms â†’ flag on: total <200ms; flag off: â‰¥300ms (fake
timers). 1 rejeitada â†’ outras 2 completam e log registra `failed:1`.

### CritÃ©rios de aceite
- [ ] Flag off = byte a byte o loop atual (diff mostra sÃ³ o branch novo).
- [ ] Log `Tool batch executed` com `batchMs` em staging com flag on.
- [ ] SuÃ­te inteira de `apps/api` verde (nenhum teste dependia da ordem).
**Rollback:** flag off. **Commit:** `feat(ia37): tool calls paralelas no step (flag off)`.

---

# âœ… IA-21 â€” Constitutional classifier (nÃ³ de veto dedicado)

**Objetivo:** um segundo classificador BARATO e INDEPENDENTE do gerador veta resposta
imprÃ³pria antes do envio (categorias fixas de ISP), com fila de revisÃ£o humana. Complementa
(nÃ£o substitui) o `nodeValidate` regex e o futuro self-check da IA-01.
**Flags:** `SAFETY_CLASSIFIER_ENABLED` / client `safety`.

### Backend
| AÃ§Ã£o | Arquivo |
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
timestamptz NOT NULL DEFAULT now())` + RLS 023 + Ã­ndice `(tenant_id, review_status,
created_at DESC)`.

ServiÃ§o (decisÃ£o de modelo REGISTRADA: `gpt-4o-mini` com rubrica fixa â€” Llama-Guard-3
exigiria provider novo; medir custo/latÃªncia e reavaliar em produÃ§Ã£o):
```ts
export const SafetyVerdictSchema = z.object({
  safe: z.boolean(),
  categories: z.array(z.enum([
    'valor_ou_prazo_inventado',      // promete valor/data sem fonte no contexto
    'promessa_nao_autorizada',       // desconto/isenÃ§Ã£o/visita que a tool nÃ£o confirmou
    'dado_de_outro_cliente',         // vazamento cruzado
    'orientacao_perigosa',           // mexer em fiaÃ§Ã£o/poste etc.
    'fora_de_escopo_isp',
  ])).max(3),
});
export async function classifyResponseSafety(response: string, context: string,
  tenantId: string): Promise<SafetyVerdict> { /* generateObject, model gpt-4o-mini,
  headers Helicone UseCase 'safety-veto' (RN7), system: rubrica fixa das 5 categorias
  com 1 exemplo cada; PROMPT NO ARQUIVO, nÃ£o inline no nÃ³ */ }
```
Estado (schema + channels â€” armadilha B1): `safetyVetoed: z.boolean().optional()`,
`safetyCategories: z.array(z.string()).optional()`.
NÃ³ `nodeSafetyVeto` (short-circuit com flag off, padrÃ£o IA-01): roda o classificador
sobre `state.response` + `ragContext+dbContext`; `!safe` â†’ grava `safety_vetoes`
(fire-and-forget) e retorna `safetyVetoed:true`. Fail-open (RN4): erro â†’ `safe`.
Grafo: trocar o conditional de `validate` â€” `validate` passou â†’ `'safety_veto'`;
`addConditionalEdges('safety_veto', s => s.safetyVetoed ? 'escalate' : END)`. Veto vai
para ESCALATE (humano assume â€” nunca silÃªncio para o cliente). Se a IA-01 jÃ¡ tiver sido
executada (self_check existe), o veto entra DEPOIS do validate igualmente â€” reler o grafo
real no dia (RN9).
Rotas: `GET /ia/safety/vetoes?status=pending` Â· `PATCH /ia/safety/vetoes/:id`
body `{review_status}` Â· `GET /ia/safety/stats` (vetos/dia 14d, por categoria).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/GuardrailsPage.tsx` (+ teste) |
| MODIFICAR | hub (key `safety`, "Guardrails", "Vetos do classificador de seguranÃ§a e revisÃ£o humana.", Ã­cone `ShieldCheck`, `/intelligence/guardrails`) Â· App.tsx Â· pt-br.ts |

```
â”Œ Guardrails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ [Vetos hoje: 3] [Taxa de veto 7d: 0,8%] [Falsos positivos: 12%]â”‚  â† StatCards mono
â”‚ Pendentes de revisÃ£o                                           â”‚
â”‚ â”Œâ”€â–Œ(orange) "Sua visita estÃ¡ confirmada para amanhÃ£â€¦"        â” â”‚
â”‚ â”‚  promessa_nao_autorizada Â· hÃ¡ 2h                            â”‚ â”‚
â”‚ â”‚  [Veto correto]  [Falso positivo]                           â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€---â”˜ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```
- Lista = `RiskStripeCard` (orange) com o texto vetado (truncado 240 chars, expandir no
  clique), badges das categorias, botÃµes Secondary **"Veto correto"** / Ghost **"Falso
  positivo"**. Toasts: **"RevisÃ£o registrada."** Ambos alimentam o dataset futuro (IA-29).
- Vazio: EmptyState Ã­cone ShieldCheck, **"Nenhum veto pendente de revisÃ£o."** /
  **"O classificador estÃ¡ ativo e nenhuma resposta foi vetada recentemente."** (sem botÃ£o).
- Erro: **"NÃ£o foi possÃ­vel carregar os vetos. Recarregue a pÃ¡gina."** + botÃ£o "Recarregar".

### Contrato de API
`GET /api/v2/ia/safety/vetoes?status=pending&page=1` â†’
`200 {"items":[{"id","response_text","categories":["promessa_nao_autorizada"],"created_at"}],"total":3}`.

### Testes
ServiÃ§o: mock `ai`; resposta com promessa (fixture) â†’ `safe:false` + categoria certa;
exceÃ§Ã£o â†’ fail-open. Grafo: flag off = zero chamada (spy); veto â†’ termina em `escalate`
E cliente recebe a mensagem de escalaÃ§Ã£o (nunca a vetada). Front: botÃµes PATCH + toast.

### CritÃ©rios de aceite
- [ ] Flag off: nenhuma chamada LLM extra (spy no teste do grafo).
- [ ] Fixture "Confirmo sua visita amanhÃ£ Ã s 14h" SEM tool de agendamento no contexto â†’
      vetada, ticket de escalaÃ§Ã£o criado, linha em `safety_vetoes`.
- [ ] Custo: header Helicone `safety-veto` visÃ­vel (RN7).
- [ ] RN8 completo na tela (navâ†’dado realâ†’print).
**Rollback:** flags off. **Commit:** `feat(ia21): classificador de seguranÃ§a dedicado + fila de revisÃ£o (flag off)`.

---

# âœ… IA-16 â€” GraphRAG leve (raciocÃ­nio relacional sobre a rede fÃ­sica)

**Objetivo:** o agente responde perguntas RELACIONAIS ("se a CTO X cair, quem Ã© afetado?",
"qual CTO tem mais reincidÃªncia?") consultando o grafo redeâ†”clientesâ†”tickets em SQL â€”
SEM banco de grafo novo. Vira tool do agente + tela de consulta para ops.
**Flags:** `GRAPHRAG_ENABLED` / client `graphrag`. **Depende de:** IA-19 (catÃ¡logo).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| AUDITAR+MIGRATION | `customers` tem vÃ­nculo com `network_ctos`? (015/016 criaram as tabelas; o vÃ­nculo NÃƒO foi confirmado na auditoria). Se nÃ£o houver: `0XX_customers_cto_link.sql` â†’ `ALTER TABLE customers ADD COLUMN IF NOT EXISTS cto_id UUID REFERENCES network_ctos(id); CREATE INDEX IF NOT EXISTS idx_customers_cto ON customers(tenant_id, cto_id);` |
| CRIAR | `apps/api/src/domain/rede/network-graph.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/rede/graph.routes.ts` (+ teste) |
| MODIFICAR | `vercel-ai.service.ts` (def Zod da tool) + `tools.executor.ts` (case novo) + `public-flags.ts` |

Tool (entra pelo catÃ¡logo da IA-19):
```ts
query_network_graph: {
  description: 'Consulta o grafo da rede fÃ­sica do provedor. Use para perguntas sobre impacto de falha em CTO, reincidÃªncia de problemas por regiÃ£o ou capacidade de portas.',
  parameters: z.object({
    mode: z.enum(['impacto_cto', 'reincidencia', 'capacidade']),
    cto_id: z.string().optional().describe('ObrigatÃ³rio para impacto_cto'),
    days: z.number().min(1).max(90).default(30).describe('Janela p/ reincidencia'),
  }),
},
```
`network-graph.service.ts` â€” 3 consultas SQL nomeadas (deps injetÃ¡veis p/ teste):
`impactoCto(tenantId, ctoId)` â†’ clientes na CTO + nÂº com ticket aberto + MRR somado em
centavos (B4); `reincidencia(tenantId, days)` â†’ tickets por CTO via `customers.cto_id`,
ordenado desc, top 10; `capacidade(tenantId)` â†’ CTOs com `used_ports/total_ports > 0.85`
(reusar as colunas jÃ¡ vistas em `_checkCoverage`, `tools.executor.ts:96-111`).
Rotas: `GET /rede/graph/impacto/:ctoId` Â· `GET /rede/graph/reincidencia?days=30` Â·
`GET /rede/graph/capacidade` (auth admin, mesmas irmÃ£s).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/NetworkGraphPage.tsx` (+ teste) |
| MODIFICAR | hub (key `graphrag`, "Grafo da Rede", "Impacto de falhas, reincidÃªncia e capacidade por CTO.", Ã­cone `Network`, `/intelligence/graph`) Â· App.tsx Â· pt-br.ts |

3 abas (Tabs shadcn): **Impacto** (Select de CTO â€” carregar de `getNetworkCTOs` que JÃ
existe em `src/lib/db.ts` â€” + botÃ£o primary **"Calcular impacto"** â†’ StatCards: clientes
afetados, com ticket aberto, MRR em risco (R$ mono) + DataTablePro dos clientes) Â·
**ReincidÃªncia** (DataTablePro: CTO, tickets na janela, faixa de risco por quartil; select
de janela 7/30/90d) Â· **Capacidade** (RiskStripeCards das CTOs >85% ocupaÃ§Ã£o: "CTO Centro
â€” 15/16 portas â€” crÃ­tico"). Link Ghost por CTO: **"Ver no mapa"** â†’ `navigate('/map')`
(a MapPage existe). Vazio (Impacto sem CTO escolhida): **"Escolha uma CTO para simular o
impacto de uma falha."** Erro: padrÃ£o IA-21.

### Contrato de API
`GET /api/v2/rede/graph/impacto/:ctoId` â†’ `200 {"cto":{"id","name"},"customers_total":38,
"customers_with_open_ticket":5,"mrr_at_risk_cents":379620,"customers":[{"id","name","plan","status"}]}`.

### Testes
ServiÃ§o com deps mock: impacto soma MRR certo em CENTAVOS; reincidÃªncia ordena; capacidade
filtra >0.85. Executor: tool nova roteia. Front: aba Impacto renderiza StatCards do fixture.

### CritÃ©rios de aceite
- [ ] Pergunta no chat "se a CTO <nome> cair, quantos clientes afeta?" â†’ agente usa a tool
      e responde com o nÃºmero EXATO do SQL (e2e staging, seed conhecido).
- [ ] MRR em risco bate com `SELECT SUM(monthly_value_cents)` manual (colar no log).
- [ ] Flag off: tool fora do catÃ¡logo; tela fora do hub/DOM.
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia16): graphrag leve â€” tool de grafo de rede + tela (flag off)`.

---

# âœ… IA-14 â€” Atendimento multilÃ­ngue

**Objetivo:** cliente escreve em EN/ES â†’ agente responde no idioma dele; a busca RAG
continua funcionando (query traduzida p/ pt-BR antes do retrieval). Sem pipeline de
traduÃ§Ã£o para pt: o GPT-4o responde direto no idioma (mais barato e natural).
**Flags:** `LIVE_TRANSLATION_ENABLED` / client `translate`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/ai/language-detector.ts` (+ `.test.ts`) â€” PURO |
| MODIFICAR | `agent.state.ts` (+`detectedLanguage: z.string().optional()`) + channels (B1) |
| MODIFICAR | `agent.nodes.ts` (`nodeClassify` detecta; `nodeFetchContext` traduz query p/ RAG; `nodeGenerate` instrui idioma) |
| MODIFICAR | `public-flags.ts` (`translate`) |

Regras:
1. Detector HEURÃSTICO puro (zero custo): stopwords pt/en/es (30 por idioma, no arquivo);
   score por contagem; empate ou <2 hits â†’ `'pt'` (conservador). NUNCA LLM para detectar.
2. `nodeClassify` (flag on): `detectedLanguage = detectLanguage(state.userMessage)`;
   incluir no log existente do nÃ³.
3. `nodeFetchContext`: se `detectedLanguage !== 'pt'` e vai buscar no Qdrant â†’ traduzir a
   query com `gpt-4o-mini` (`generateObject {translated: z.string()}`, UseCase
   `rag-query-translate`, fail-open: erro â†’ query original).
4. `nodeGenerate`: sufixo no `systemContext`: `\n\nIMPORTANTE: o cliente escreveu em
   ${nome do idioma}. Responda TODO o atendimento nesse idioma.` Idioma persiste na
   resposta salva: `message.worker` jÃ¡ grava `metadata` â€” adicionar `language`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| MODIFICAR | `src/pages/AIConfigPage.tsx` (RELER INTEIRA antes â€” RN9): card "Atendimento multilÃ­ngue" com Switch + texto **"Quando ativo, a IA detecta o idioma do cliente e responde em inglÃªs ou espanhol automaticamente. PortuguÃªs continua sendo o idioma padrÃ£o."** |
| MODIFICAR | `src/pages/ChatPage.tsx` (RELER INTEIRA): badge do idioma (`EN`/`ES`, slate, com tooltip "Detectado automaticamente") no cabeÃ§alho da conversa quando `metadata.language !== 'pt'` |

SEM tela prÃ³pria no hub (RN12 cumprido via AIConfigPage, que jÃ¡ estÃ¡ no nav â€” registrar
justificativa no PROGRESS_LOG). Toast do Switch: **"Atendimento multilÃ­ngue ativado."**

### Testes
Detector: 12 fixtures (4 por idioma, incluindo "hi, my internet is down" e "hola no tengo
internet"), curtas â†’ 'pt'. Grafo: flag on + msg EN â†’ `systemContext` contÃ©m a instruÃ§Ã£o e
busca usou query traduzida (spy no HybridSearchService mock); flag off â†’ zero mudanÃ§a.

### CritÃ©rios de aceite
- [ ] "My internet is not working since yesterday" â†’ resposta 100% em inglÃªs (e2e staging,
      print da conversa).
- [ ] Query RAG traduzida logada (UseCase `rag-query-translate` no Helicone).
- [ ] Flag off: nenhum campo novo em uso, nenhuma chamada extra.
**Rollback:** flags off. **Commit:** `feat(ia14): atendimento multilÃ­ngue com RAG traduzido (flag off)`.

---

# âœ… IA-30 â€” CompressÃ£o de contexto RAG

**Objetivo:** cortar â‰¥30% dos tokens de contexto sem perder resposta: dedupe de sentenÃ§as
entre chunks + orÃ§amento de tokens por seÃ§Ã£o. LLMLingua Ã© Python â€” fase TS primeiro
(determinÃ­stica, grÃ¡tis); reavaliar LLMLingua na Fase 2 se o ganho estagnar.
**Flags:** `PROMPT_COMPRESSION_ENABLED` (server; client `compression` sÃ³ p/ o StatCard).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/rag/context-compressor.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `packages/db/src/migrations/0XX_context_savings.sql` â†’ `ALTER TABLE ai_performance_logs ADD COLUMN IF NOT EXISTS context_tokens_saved INTEGER;` |
| MODIFICAR | `agent.nodes.ts` (`nodeGenerate` comprime `systemContext` antes do stream) |
| MODIFICAR | `public-flags.ts` |

```ts
// context-compressor.ts â€” reusar estimateTokens (exportar de context-window.service.ts,
// hoje Ã© funÃ§Ã£o interna na linha 30 â€” export nomeado, sem mudar comportamento)
export interface CompressionResult { text: string; tokensBefore: number; tokensAfter: number; }
export function compressContext(sections: { label: string; text: string; budgetTokens: number }[],
): CompressionResult {
  // 1. Por seÃ§Ã£o: split em sentenÃ§as (regex /(?<=[.!?â€¦])\s+/), normalizar
  //    (lowercase+trim+colapsar espaÃ§os), dedupe global via Set â€” a MESMA sentenÃ§a vinda
  //    de 2 chunks do RAG entra 1x (mantÃ©m a 1Âª ocorrÃªncia, ordem preservada).
  // 2. Truncar cada seÃ§Ã£o ao budget (corte em fronteira de sentenÃ§a, nunca no meio).
  // 3. Montar com os labels originais. Retornar contagens.
}
```
Budgets default (constantes exportadas): RAG 2000 Â· DB 500 Â· Zep 500 tokens.
`nodeGenerate`: flag on â†’ montar as 3 seÃ§Ãµes (jÃ¡ existem como `ragContext/dbContext/
zepContext`, linhas 222-226 de agent.nodes.ts) via compressor; logar
`{tokensBefore, tokensAfter, savedPct}`; somar `tokensSaved` no registro de custo da
IA-34 quando ela existir (campo `context_tokens_saved`).

### Frontend
MODIFICAR `src/pages/AICostsPage.tsx` (RELER INTEIRA â€” ela lÃª `ai_performance_logs`
direto do supabase client): StatCard **"Economia por compressÃ£o"** = soma de
`context_tokens_saved` no perÃ­odo Ã— preÃ§o mÃ©dio de input do 4o (usar o `MODEL_COSTS`
local da pÃ¡gina, linha 23) â€” formato "1,2M tokens Â· ~$6,10". Tooltip: **"Tokens de
contexto removidos por deduplicaÃ§Ã£o antes de chamar o modelo."** Sem tela prÃ³pria (RN12
via AICostsPage; justificar no log).

### Testes
Compressor: dedupe entre seÃ§Ãµes preserva 1Âª ocorrÃªncia; corte respeita fronteira de
sentenÃ§a; budget 0 â†’ seÃ§Ã£o vazia; texto menor que budget â†’ intacto (tokensBefore==After).
Grafo: flag off â†’ `systemContext` idÃªntico ao atual (snapshot test).

### CritÃ©rios de aceite
- [ ] Corpus de 20 queries reais de staging: mÃ©dia de economia â‰¥30% COM pass-rate do eval
      (IA-03, se jÃ¡ executada; senÃ£o 10 respostas comparadas manualmente) estÃ¡vel â€”
      relatÃ³rio no PROGRESS_LOG.
- [ ] Flag off = contexto byte a byte igual (snapshot).
- [ ] StatCard com dado real na AICostsPage (print).
**Rollback:** flag off. **Commit:** `feat(ia30): compressÃ£o determinÃ­stica de contexto RAG (flag off)`.

---

# âœ… IA-27 â€” Feature Store leve

**Objetivo:** UMA fonte de features por entidade (cliente) para todo ML do produto â€”
treino e serving leem o mesmo valor. Sem Feast: tabela + registry TS tipado + worker
noturno. A IA-07 (churn, Parte 1) DEVE consumir daqui quando executar (nota cruzada:
ao executar IA-07, verificar se esta sessÃ£o jÃ¡ rodou e usar `feature-store.service` no
lugar de SQL prÃ³prio â€” registrar no PROGRESS_LOG de lÃ¡).
**Flags:** `FEATURE_STORE_ENABLED` / client `features`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_feature_store.sql` |
| CRIAR | `apps/api/src/domain/ml/feature-registry.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ml/feature-store.service.ts` (+ `.test.ts`) |
| CRIAR | `packages/queue/src/workers/feature-store.worker.ts` (padrÃ£o dos irmÃ£os: imports relativos, `setupDLQ`, `addSentryToWorker` â€” copiar de `cobrai.worker.ts`; cron `0 2 * * *` America/Sao_Paulo; boot atrÃ¡s da flag, log padrÃ£o engine-flags) |
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
-- RLS padrÃ£o 023 + Ã­ndice (tenant_id, feature, computed_at DESC)
```
Registry (features iniciais, TODAS computÃ¡veis com dados de HOJE):
```ts
export const FEATURE_DEFS = [
  { name: 'tenure_days',            entity: 'customer', ttlHours: 24,
    describe: 'Dias desde o cadastro do cliente' },
  { name: 'overdue_count_90d',      entity: 'customer', ttlHours: 24,
    describe: 'Faturas vencidas nos Ãºltimos 90 dias' },
  { name: 'tickets_90d',            entity: 'customer', ttlHours: 24,
    describe: 'Tickets abertos nos Ãºltimos 90 dias' },
  { name: 'mrr_cents',              entity: 'customer', ttlHours: 24,
    describe: 'Mensalidade em centavos' },                       // B4
] as const;
```
`feature-store.service.ts`: `computeAllForTenant(tenantId)` â€” 1 query agregada por
feature (nÃ£o N+1 por cliente!) com upsert em lote de 500; `getFeatures(tenantId,
customerId): Promise<Record<string, number|string>>` p/ serving; `getFreshness(tenantId)`
p/ a tela. Rota: `GET /ia/features` â†’ catÃ¡logo + freshness + contagem de entidades.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/FeaturesPage.tsx` (+ teste) |
| MODIFICAR | hub (key `features`, "CatÃ¡logo de Features", "As variÃ¡veis que alimentam os modelos preditivos.", Ã­cone `Database`, `/intelligence/features`) Â· App.tsx Â· pt-br.ts |

`DataTablePro` read-only: Feature (mono) Â· DescriÃ§Ã£o Â· Entidades (mono) Â· Atualizada
(relativo, `date-fns` jÃ¡ Ã© dep; >24h â†’ texto amber + RiskBadge mÃ©dio "desatualizada") Â·
TTL. Vazio (worker nunca rodou): EmptyState **"Nenhuma feature computada ainda."** /
**"O cÃ¡lculo roda toda noite Ã s 02h. VocÃª tambÃ©m pode aguardar a primeira execuÃ§Ã£o do
worker."** (sem botÃ£o de forÃ§ar no MVP â€” operaÃ§Ã£o Ã© via fila).

### Contrato de API
`GET /api/v2/ia/features` â†’ `200 [{"name":"tenure_days","describe":"...","entities":812,
"computed_at":"2026-07-05T02:00:11Z","ttl_hours":24}]`.

### Testes
Registry: nomes Ãºnicos (teste que quebra se alguÃ©m duplicar). Service: upsert idempotente
(rodar 2x nÃ£o muda contagem); `getFeatures` retorna mapa completo; freshness. Worker:
tenant com 3 clientes seed â†’ 12 linhas (4 features Ã— 3).

### CritÃ©rios de aceite
- [ ] Worker roda 1 tenant staging: `SELECT count(*) FROM feature_values` = clientes Ã—
      features (colar no log). ReexecuÃ§Ã£o idÃªntica (idempotÃªncia).
- [ ] `getFeatures` responde <50ms p/ 1 cliente (Ã© 1 PK lookup).
- [ ] RN8 na tela (freshness real; print).
**Rollback:** flags off (worker nÃ£o sobe). **Commit:** `feat(ia27): feature store leve + catÃ¡logo (flag off)`.

---

# âœ… IA-26 â€” Multi-armed bandit nas mensagens de cobranÃ§a (CobrAI v2)

**Objetivo:** em vez de template fixo por rÃ©gua, variantes de mensagem competem via
Thompson sampling; conversÃ£o = pagamento em â‰¤7 dias. **Honestidade R6:** isso instrumenta
o worker V2 (`packages/queue/src/workers/cobrai.worker.ts`); dados reais sÃ³ fluem apÃ³s o
cutover `COBRAI_ENGINE=v2` (S76). ConstrÃ³i-se e testa-se agora; liga-se depois.
**Flags:** `BANDIT_ENABLED` / client `bandit`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_campaign_variants.sql` |
| CRIAR | `apps/api/src/domain/cobranca/bandit.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `apps/api/src/domain/cobranca/variant-picker.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/campaigns.routes.ts` (+ teste) |
| MODIFICAR | `packages/queue/src/workers/cobrai.worker.ts` (RELER INTEIRO â€” RN9: achar o ponto onde o template da regra vira mensagem; o serviÃ§o de regras usa `interpolateTemplate` de `cobrai-rules.service.ts:20-27`) |
| MODIFICAR | `public-flags.ts` |

Migration:
```sql
CREATE TABLE IF NOT EXISTS campaign_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,        -- ex.: 'overdue_d3' (regra da rÃ©gua)
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
-- RLS 023 nas duas + Ã­ndice variant_sends (tenant_id, outcome) WHERE outcome IS NULL
```
`bandit.ts` â€” puro, com RNG injetÃ¡vel p/ teste determinÃ­stico:
```ts
/** Amostra Gamma(shape,1) â€” Marsaglia & Tsang (2000); shape>=1 aqui pois alpha,beta>=1 */
export function sampleGamma(shape: number, rng: () => number): number { /* d=shape-1/3;
  c=1/sqrt(9d); loop: x=normal(rng) via Box-Muller, v=(1+c*x)^3, aceita se
  ln(u) < 0.5xÂ²+d-dv+d*ln(v) */ }
export function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const a = sampleGamma(alpha, rng), b = sampleGamma(beta, rng); return a / (a + b);
}
export function pickVariant(vs: {id: string; alpha: number; beta: number}[],
  rng: () => number = Math.random): string {
  return vs.map(v => ({ id: v.id, s: sampleBeta(v.alpha, v.beta, rng) }))
           .sort((x, y) => y.s - x.s)[0].id;
}
```
Regras: 1. Picker no worker (flag on + variantes ativas â‰¥2 para a `campaign_key`; senÃ£o
template da regra, comportamento atual intacto). Grava `variant_sends`. 2. Recompensa:
job diÃ¡rio reprocessa `variant_sends` com `outcome IS NULL`: fatura paga â‰¤7d do envio â†’
`alpha+1, outcome='paid'`; >7d â†’ `beta+1, outcome='expired'`. Fatura CANCELADA nÃ£o conta
(nem alpha nem beta â€” outcome 'expired' com nota). 3. Pausar variante â†’ sai do sorteio na
hora. 4. Rotas: `GET /ia/campaigns` (variantes + taxa + IC) Â· `PATCH
/ia/campaigns/variants/:id` `{status}` Â· `POST /ia/campaigns/variants` (criar variante).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/CampaignsPage.tsx` (+ teste) |
| MODIFICAR | hub (key `bandit`, "Campanhas Inteligentes", "Variantes de mensagem de cobranÃ§a competindo por conversÃ£o.", Ã­cone `Target`, `/intelligence/campaigns`) Â· App.tsx Â· pt-br.ts |

Por campanha (Card): BarChart Recharts â€” conversÃ£o por variante (barras em fiber; a lÃ­der
em signal) + tabela: Variante Â· Template (truncado, tooltip completo) Â· Envios (mono) Â·
ConversÃ£o % (mono) Â· Status. BotÃ£o Ghost por linha **"Pausar"** â†’ ConfirmDialog
**"Pausar a variante B?"** / **"Ela sai do sorteio imediatamente. Os envios jÃ¡ feitos
continuam contando conversÃ£o."** â†’ toast **"Variante pausada â€” trÃ¡fego realocado."**
BotÃ£o Secondary **"Nova variante"** â†’ Dialog com textarea do template + hint das
variÃ¡veis `{{nome}} {{valor}} {{vencimento}} {{link}}` (conferir as vars REAIS usadas
pelos templates do tenant ao reler o worker). Badge por campanha: **"explorando"**
(slate) se IC das variantes se sobrepÃµe, **"convergiu"** (signal) senÃ£o (IC 95% beta:
aproximaÃ§Ã£o normal estÃ¡ OK no MVP). Vazio: **"Nenhuma campanha com variantes ainda."** /
botÃ£o primary **"Criar primeira variante"**.

### Testes
`bandit.ts` com RNG seedado: `sampleBeta(90,10)` mÃ©dio â‰ˆ0.9 (Â±0.05 em 2000 amostras);
`pickVariant` converge â€” simulaÃ§Ã£o 1000 rodadas, variante com p=0.3 vs 0.1 recebe >70%
do trÃ¡fego na metade final. Picker: flag off â†’ template da regra (spy). Recompensa:
paga em 5d â†’ alpha+1; 8d â†’ beta+1; cancelada â†’ nÃ£o conta.

### CritÃ©rios de aceite
- [ ] Flag off: worker v2 byte a byte como antes (teste).
- [ ] SimulaÃ§Ã£o sintÃ©tica documentada no PROGRESS_LOG (convergÃªncia provada).
- [ ] R6 intacto: NENHUMA linha tocada em `/src` (grep no diff).
- [ ] RN8 na tela com dados da simulaÃ§Ã£o em staging.
**Rollback:** flags off. **Commit:** `feat(ia26): thompson sampling nas mensagens CobrAI v2 (flag off)`.

---

# âœ… IA-33 â€” Drift detection

**Objetivo:** alerta quando a distribuiÃ§Ã£o de intents/sentimentos muda vs baseline (PSI)
â€” modelo degradando ou clientela mudando. Requer persistir contagens (hoje o intent sÃ³
vai pro log â€” gap real).
**Flags:** `DRIFT_DETECTION_ENABLED` / client `drift`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_drift.sql` |
| CRIAR | `apps/api/src/domain/ml/psi.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `packages/queue/src/workers/drift.worker.ts` (cron `0 4 * * *`, padrÃ£o irmÃ£os) |
| CRIAR | `apps/api/src/domain/ia/drift.routes.ts` (+ teste) |
| MODIFICAR | `agent.nodes.ts` (`nodeClassify`: upsert fire-and-forget em `ai_intent_daily`) |
| MODIFICAR | `public-flags.ts` |

Migration: `ai_intent_daily(tenant_id uuid NOT NULL, day date NOT NULL, intent text NOT
NULL, sentiment text, count integer NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, day,
intent, COALESCE(sentiment,''))` â€” atenÃ§Ã£o: PK com COALESCE exige Ã­ndice Ãºnico de
expressÃ£o, nÃ£o PK; usar `UNIQUE INDEX`) + `drift_reports(id uuid pk, tenant_id, metric
text, psi numeric, severity text CHECK (severity IN ('ok','medio','alto')), details
jsonb, created_at timestamptz default now())` + RLS 023.
```ts
// psi.ts
export function psi(expected: Record<string, number>, actual: Record<string, number>): number {
  // uniÃ£o de categorias; proporÃ§Ãµes com suavizaÃ§Ã£o epsilon=1e-4 (categoria ausente nÃ£o
  // explode o ln); PSI = Î£ (pA - pE) * ln(pA/pE)
}
export function psiSeverity(v: number): 'ok'|'medio'|'alto' {
  return v < 0.1 ? 'ok' : v < 0.25 ? 'medio' : 'alto';   // cortes clÃ¡ssicos de PSI
}
```
Worker: por tenant, `actual` = Ãºltimos 7d de `ai_intent_daily`, `expected` = 28d
anteriores; PSI de intents e de sentimentos; grava `drift_reports`; severity â‰  ok â†’ tambÃ©m
cria notificaÃ§Ã£o (reusar o mecanismo de `notifications` â€” tabela existe desde a 016;
auditar o insert padrÃ£o). Rotas: `GET /ia/drift/reports?days=30` Â· `GET /ia/drift/current`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/DriftPage.tsx` (+ teste) |
| MODIFICAR | hub (key `drift`, "Drift do Modelo", "A conversa dos clientes mudou? O modelo continua calibrado?", Ã­cone `Activity`, `/intelligence/drift`) Â· App.tsx Â· pt-br.ts |

Topo: 2 `RiskStripeCard` (Intents / Sentimentos) com PSI atual (mono, 3 casas) +
RiskBadge (`ok`â†’baixo, `medio`â†’mÃ©dio, `alto`â†’alto). Meio: BarChart agrupado â€”
distribuiÃ§Ã£o 7d Ã— baseline 28d por intent (7d em fiber, baseline em slate 40%). Base:
LineChart do PSI diÃ¡rio 30d com linhas de corte 0.1/0.25 tracejadas. Vazio (menos de 7d
de dados): **"Coletando a linha de base."** / **"O primeiro relatÃ³rio de drift sai com 7
dias de conversas classificadas."** Erro: padrÃ£o.

### Testes
psi: distribuiÃ§Ãµes idÃªnticas â†’ 0; categoria nova com 20% â†’ >0.1; suavizaÃ§Ã£o nÃ£o explode
com categoria ausente; severity nos cortes exatos (0.1/0.25). Worker: fixture 7d vs 28d
gera report coerente. nodeClassify: flag on grava contagem (mock), flag off nÃ£o.

### CritÃ©rios de aceite
- [ ] Deslocamento sintÃ©tico (injetar 7d com 40% `cancel_service` vs baseline 5%) â†’
      report `alto` + notificaÃ§Ã£o criada (staging, colar query no log).
- [ ] Flag off: zero write novo no nodeClassify (spy).
- [ ] RN8 na tela.
**Rollback:** flags off. **Commit:** `feat(ia33): drift PSI de intents/sentimento + painel (flag off)`.

---

# âœ… IA-34 â€” Cost attribution por cliente e feature

**Objetivo:** de "gastamos $X" para "gastamos $X com o cliente Y na feature Z".
A base JÃ existe (migration 028: `tokens_in/out, model, cost_usd` em
`ai_performance_logs`; `AICostsPage` lÃª e calcula) â€” faltam as dimensÃµes e o plumbing.
**Flags:** server nenhuma nova (gravaÃ§Ã£o extra Ã© inÃ³cua) / client `costdrill` (abas novas).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_ai_costs_dimensions.sql` â†’ `ALTER TABLE ai_performance_logs ADD COLUMN IF NOT EXISTS customer_id UUID, ADD COLUMN IF NOT EXISTS conversation_id UUID, ADD COLUMN IF NOT EXISTS use_case TEXT; CREATE INDEX IF NOT EXISTS idx_aiperf_customer ON ai_performance_logs (tenant_id, customer_id, created_at);` |
| CRIAR | `apps/api/src/infrastructure/observability/cost-recorder.ts` (+ `.test.ts`) |
| MODIFICAR | `langgraph.service.ts` (`processMessage` grava 1 linha agregada por mensagem) |
| MODIFICAR | `agent.nodes.ts` (`nodeGenerate`: capturar usage â€” hoje `state.tokensUsed` fica 0 SEMPRE, ver D4) |
| MODIFICAR | `public-flags.ts` (`costdrill`) |

Regras:
1. **Fix D4:** no `nodeGenerate`, apÃ³s consumir o stream: `const usage = await
   streamResult.usage;` (AI SDK v6 expÃµe promise de usage no resultado do `streamText` â€”
   confirmar o nome exato do campo na versÃ£o instalada ANTES de codar; se indisponÃ­vel,
   estimar com `estimateTokens` e marcar `estimated:true`). Retornar
   `tokensUsed: usage.totalTokens` no patch do nÃ³.
2. `cost-recorder.ts`: `recordMessageCost({tenantId, customerId, conversationId, model,
   tokensIn, tokensOut, useCase})` â†’ `cost_usd` calculado com TABELA DE PREÃ‡O ÃšNICA
   server-side (constante exportada `MODEL_PRICING` â€” os valores hoje vivem duplicados no
   client, `AICostsPage.tsx:23-30`; o server passa a ser a fonte; a pÃ¡gina migra a ler
   `cost_usd` gravado em vez de recalcular). Fire-and-forget + fail-open.
3. `processMessage` (linhas 127-154): apÃ³s `finalState`, gravar com
   `use_case='agent_response'`. Chamadas avulsas (classify etc.) continuam via Helicone;
   atribuiÃ§Ã£o fina por nÃ³ fica para quando IA-32 (OTel) existir â€” escopo honesto.

### Frontend
MODIFICAR `src/pages/AICostsPage.tsx` (RELER INTEIRA â€” RN9): adicionar Tabs **"VisÃ£o
geral"** (o conteÃºdo atual, intacto) / **"Por cliente"** / **"Por feature"** â€” as 2 novas
sÃ³ renderizam com flag client `costdrill`.
- Por cliente: `DataTablePro` â€” Cliente Â· Conversas (mono) Â· Tokens (mono) Â· Custo $
  (mono) Â· % do total (barra inline fiber). Ordenado por custo desc. Drill-down `Sheet`:
  conversas do cliente com custo cada, link para a conversa no ChatPage.
- Por feature: mesma tabela por `use_case` (`agent_response`, `classify-intent`, ... â€”
  os UseCases jÃ¡ padronizados pela RN7).
- Vazio (colunas novas ainda sem dado): **"Sem dados de atribuiÃ§Ã£o ainda."** / **"Os
  custos passam a ser atribuÃ­dos por cliente a partir da ativaÃ§Ã£o desta versÃ£o â€” os
  dados antigos nÃ£o sÃ£o reprocessados."**

### Testes
cost-recorder: preÃ§o certo por modelo (fixture 4o e 4o-mini, 6 casas); falha de insert
nÃ£o propaga. processMessage: grava com os IDs do estado (mock). Front: soma da coluna
% = 100 Â± arredondamento (teste da funÃ§Ã£o de agregaÃ§Ã£o, extraÃ­da pura).

### CritÃ©rios de aceite
- [ ] 10 mensagens e2e em staging â†’ 10 linhas com `customer_id`/`use_case` preenchidos e
      `cost_usd > 0` (colar SELECT no log).
- [ ] Soma do drill-down = total do perÃ­odo (consistÃªncia, teste + verificaÃ§Ã£o manual).
- [ ] D4 corrigido: `tokensUsed` real no retorno do grafo (era sempre 0).
- [ ] Aba antiga intacta sem a flag client.
**Rollback:** flag client off (server continua gravando â€” inÃ³cuo e Ãºtil).
**Commit:** `feat(ia34): atribuiÃ§Ã£o de custo por cliente/feature + fix tokensUsed`.

---

# âœ… IA-43 â€” Failover multi-provider (port do `src/ai-provider/`)

**Objetivo:** OpenAI caiu â†’ Anthropic/Gemini assumem. **R3 manda PORTAR** a lÃ³gica que jÃ¡
existe (`src/ai-provider/`: `ai-provider.service.ts`, `types.ts`, adapters
openai/anthropic/gemini) â€” decisÃ£o de port registrada: a POLÃTICA (ordem, classificaÃ§Ã£o
de erro retryÃ¡vel, circuito) Ã© portada; os CLIENTES viram providers do AI SDK
(`@ai-sdk/anthropic`, `@ai-sdk/google` â€” instalar) porque o motor novo Ã© 100% AI SDK.
Reimplementar a polÃ­tica do zero = violaÃ§Ã£o de R3.
**Flags:** `PROVIDER_FAILOVER_ENABLED` / client `failover`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| AUDITAR | `src/ai-provider/ai-provider.service.ts` + `types.ts` INTEIROS (RN9) â€” extrair: ordem de fallback, classificaÃ§Ã£o de erros, timeouts |
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
};   // âš ï¸ conferir IDs vigentes dos 3 na doc oficial NO DIA (nomes mudam)
export function getModel(tier: Tier): LanguageModel { /* flag off â†’ openai direto (hoje);
  flag on â†’ 1Âº provider da ordem com circuito FECHADO e key presente */ }
export async function withFailover<T>(tier: Tier, fn: (m: LanguageModel) => Promise<T>): Promise<T> {
  /* tenta na ordem; erro retryÃ¡vel (5xx/timeout/rate-limit â€” classificaÃ§Ã£o PORTADA do
     legado) â†’ abre circuito opossum (reusar circuit-breaker.config.ts de adapters/openai)
     e tenta o prÃ³ximo; erro nÃ£o-retryÃ¡vel (4xx de conteÃºdo) propaga.
     Streaming: failover SÃ“ antes do 1Âº token (depois, aborta e propaga â€” honesto). */
}
```
`generateObject`/`generateText` do `vercel-ai.service` passam por `withFailover`;
`streamWithTools` usa `getModel('full')` (failover prÃ©-stream). Log obrigatÃ³rio:
`{event:'provider_failover', from, to, reason, tenantId}`.
Rota: `GET /ia/providers/status` â†’ por provider: key presente, circuito
(aberto/fechado/meio-aberto via opossum stats), latÃªncia mÃ©dia 24h (Redis rolling).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| MODIFICAR | `src/pages/AIObservabilityPage.tsx` (RELER INTEIRA): seÃ§Ã£o "Providers" â€” 3 Cards: nome, RiskBadge (fechado=baixo "operando" / meio-aberto=mÃ©dio "instÃ¡vel" / aberto=crÃ­tico "fora"), latÃªncia mÃ©dia (mono), "sem chave" (slate) quando nÃ£o configurado. Polling 30s (TanStack Query refetchInterval) |
| MODIFICAR | `src/pages/AIConfigPage.tsx`: card "Ordem de fallback" â€” lista arrastÃ¡vel (`@hello-pangea/dnd`, jÃ¡ Ã© dep) das 3 providers; persistir em config do tenant SÃ“ se jÃ¡ existir mecanismo de config por tenant na pÃ¡gina (auditar); senÃ£o exibir a ordem da env como read-only com nota **"Definida pelo ambiente (PROVIDER_ORDER)."** â€” nÃ£o inventar tabela de config nova nesta sessÃ£o |

### Testes
model-router: flag off â†’ sempre openai; ordem respeitada; key ausente pula; circuito
aberto pula; erro nÃ£o-retryÃ¡vel NÃƒO faz failover; classificaÃ§Ã£o de erro portada (casos do
legado reproduzidos como fixtures). Rota de status: shape estÃ¡vel.

### CritÃ©rios de aceite
- [ ] Staging com `OPENAI_API_KEY` invÃ¡lida de propÃ³sito + flag on â†’ mensagem respondida
      pela Anthropic; log `provider_failover` + badge crÃ­tico no painel (prints).
- [ ] Flag off: zero mudanÃ§a de comportamento (openai direto).
- [ ] Diff mostra a polÃ­tica PORTADA (comentÃ¡rios citando o arquivo legado de origem) â€”
      R3 auditÃ¡vel.
**Rollback:** flag off. **Commit:** `feat(ia43): failover multi-provider portado do ai-provider legado (flag off)`.

---

# âœ… IA-44 â€” Sandbox SQL do agente (somente leitura, defesa dupla)

**Objetivo:** consultas analÃ­ticas com seguranÃ§a fÃ­sica: role Postgres read-only +
validaÃ§Ã£o de AST â€” nunca "confiar no prompt". Console super-admin prova o sandbox; expor
como tool do agente Ã© decisÃ£o FUTURA (Fase 2, com o registry IA-19 maduro).
**Flags:** `AGENT_SANDBOX_ENABLED` / client `sandbox`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_agent_readonly_role.sql` |
| CRIAR | `apps/api/src/infrastructure/sandbox/sql-guard.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `apps/api/src/infrastructure/sandbox/sandbox-db.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/sandbox.routes.ts` (+ teste) |
| MODIFICAR | `env.validator.ts` (`SANDBOX_DB_URL?`) + `public-flags.ts` |

Migration (idempotente com `DO $$ ... IF NOT EXISTS`):
```sql
-- role sem login direto em prod supabase? CONFIRMAR: no Supabase, criar role e GRANT Ã©
-- permitido via SQL; a connection string do sandbox usa um usuÃ¡rio dedicado (criar no
-- painel/CLI e documentar no README da migration â€” a migration cria role+grants).
CREATE ROLE agent_readonly NOLOGIN;  -- guard IF NOT EXISTS via DO-block
CREATE OR REPLACE VIEW vw_agent_customers AS
  SELECT id, tenant_id, plan, status, created_at FROM customers;      -- SEM nome/cpf/endereÃ§o (LGPD)
CREATE OR REPLACE VIEW vw_agent_invoices AS
  SELECT id, tenant_id, customer_id, amount_cents, status, due_date, paid_at FROM invoices;
CREATE OR REPLACE VIEW vw_agent_tickets AS
  SELECT id, tenant_id, customer_id, category, priority, status, created_at FROM tickets;
GRANT SELECT ON vw_agent_customers, vw_agent_invoices, vw_agent_tickets TO agent_readonly;
ALTER ROLE agent_readonly SET statement_timeout = '3s';
ALTER ROLE agent_readonly SET default_transaction_read_only = on;
```
`sql-guard.ts`: parser `pgsql-ast-parser` (instalar; Ã© TS puro) â€” aceita SOMENTE
1 statement `SELECT`; recusa CTE com DML, `SELECT ... INTO`, funÃ§Ãµes na denylist
(`pg_sleep`, `pg_read_file`, `dblink`, `lo_*`); recusa tabela fora da allowlist
(`vw_agent_*`); injeta `LIMIT 500` se ausente; injeta filtro `tenant_id = $1` se a view
tem a coluna e o WHERE nÃ£o filtra (defesa 3). `sandbox-db.service.ts`: Pool `pg` (dep jÃ¡
existe) com `SANDBOX_DB_URL`, `statement_timeout` tambÃ©m na connection.
Rota: `POST /ia/sandbox/query` body `{sql}` â€” **super_admin apenas** (mesmo padrÃ£o de
verificaÃ§Ã£o do Sidebar: role da tabela `users`); resposta `{columns, rows, ms}` ou
`{error, hint}`. Toda execuÃ§Ã£o logada (`sandbox_queries` â€” tabela simples na mesma
migration, com sql, user, ms, rows).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/SandboxPage.tsx` (+ teste) |
| MODIFICAR | hub (key `sandbox`, "Sandbox SQL", "Console analÃ­tico somente leitura, com histÃ³rico auditado.", Ã­cone `Terminal`, `/intelligence/sandbox` â€” card sÃ³ aparece se flag E super_admin) Â· App.tsx Â· pt-br.ts |

Editor: textarea `font-mono` (sem lib de editor no MVP), hint fixo: **"Somente SELECT
sobre vw_agent_customers, vw_agent_invoices, vw_agent_tickets. Limite 500 linhas, 3s."**
BotÃ£o primary **"Executar consulta"** (loading trava largura) Â· resultado em
`DataTablePro` + tempo (mono) Â· erro do guard em card vermelho com a `hint` (ex.:
**"UPDATE nÃ£o Ã© permitido â€” o sandbox Ã© somente leitura."**) Â· histÃ³rico (Ãºltimas 20,
clique recarrega no editor). Duplo gate no client: flag + `isSuperAdmin` (mesma checagem
do Sidebar, `Sidebar.tsx:92-106`).

### Testes
sql-guard (a suÃ­te MAIS importante da sessÃ£o): `UPDATE`/`DELETE`/`DROP`/`INSERT` â†’
recusa; `WITH x AS (DELETE ...) SELECT` â†’ recusa; `SELECT pg_sleep(10)` â†’ recusa;
`SELECT * FROM customers` (tabela real, fora da allowlist) â†’ recusa; `SELECT * FROM
vw_agent_invoices` â†’ aceita com LIMIT injetado; multi-statement `SELECT 1; DROP ...` â†’
recusa. Service: timeout dispara em query lenta (staging). Rota: papel comum â†’ 403.

### CritÃ©rios de aceite
- [ ] Defesa DUPLA provada em staging: guard desligado Ã  forÃ§a (teste interno) e
      `UPDATE` ainda falha pela role (`ERROR: cannot execute UPDATE in a read-only
      transaction`) â€” colar as duas saÃ­das no log.
- [ ] View sem PII: `SELECT * FROM vw_agent_customers` nÃ£o tem nome/CPF (print).
- [ ] RN8 no console (query real, resultado real, print).
**Rollback:** flags off. **Commit:** `feat(ia44): sandbox SQL read-only com defesa dupla (flag off)`.

---

# âœ… IA-45 â€” Synthetic data generator

**Objetivo:** dataset sintÃ©tico de conversas/tickets p/ load test e eval â€” gerado via
Batch API (50% desconto, `batch.service.ts` jÃ¡ implementa o fluxo JSONLâ†’uploadâ†’poll),
gravado SÃ“ em tenant sandbox.
**Flags:** `SYNTH_DATA_ENABLED` / client `synthdata` (card do hub sÃ³ p/ super_admin).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_tenant_sandbox_flag.sql` â†’ `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE;` |
| CRIAR | `apps/api/src/domain/ia/synthetic-generator.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/synthetic.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` |

Regras:
1. **Guarda dupla:** service E rota verificam `tenants.is_sandbox === true` â€” senÃ£o
   `403 {error: 'GeraÃ§Ã£o sintÃ©tica sÃ³ Ã© permitida em tenants de teste.'}`. NUNCA flag
   client como Ãºnica barreira.
2. Params: `{conversations: 1..2000, intentMix: Record<intent, pct> (soma 100),
   mediaPct: 0..30}`. Prompt de geraÃ§Ã£o: personas de cliente de ISP BR (nomes FICTÃCIOS
   â€” instruir o modelo a nunca gerar CPF vÃ¡lido), 2-6 turnos por conversa, saÃ­da JSON
   por linha (schema zod validado na volta; linha invÃ¡lida = descartada e contada).
3. Fluxo: montar JSONL â†’ `batch.service.ts` (reusar upload/poll â€” RELER o arquivo alÃ©m
   da linha 60 auditada para usar as funÃ§Ãµes reais) â†’ parse â†’ inserts em lote
   (`conversations`, `messages`, `tickets` com `created_by:'synthetic'`).
4. Rotas: `POST /ia/synthetic/generate` â†’ `202 {job_id}` Â· `GET /ia/synthetic/jobs/:id`
   â†’ `{status: 'queued'|'generating'|'inserting'|'done'|'failed', generated, discarded}`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/SyntheticPage.tsx` (+ teste) |
| MODIFICAR | hub (key `synthdata`, "Dados SintÃ©ticos", "Gere conversas de teste para load e avaliaÃ§Ã£o.", Ã­cone `FlaskConical`, `/intelligence/synthetic`) Â· App.tsx Â· pt-br.ts |

Aviso permanente no topo (card amber): **"DisponÃ­vel apenas em tenants de teste. Os dados
gerados sÃ£o fictÃ­cios e marcados como sintÃ©ticos."** Form: slider Conversas (25 passos) Â·
sliders do mix por intent (soma trava em 100, mostrar restante) Â· slider % mÃ­dia Â· botÃ£o
primary **"Gerar dataset"** â†’ vira barra de progresso com fase (**"Gerando com a Batch
API â€” isso pode levar atÃ© 24h; pode fechar a pÃ¡gina."**) via polling 30s. Done â†’ toast
**"1.240 conversas sintÃ©ticas criadas."** + StatCards (geradas, descartadas). Tenant real:
pÃ¡gina mostra sÃ³ o card de bloqueio **"Este provedor nÃ£o Ã© um ambiente de teste."** (sem
form â€” nÃ£o provocar o 403).

### Testes
Guarda: tenant real â†’ 403 no service E na rota (2 testes). Parser: linha JSON invÃ¡lida
descartada sem abortar o lote. Mix: soma â‰ 100 â†’ 400 com mensagem clara.

### CritÃ©rios de aceite
- [ ] Tenant sandbox staging: 50 conversas geradas end-to-end (Batch API real), contagens
      no log; `created_by='synthetic'` em 100% (SELECT no log).
- [ ] Tenant real: 403 provado por curl (colar no log).
- [ ] RN8 (formâ†’progressoâ†’toast; prints).
**Rollback:** flags off. **Commit:** `feat(ia45): gerador de dados sintÃ©ticos via batch (flag off)`.

---

# âœ… IA-46 â€” Replay engine de conversas

**Objetivo:** reexecutar conversas REAIS contra o motor atual (com as flags/modelo/prompt
do ambiente) e comparar com o que foi respondido na Ã©poca â€” o gate tÃ©cnico do cutover
S74/S82. Estende `shadow-mode.ts` (o `computeEquivalenceRate` com judge injetÃ¡vel JÃ
existe â€” `shadow-mode.ts:73-83` â€” reusar, nÃ£o recriar).
**Flags:** `REPLAY_ENGINE_ENABLED` / client `replay`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_replay.sql` |
| CRIAR | `apps/api/src/domain/atendimento/replay.service.ts` (+ `.test.ts`) |
| CRIAR | `packages/queue/src/workers/replay.worker.ts` (fila `replay`, sem cron â€” sob demanda) |
| CRIAR | `apps/api/src/domain/ia/replay.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` |

Migration: `replay_runs(id uuid pk, tenant_id, params jsonb NOT NULL, status text NOT
NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')), total int,
equivalent int, pass_rate numeric, created_at, finished_at)` + `replay_items(id uuid pk,
run_id uuid REFERENCES replay_runs(id) ON DELETE CASCADE, tenant_id, conversation_id,
user_message text, original_response text, candidate_response text, verdict text CHECK
(verdict IN ('equivalente','divergente','erro')), judge_rationale text)` + RLS 023.

Regras:
1. Amostragem: `params = {from, to, sample: 10..500}` â€” pares (msg user â†’ resposta
   assistant seguinte) da tabela `messages`, aleatÃ³rio uniforme, EXCLUINDO
   `created_by='synthetic'`.
2. Worker: para cada par, `langGraphService.processMessage` com o contexto do par
   (tenant/customer/conversation reais) â€” **CUIDADO D5: replay NÃƒO pode ter efeito
   colateral.** Tools de escrita (suspend_signal, create_ticket, schedule_technical_visit)
   executam em modo dry-run: o worker injeta um `ToolsExecutor` decorado que intercepta
   as tools de escrita e retorna `{success:true, dryRun:true}` sem tocar o banco (a lista
   de tools de escrita vem do catÃ¡logo IA-19 â€” marcar `sideEffect: true` nas defs).
   Envio WhatsApp: o replay chama o grafo, nunca o `message.worker` â€” nÃ£o passa pelo
   `sendWhatsAppResponse` (confirmar por leitura que o envio estÃ¡ no worker, nÃ£o no
   grafo â€” auditado: estÃ¡ no worker, `message.worker.ts:83-88`. OK).
3. Judge: `computeEquivalenceRate` com judge `gpt-4o-mini` (generateObject
   `{equivalent: boolean, rationale: max 200}`, UseCase `replay-judge`). Rationale
   gravada por item.
4. Rotas: `POST /ia/replay` â†’ `202 {run_id}` Â· `GET /ia/replay/runs` Â·
   `GET /ia/replay/runs/:id` (com itens paginados, filtro `verdict=divergente`).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ReplayPage.tsx` (+ teste) |
| MODIFICAR | hub (key `replay`, "Replay de Conversas", "Rode conversas reais contra o motor atual antes de qualquer cutover.", Ã­cone `RefreshCw`, `/intelligence/replay`) Â· App.tsx Â· pt-br.ts |

Wizard 2 passos (nÃ£o 3 â€” o "alvo" Ã© o ambiente atual, sem escolha no MVP):
**1. Amostra** (date range + slider 10..500 + resumo "â‰ˆ N conversas do perÃ­odo") â†’
**2. Confirmar** (card: "O replay reexecuta as conversas SEM enviar mensagens e SEM
executar aÃ§Ãµes reais (modo seco)." + botÃ£o primary **"Iniciar replay"**). Corridas:
`DataTablePro` (data, amostra, status com badge, pass-rate mono â€” faixa signal â‰¥95%,
amber â‰¥85%, orange abaixo). Detalhe da corrida: StatCard herÃ³i do pass-rate + lista de
DIVERGENTES: lado a lado original Ã— candidato (2 colunas, mobile empilha) + rationale do
judge em itÃ¡lico. BotÃ£o Secondary **"Exportar relatÃ³rio"** â†’ download JSON da corrida.
Vazio: **"Nenhum replay executado."** / botÃ£o primary **"Iniciar o primeiro replay"**.
Toast ao enfileirar: **"Replay iniciado â€” acompanhe o status aqui."**

### Contrato de API
`POST /api/v2/ia/replay` body `{"from":"2026-06-01","to":"2026-06-30","sample":100}` â†’
`202 {"run_id":"..."}`. `GET /ia/replay/runs/:id` â†’ `{"status":"done","total":100,
"equivalent":93,"pass_rate":0.93,"items":[...]}`.

### Testes
Amostragem: exclui sintÃ©ticos; uniforme (estatÃ­stico frouxo). Dry-run: replay com
conversa cuja resposta original criou ticket â†’ NENHUM insert em tickets (spy) e item
registra `dryRun`. Judge: rationale gravada. Pass-rate = equivalent/total.

### CritÃ©rios de aceite
- [ ] Replay de 50 conversas reais de staging: relatÃ³rio com pass-rate + divergentes
      legÃ­veis lado a lado (prints).
- [ ] ZERO efeito colateral provado: contagens de tickets/OS/mensagens antes = depois
      (colar no log).
- [ ] ReferÃªncia cruzada: adicionar ao checklist do cutover S74/S82 no
      `PLANO_MESTRE_V2__EM_ANDAMENTO.md` a linha "replay â‰¥95% (IA-46) anexado" (editar lÃ¡, 1 linha).
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia46): replay engine com dry-run e judge (flag off)`.

---
---

# FASE 2 â€” SESSÃ•ES EM DENSIDADE TOTAL
# (expandidas pela sessÃ£o IA-F2-PLAN em 2026-07-07 â€” gate RN16 CUMPRIDO)

> **Base da auditoria desta expansÃ£o:** `git log` atÃ© `64303fa` (Fase 1 100% em main),
> PROGRESS_LOG de 2026-07-06 (consolidaÃ§Ã£o) e 2026-07-05 (sessÃµes individuais), e
> leitura dos arquivos reais citados linha a linha em cada sessÃ£o.
> **Migrations:** prÃ³ximo nÃºmero livre HOJE = `048` (037â€“047 usados pela Fase 1;
> atenÃ§Ã£o Ã  colisÃ£o histÃ³rica `035_ai_decision_log` + `035_network_metrics` â€” E5).
> RN5 continua: confirmar o nÃºmero com `ls packages/db/src/migrations/` NO DIA.
> PadrÃ£o RLS = policy `tenant_isolation` com `app.current_tenant_id` (D7).
> **Leitura obrigatÃ³ria antes de qualquer sessÃ£o:** ApÃªndice E (dÃ­vidas herdadas).
> Flags client novas: cada sessÃ£o adiciona a sua em `public-flags.ts` (hoje: 14 chaves;
> `costdrill` demonstra o padrÃ£o client-only `undefined` = sempre on â€” E9).

---

# â¬œ IA-32 â€” OpenLLMetry (spans OTel por nÃ³ do grafo)

**Objetivo:** telemetria OpenTelemetry padrÃ£o: 1 trace por `processMessage`, 1 span por
nÃ³ do grafo e 1 span por chamada LLM, exportados via OTLP para qualquer backend
(Tempo/Jaeger/Traceloop). Complementa o Helicone (custo, RN7) â€” nÃ£o o substitui.
Ã‰ a FONTE de mediÃ§Ã£o do orÃ§amento de latÃªncia (IA-35).
**Flags:** `OTEL_ENABLED` (server) / client `otel` (sÃ³ o card de status).

**Auditoria (2026-07-07):** grafo com 12 nÃ³s em `langgraph.service.ts:83-96`
(`classify, guardrails, decide_source, fetch_context, generate, validate, escalate,
block, grade_context, rewrite_query, self_check, safety_veto`); `processMessage` na
:163. Chamadas LLM centralizadas em `vercel-ai.service.ts` (`classifyIntent:176`,
`streamWithTools`, tudo via `withFailover` do model-router IA-43). Observabilidade
existente: `sentry.service.ts`, `langsmith.service.ts`, Helicone headers.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/observability/otel.ts` (+ `.test.ts`) â€” boot do NodeSDK |
| CRIAR | `apps/api/src/infrastructure/observability/otel-span.helper.ts` (+ `.test.ts`) â€” `withSpan(name, attrs, fn)` |
| CRIAR | `apps/api/src/domain/ia/otel.routes.ts` â€” `GET /ia/otel/status` |
| MODIFICAR | `langgraph.service.ts` (envolver os 12 `addNode` com `wrapNode(name, node)`) |
| MODIFICAR | `vercel-ai.service.ts` (span `llm.generate` com attrs model/useCase/tokens) |
| MODIFICAR | `server.ts` (boot ANTES de tudo) Â· `env.validator.ts` (`OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT?`) Â· `public-flags.ts` (`otel`) |

Deps npm (pinar): `@opentelemetry/api`, `@opentelemetry/sdk-node`,
`@opentelemetry/exporter-trace-otlp-http`.
Regras: 1. **DecisÃ£o registrada:** instrumentaÃ§Ã£o MANUAL nos pontos de interesse (12
nÃ³s + LLM) em vez do auto-instrument do Traceloop â€” LangGraph JS nÃ£o tem instrumentaÃ§Ã£o
oficial estÃ¡vel; menos mÃ¡gica, mais controle. 2. Flag off â†’ tracer no-op do
`@opentelemetry/api` e o SDK pesado NEM Ã© importado (import dinÃ¢mico no boot). 3.
Atributos mÃ­nimos por span: `tenantId`, nome do nÃ³, e no `llm.generate`:
`model`, `useCase`, `tokens` (quando disponÃ­vel â€” D4 jÃ¡ corrigido pela IA-34). 4.
Erro no exporter NUNCA derruba mensagem (fail-open RN4, warn 1x/min).

### Frontend
MODIFICAR `src/pages/AIObservabilityPage.tsx` (RELER INTEIRA â€” RN9; jÃ¡ tem a seÃ§Ã£o
Providers da IA-43): card **"Telemetria"** â€” status via `GET /api/v2/ia/otel/status`
(`{enabled, endpoint_mascarado, spans_sessao, ultimo_erro}`) com RiskBadge
(exportando=baixo / erro=alto / desligado=sem-dado). SEM tela prÃ³pria (RN12 via
AIObservabilityPage; justificar no log).

### Testes
`InMemorySpanExporter`: 1 mensagem pelo grafo (mocks) â†’ trace contÃ©m spans dos nÃ³s
percorridos, na hierarquia certa; flag off â†’ zero spans E zero import do SDK (spy);
span de nÃ³ que lanÃ§a â†’ status ERROR; atributo tenantId presente em todos.

### CritÃ©rios de aceite
- [ ] Flag off: boot sem OTel carregado (log de boot) e suÃ­te inteira verde.
- [ ] Staging flag on: trace completo com os 12 nÃ³s visÃ­vel no backend OTLP (print).
- [ ] Overhead: p95 de `processMessage` com/sem flag difere <5ms (20 msgs, log).
- [ ] RN8 via card na AIObservabilityPage (print).
**Rollback:** `OTEL_ENABLED=false`. **Commit:** `feat(ia32): spans opentelemetry por nÃ³ do grafo + status do exporter (flag off)`.

---

# â¬œ IA-42 â€” Spec tracker (eval da IA-03 como gate de CI)

**Objetivo:** comportamento vira spec executÃ¡vel: o eval de 50 cenÃ¡rios roda em CI com
baseline versionado; regressÃ£o de pass-rate quebra o job. SEM UI (exceÃ§Ã£o RN12 â€” job de
CI; registrar no log). **Flags:** nenhuma (nÃ£o roda em runtime de produÃ§Ã£o).

**Auditoria:** harness REAL em `apps/api/eval/run-eval.ts` (lÃª
`eval/scenarios/atendimento.jsonl` â€” 50 linhas conferidas) + `eval/judge.ts`
(`judge(p: JudgeInput, tenantId)` com `JudgeSchema` Zod) + resultados em
`eval/results/*.json` (existe 1 de 2026-07-05). CI em `.github/workflows/ci.yml`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/eval/baseline.json` â€” snapshot aprovado (por cenÃ¡rio: `{id, pass}`; geral: `rate`) |
| CRIAR | `apps/api/eval/spec-tracker.ts` (+ `.test.ts`) â€” PURO |
| MODIFICAR | `apps/api/eval/run-eval.ts` (modo `--ci`: roda + compara + exit code + summary markdown) |
| MODIFICAR | `.github/workflows/ci.yml` (job `eval-spec`: schedule nightly + workflow_dispatch) |

```ts
// spec-tracker.ts
export interface SpecComparison { regressions: string[]; newPasses: string[]; rateDelta: number; }
export function compareToBaseline(current: EvalResult, baseline: Baseline): SpecComparison;
// falha (exit 1) se: rate cai >2pp OU um cenÃ¡rio que passava agora falha.
```
Regras: 1. NUNCA por PR â€” sÃ³ nightly/manual (custo LLM); gate: o job sÃ³ roda se o
secret `OPENAI_API_KEY` existir. UseCase Helicone `eval-spec` (RN7). 2. Atualizar
baseline Ã© COMMIT deliberado, nunca automÃ¡tico. 3. CenÃ¡rio flaky (veredito instÃ¡vel em
3 noites) â†’ campo novo `quarantined: true` no jsonl: fora do gate, listado no summary.

### Testes
spec-tracker puro: regressÃ£o de 1 cenÃ¡rio detectada e nomeada; melhora nÃ£o falha;
rateDelta nos limites (exatamente âˆ’2pp nÃ£o falha; âˆ’2.1pp falha); quarentena ignorada.

### CritÃ©rios de aceite
- [ ] `npx tsx eval/run-eval.ts --ci` local verde contra o baseline gerado na sessÃ£o
      (colar summary no PROGRESS_LOG).
- [ ] RegressÃ£o sintÃ©tica (inverter o expected de 1 cenÃ¡rio) â†’ exit 1 nomeando o cenÃ¡rio.
- [ ] Job nightly verde no GitHub Actions (print).
**Rollback:** remover o job do ci.yml. **Commit:** `feat(ia42): spec tracker â€” eval de 50 cenÃ¡rios como gate nightly de CI`.

---

# â¬œ IA-38 â€” Explicabilidade do churn + tela `/intelligence/churn`

**Objetivo:** quitar a dÃ­vida de tela da IA-07: clientes por risco + waterfall de
contribuiÃ§Ãµes por feature que SOMA o score exibido. **"SHAP honesto" registrado:** o
modelo real Ã© LINEAR (`computeChurnScore`, `churn-score.ts:61`; pesos em
`CHURN_WEIGHTS:33`) â€” contribuiÃ§Ã£o exata = peso Ã— valor normalizado, SEM lib. SHAP de
verdade sÃ³ quando houver modelo nÃ£o-linear Python (ADR da IA-24).
**Flags:** client `churn`; server: reusar a flag existente do worker de churn (auditar
o nome real em `packages/queue/src/workers/churn.worker.ts` NO DIA â€” RN9).

**Auditoria:** `churn_scores` (036) gravada pelo `churn.worker.ts` (cron `0 3 * * *`
por tenant, jobId `churn-repeat:{tenantId}`); features em
`churn-features.service.ts:159` (SQL prÃ³prio â€” dÃ­vida E3, fica para a IA-23); rota
`GET /api/v2/ia/churn` JÃ existe (`churn.routes.ts:21` â€” reler o shape); bandas em
`RISK_BANDS` (`churn-score.ts:42`: low/medium/high/critical â†’ RiskBadge
baixo/mÃ©dio/alto/crÃ­tico).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_churn_contributions.sql` â†’ `ALTER TABLE churn_scores ADD COLUMN IF NOT EXISTS contributions JSONB;` |
| MODIFICAR | `apps/api/src/domain/ml/churn-score.ts` (retornar `contributions: {feature, weight, value, contribution}[]` â€” campo NOVO no resultado, retrocompatÃ­vel; invariante: soma == score) |
| MODIFICAR | `packages/queue/src/workers/churn.worker.ts` (gravar `contributions`) |
| MODIFICAR | `apps/api/src/domain/ia/churn.routes.ts` (incluir contributions + ordenaÃ§Ã£o por score desc + paginaÃ§Ã£o) |
| MODIFICAR | `public-flags.ts` (`churn`) |

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ChurnPage.tsx` (+ teste) |
| CRIAR | `src/pages/intelligence/SandboxPage.tsx` (+ teste) â€” **QUITAÃ‡ÃƒO DA DÃVIDA E1**: a spec completa (editor mono, hint fixo, histÃ³rico de 20, duplo gate flag+super_admin) estÃ¡ na sessÃ£o IA-44 da Fase 1; o backend JÃ existe (`sandbox.routes.ts:81` POST + `:153` histÃ³rico + guard super_admin `:65`) |
| MODIFICAR | `src/App.tsx` (rotas `/intelligence/churn` E `/intelligence/sandbox`) Â· hub (key `churn`, "Risco de Churn", "Quem estÃ¡ prestes a cancelar â€” e por quÃª.", Ã­cone `UserMinus`, `/intelligence/churn`) Â· `pt-br.ts` |

Tela de churn: topo StatCards (clientes em crÃ­tico/alto; "MRR em risco" â€” mono,
centavosâ†’R$, B4); `DataTablePro` Cliente Â· Score (mono 0-100) Â· Banda (RiskBadge) Â·
MRR (mono) Â· Atualizado (relativo). Clique â†’ `Sheet` com waterfall (BarChart Recharts
horizontal: contribuiÃ§Ã£o por feature â€” positivas em orange/red, negativas em signal;
Ãºltima barra "Score" = soma, invariante VISÃVEL). Vazio: **"Nenhum score de churn
ainda."** / **"O cÃ¡lculo roda toda noite Ã s 03h."** Erro: padrÃ£o IA-21.

### Testes
Invariante `soma(contributions) == score` com 20 fixtures variadas; rota expÃµe
contributions; waterfall: soma exibida bate com o score do fixture; SandboxPage:
gate super_admin (usuÃ¡rio comum nÃ£o vÃª), POST renderiza resultado, erro do guard
renderiza a `hint`.

### CritÃ©rios de aceite
- [ ] Waterfall de 3 clientes reais de staging SOMA o score (prints). <- aguarda CHURN_ENGINE=on em staging (Lucas)
- [x] **E1 quitada:** `/intelligence/sandbox` -- rota registrada, SandboxPage.tsx completa, 7 testes passando. (2026-07-11)
- [x] Flag client off: nem churn nem sandbox no DOM -- ChurnPage.test.tsx L116 + SandboxPage.test.tsx gate. (2026-07-11)
- [x] RN8 completo nas DUAS telas -- EmptyState, Skeleton, ErrorState cobertos nos 14 testes frontend. (2026-07-11)
**Rollback:** flag client off. **Commit:** `feat(ia38): tela de churn com waterfall explicÃ¡vel + quitaÃ§Ã£o SandboxPage (E1)`.

---

# â¬œ IA-23 â€” LTV (lifetime value por cliente)

**Objetivo:** LTV heurÃ­stico auditÃ¡vel: `ltv_cents = mrr_cents Ã— margem Ã—
expectativa_de_vida_meses`, com expectativa = `1 / churn_mensal` (score â†’ probabilidade
mensal por banda). Vira feature no Feature Store (fonte Ãºnica) e coluna na ChurnPage.
Modelo de sobrevivÃªncia Python sÃ³ via ADR (IA-24).
**Flags:** `LTV_ENABLED` / client `ltv`.
**Depende de:** IA-07 âœ“, IA-27 âœ“, IA-38 (a tela onde a coluna entra).

**Auditoria:** `FEATURE_DEFS` (`feature-registry.ts:14`) tem 4 features
(tenure_days, overdue_count_90d, tickets_90d, mrr_cents) com
`assertFeatureDefsUnique:63`; `computeAllForTenant` (`feature-store.service.ts:174`)
faz 1 query agregada por feature; worker cron 02h. **DÃ­vida E3 quitada AQUI:**
`churn-features.service.ts:159` (`extractFeatures`) tem SQL prÃ³prio para
tenure/overdue/tickets/mrr â€” trocar por `getFeatures`
(`feature-store.service.ts:214`) com FALLBACK ao SQL atual quando o store estÃ¡
vazio/stale (fail-open; logar qual fonte serviu).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/ml/ltv.ts` (+ `.test.ts`) â€” PURO |
| MODIFICAR | `feature-registry.ts` (+ `ltv_cents` ttl 24h, `expected_lifetime_months`) |
| MODIFICAR | `feature-store.service.ts` (`computeAllForTenant` computa as 2 novas lendo o `churn_scores` mais recente por cliente â€” JOIN, nÃ£o N+1) |
| MODIFICAR | `churn-features.service.ts` (E3, acima) Â· `churn.routes.ts` (+ `ltv_cents`) Â· `public-flags.ts` (`ltv`) |

```ts
// ltv.ts â€” constantes EXPORTADAS (calibrar com dados reais depois; decisÃ£o registrada)
export const MONTHLY_CHURN_BY_BAND = { low: 0.005, medium: 0.02, high: 0.05, critical: 0.10 };
export const LTV_MARGIN = 0.35;          // margem default de ISP; teto 60 meses
export function computeLtv(i: { mrrCents: number; band: RiskBand }): { ltvCents: number; months: number };
```

### Frontend
MODIFICAR `ChurnPage` (coluna **"LTV"** mono R$ + StatCard **"LTV total em risco"** =
soma dos LTV de crÃ­tico+alto) Â· `pt-br.ts`. Tooltip: **"Estimativa: mensalidade Ã—
margem Ã— expectativa de vida pela probabilidade de churn. Teto de 60 meses."**
SEM tela prÃ³pria (RN12 via ChurnPage; log).

### Testes
ltv puro: 4 bandas, teto 60 meses, mrr 0 â†’ 0; E3: store populado â†’ usa store (spy);
store vazio â†’ fallback SQL + warn, e o RESULTADO das features Ã© igual nas duas fontes
(fixture); worker grava as 2 features novas.

### CritÃ©rios de aceite
- [ ] 5 clientes de staging: `ltv_cents` = conta manual (colar no log).
- [ ] E3: log prova o store como fonte no caminho feliz; suÃ­te de churn intacta.
- [ ] StatCard com dado real (print).
**Rollback:** flags off (features novas param de computar; colunas ficam).
**Commit:** `feat(ia23): ltv heurÃ­stico no feature store + coluna na tela de churn (flag off)`.

---

# â¬œ IA-31 â€” LLM-as-judge permanente + ranking Elo

**Objetivo:** toda comparaÃ§Ã£o AÃ—B que o produto JÃ produz (replay originalÃ—candidato;
eval esperadoÃ—obtido) alimenta um ranking Elo persistente de "contenders"
(modelo + versÃ£o de prompt), respondendo "a configuraÃ§Ã£o de hoje Ã© melhor que a da
semana passada?" com um nÃºmero. Tela `/intelligence/models`.
**Flags:** `MODEL_ELO_ENABLED` / client `elo`.
**Depende de:** IA-03 âœ“ (`eval/judge.ts`), IA-46 âœ“ (`judgeOnePair`,
`replay.service.ts:239`).

**Auditoria:** contender identificÃ¡vel hoje = `model` + versÃ£o de prompt (hash
sha256-12 do prompt-registry, `promptHash:78`); `replay_items` (047) guarda verdict
por item; o eval grava JSON em `eval/results/`. **DecisÃ£o de granularidade
registrada:** o replay compara "motor da Ã©poca" Ã— "motor atual" â€” a partida Ã© entre
CONFIGURAÃ‡Ã•ES inteiras (snapshot dos params da run), nÃ£o modelos isolados; Ã© o que dÃ¡
para afirmar honestamente.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_elo.sql` |
| CRIAR | `apps/api/src/domain/ml/elo.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `apps/api/src/domain/ml/elo-recorder.service.ts` (+ teste) |
| CRIAR | `apps/api/src/domain/ia/models.routes.ts` (+ teste) |
| MODIFICAR | `replay.service.ts` (`executeReplayRun:276` â€” ao fechar a run com flag on, gravar partidas) |
| MODIFICAR | `public-flags.ts` (`elo`) |

Migration: `elo_contenders(id uuid pk, tenant_id, key text, rating numeric NOT NULL
DEFAULT 1000, games int NOT NULL DEFAULT 0, UNIQUE(tenant_id, key))` +
`elo_matches(id uuid pk, tenant_id, winner_key text, loser_key text, draw boolean,
source text CHECK (source IN ('replay','eval','manual')), ref_id uuid, created_at)`
+ RLS 023 + Ã­ndice `elo_matches(tenant_id, ref_id)` (idempotÃªncia).
```ts
// elo.ts
export function expectedScore(ra: number, rb: number): number;      // 1/(1+10^((rb-ra)/400))
export function updateElo(ra: number, rb: number, result: 1 | 0 | 0.5, k = 32): [number, number];
```
Regras: 1. Item `equivalente` do replay = EMPATE (0.5) entre "Ã©poca" e "atual". 2. Item
`divergente` NÃƒO vira partida automÃ¡tica â€” o judge de equivalÃªncia nÃ£o diz quem Ã©
MELHOR; divergÃªncia entra numa fila de decisÃ£o humana na tela (botÃµes "Original melhor"
/ "Candidato melhor") e sÃ³ entÃ£o vira partida (source `manual`). Escopo honesto,
registrado. 3. `recordMatch` idempotente por `(tenant, ref_id)` â€” reprocessar run nÃ£o
duplica. 4. Rotas: `GET /ia/models/ranking` Â· `GET /ia/models/pending` Â·
`POST /ia/models/matches/:itemId/resolve` body `{winner: 'original'|'candidate'}`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ModelsPage.tsx` (+ teste) |
| MODIFICAR | hub (key `elo`, "Ranking de Modelos", "Elo das configuraÃ§Ãµes de modelo e prompt do seu ambiente.", Ã­cone `Trophy`, `/intelligence/models`) Â· App.tsx Â· pt-br.ts |

Ranking: `DataTablePro` Contender (mono) Â· Rating (mono, 700 sÃ³ no lÃ­der) Â· Partidas Â·
Ãšltimos 5 (âœ“/âœ—/= como pontos coloridos). Abaixo, fila **"DivergÃªncias aguardando
decisÃ£o"**: lado a lado original Ã— candidato (padrÃ£o da ReplayPage), botÃµes Secondary
**"Original melhor"** / **"Candidato melhor"** â†’ toast **"Partida registrada."** Vazio:
**"Nenhuma partida ainda."** / **"Rode um replay para gerar as primeiras
comparaÃ§Ãµes."** + botÃ£o primary **"Ir para o Replay"** â†’ `/intelligence/replay`.

### Testes
elo puro: simetria (ganho de A = perda de B), empate move menos que vitÃ³ria, K
respeitado; recorder: idempotÃªncia por ref_id; replay fecha â†’ N empates gravados
(mock); resolve â†’ ratings movem na direÃ§Ã£o certa; flag off â†’ `executeReplayRun` byte a
byte (spy no recorder).

### CritÃ©rios de aceite
- [ ] Replay de 50 em staging â†’ ranking com 2 contenders e partidas == itens
      equivalentes (query no log).
- [ ] Decidir 3 divergÃªncias na tela â†’ rating muda na direÃ§Ã£o certa (prints).
- [ ] Flag off: replay inalterado (spy).
**Rollback:** flags off. **Commit:** `feat(ia31): ranking elo de configuraÃ§Ãµes via replay + fila de decisÃ£o (flag off)`.

---

# â¬œ IA-29 â€” Active learning (sinais humanos â†’ dataset)

**Objetivo:** unificar TODO feedback humano do produto em `labeled_examples` â€” a fonte
de few-shot/eval/fine-tune futura: revisÃµes de veto (IA-21), ðŸ‘/ðŸ‘Ž da rota de feedback,
divergÃªncias resolvidas (IA-31), correÃ§Ãµes de OCR (IA-15, quando existir). Fila de
rotulagem `/intelligence/feedback` com teclas 1/2/3.
**Flags:** `ACTIVE_LEARNING_ENABLED` / client `activelearn`.

**Auditoria:** fontes REAIS hoje â€” `safety_vetoes.review_status`
('veto_correto'|'falso_positivo'; PATCH em `safety.routes.ts:58`);
`POST /api/v2/ia/feedback` jÃ¡ existe (`feedback.routes.ts:14` â€” RELER para ver o que
grava e onde, RN9); `replay_items.verdict` (047). OCR entra quando a IA-15 rodar
(source jÃ¡ prevista no CHECK).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_labeled_examples.sql` |
| CRIAR | `apps/api/src/domain/ml/active-learning.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ia/labeling.routes.ts` (+ teste) |
| MODIFICAR | `safety.routes.ts` (PATCH â†’ fire-and-forget `recordExample`) Â· `feedback.routes.ts` (idem) Â· `models.routes.ts` da IA-31 (resolve â†’ idem) |
| MODIFICAR | `public-flags.ts` (`activelearn`) |

Migration: `labeled_examples(id uuid pk, tenant_id, source text CHECK (source IN
('safety_review','feedback','replay_resolution','ocr_correction','manual')), input
text NOT NULL, output text, label text, payload jsonb, created_at, labeled_at
timestamptz, exported_at timestamptz)` + RLS 023 + Ã­ndice
`(tenant_id, source, created_at DESC)` + UNIQUE `(tenant_id, source, md5(input))`
(dedupe).
Regras: 1. `recordExample` = fire-and-forget SEMPRE (nenhuma rota fica mais lenta por
causa do dataset). 2. Fila de rotulagem = linhas com `label IS NULL` (ex.: respostas
escaladas amostradas; feedback sem categoria). Teclas: **1** aprova, **2** reprova,
**3** pula. 3. `GET /ia/labeling/export?source=&since=` â†’ download JSONL (marca
`exported_at`).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/LabelingPage.tsx` (+ teste) |
| MODIFICAR | hub (key `activelearn`, "Fila de Rotulagem", "Seu feedback vira dado de treino.", Ã­cone `Tags`, `/intelligence/feedback`) Â· App.tsx Â· pt-br.ts |

Card Ãºnico centrado (mobile-first): o exemplo (input + output), badge da origem
(slate), botÃµes grandes **"1 Â· Correto"** / **"2 Â· Incorreto"** / **"3 Â· Pular"** com
atalhos de teclado (keydown; visÃ­vel no botÃ£o; aria-keyshortcuts). Contador **"12
pendentes"** (mono). A cada 10 rotulados: toast **"10 exemplos rotulados â€”
obrigado!"** BotÃ£o Secondary **"Exportar JSONL"**. Vazio: **"Fila limpa."** / **"Novos
exemplos chegam conforme o uso do produto."** (sem botÃ£o).

### Testes
Dedupe por (tenant,source,md5); export escapa newline interna; PATCH de veto gera
exemplo (spy, mock supabase); teclas 1/2/3 disparam POST certo; flag off = zero write
novo nas rotas modificadas (spy).

### CritÃ©rios de aceite
- [ ] Rotular 10 em staging sÃ³ com teclado (gravaÃ§Ã£o no log).
- [ ] Export JSONL vÃ¡lido (`jq -c . | wc -l` no log).
- [ ] RevisÃ£o de veto na GuardrailsPage â†’ exemplo aparece na fila (e2e).
**Rollback:** flags off. **Commit:** `feat(ia29): active learning â€” labeled_examples + fila de rotulagem (flag off)`.

---

# â¬œ IA-15 â€” OCR multi-layout + fila de revisÃ£o

**Objetivo:** alÃ©m do boleto (IA-04), extrair conta de energia e fatura de concorrente
(negociaÃ§Ã£o/portabilidade); TODA extraÃ§Ã£o com confianÃ§a <0.85 cai numa fila de revisÃ£o
humana mobile-first; correÃ§Ãµes alimentam a IA-29.
**Flags:** `OCR_MULTILAYOUT_ENABLED` / client `reviewqueue`.
**Depende de:** IA-04 âœ“.

**Auditoria:** `vision.service.ts` real â€” `BoletoSchema:21`, `extractBoleto:45`
(gpt-4o vision + generateObject), `classifyFieldPhoto:85`, `formatBoletoPrompt:127`,
flag `isVisionStructuredEnabled:17`; plugado no WhatsApp via
`media-processor.service.ts` `processInboundMedia:49` com deps INJETÃVEIS
(`extractBoleto?`/`classifyFieldPhoto?` nas linhas 38-48) â€” estender pelo MESMO seam.
Conferir NO DIA se `BoletoSchema` jÃ¡ tem campo `confidence`; se nÃ£o, adicionar aos 3
schemas (mudanÃ§a aditiva).

### Backend
| AÃ§Ã£o | Arquivo |
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
created_at timestamptz DEFAULT now())` + RLS 023 + Ã­ndice
`(tenant_id, review_status, created_at DESC)`.
Regras: 1. **DecisÃ£o de custo registrada:** `classifyDocumentType(imageUrl)` roda
ANTES com `gpt-4o-mini` vision (1 enum barato) e sÃ³ entÃ£o o extract caro do tipo
detectado (UseCases `ocr-classify` / `ocr-extract-{tipo}`, RN7). 2. Schemas novos:
energia `{distribuidora, valor_cents, kwh, vencimento, confidence}`; concorrente
`{operadora, plano, valor_cents, confidence}` (B4: centavos). 3. confidence <0.85 â†’
`pending`; â‰¥0.85 â†’ `auto`. 4. `PATCH /ia/ocr/:id` `{action:'approve'|'correct',
corrected?}`; correÃ§Ã£o â†’ fire-and-forget `recordExample` (IA-29, source
`ocr_correction`) SE a IA-29 jÃ¡ rodou (checar flag; senÃ£o sÃ³ grava `corrected`).

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/ReviewQueuePage.tsx` (+ teste) â€” MOBILE-FIRST |
| MODIFICAR | hub (key `reviewqueue`, "RevisÃ£o de Documentos", "Confirme extraÃ§Ãµes de boletos e faturas com baixa confianÃ§a.", Ã­cone `FileSearch`, `/intelligence/review-queue`) Â· App.tsx Â· pt-br.ts |

Card por item: imagem (zoom no toque), campos extraÃ­dos como inputs EDITÃVEIS
prÃ©-preenchidos, `ConfidenceMeter`, botÃµes primary **"Aprovar"** / secondary
**"Corrigir e aprovar"** (habilita ao editar). NavegaÃ§Ã£o item a item (contador "3 de
7"). Vazio: **"Nenhum documento aguardando revisÃ£o."** / **"ExtraÃ§Ãµes com confianÃ§a
alta sÃ£o aprovadas automaticamente."** Erro: padrÃ£o IA-21.

### Testes
`classifyDocumentType` mock roteia para o schema certo; <0.85 â†’ pending e â‰¥0.85 â†’
auto; PATCH correct grava `corrected` + exemplo IA-29 (spy); linha JSON invÃ¡lida do
modelo â†’ `desconhecido` + pending (nunca aborta o media-processor); pÃ¡gina renderiza
inputs do fixture e habilita "Corrigir e aprovar" ao editar.

### CritÃ©rios de aceite
- [ ] 3 documentos reais em staging (boleto, energia, concorrente) extraÃ­dos com os
      campos certos (prints).
- [ ] Item de baixa confianÃ§a na fila, revisado NO CELULAR (print viewport 375px).
- [ ] Flag off: pipeline do boleto EXATAMENTE como a IA-04 deixou (teste snapshot do
      fluxo `processInboundMedia`).
**Rollback:** flags off. **Commit:** `feat(ia15): ocr multi-layout + fila de revisÃ£o humana (flag off)`.

---

# â¬œ IA-17 â€” MCP server (tools read-only por API key)

**Objetivo:** expor as tools READ-ONLY do agente via Model Context Protocol â€” o dono do
ISP pluga o Claude (ou outro cliente MCP) nos dados dele com API key por tenant.
Escrita NUNCA sai por MCP.
**Flags:** `MCP_SERVER_ENABLED` / client `mcp`.
**Depende de:** IA-19 âœ“.

**Auditoria:** catÃ¡logo = 9 tools (`agentTools`, `vercel-ai.service.ts:94-166`);
executor `ToolsExecutor` (`tools.executor.ts:11`, cases :38-60). Read-only reais:
`check_invoice`, `get_billing_status`, `query_knowledge_base`, `check_coverage`,
`run_diagnostics`, `query_network_graph`. Escrita: `suspend_signal`, `create_ticket`,
`schedule_technical_visit` â€” hoje listadas em `SIDE_EFFECT_TOOLS`
(`replay.service.ts:76`). **DÃ­vida E4 quitada AQUI:** mover `SIDE_EFFECT_TOOLS` para
`tool-registry.ts` (fonte Ãºnica) com reexport em `replay.service.ts` para nÃ£o quebrar
imports.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_mcp_keys.sql` |
| MODIFICAR | `tool-registry.ts` (export `SIDE_EFFECT_TOOLS` + `READ_ONLY_TOOLS` derivado; teste: uniÃ£o == catÃ¡logo) |
| CRIAR | `apps/api/src/infrastructure/mcp/mcp-server.ts` (+ teste) |
| CRIAR | `apps/api/src/domain/ia/mcp-admin.routes.ts` (+ teste) |
| MODIFICAR | `server.ts` (montar transporte) Â· `public-flags.ts` (`mcp`) |

Migration: `mcp_api_keys(id uuid pk, tenant_id, name text NOT NULL, key_hash text NOT
NULL UNIQUE, enabled boolean NOT NULL DEFAULT true, tools text[] NOT NULL, last_used_at
timestamptz, created_at timestamptz DEFAULT now())` + RLS 023. A chave Ã© exibida UMA
vez na criaÃ§Ã£o; sÃ³ o sha256 persiste.
Regras: 1. Dep `@modelcontextprotocol/sdk` (instalar, pinar) com transporte
**Streamable HTTP** em `POST /api/v2/mcp` â€” conferir o adapter Fastify/Node do SDK NO
DIA (a API do transporte muda entre minors). 2. Tools oferecidas = `READ_ONLY_TOOLS âˆ©
key.tools âˆ© getEnabledTools(tenant)` (IA-19) â€” resolvido POR REQUISIÃ‡ÃƒO. 3. ExecuÃ§Ã£o
delega ao `ToolsExecutor` com o tenantId DA KEY (nunca do payload). 4. Auth: Bearer â†’
sha256 â†’ lookup; rate limit 60 req/min por key (reusar o mecanismo de rate limit do
server.ts â€” auditar qual Ã©). 5. Cada chamada conta em `tool_usage_daily` (IA-19,
`recordToolUsage:182`). 6. Rotas admin: `GET/POST /ia/mcp/keys` Â·
`PATCH /ia/mcp/keys/:id` `{enabled, tools}` Â· `DELETE /ia/mcp/keys/:id`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/McpPage.tsx` (+ teste) |
| MODIFICAR | hub (key `mcp`, "ConexÃµes MCP", "Conecte o Claude e outros clientes aos dados do seu provedor.", Ã­cone `Plug`, `/intelligence/mcp`) Â· App.tsx Â· pt-br.ts |

Lista de keys (`DataTablePro`: Nome Â· Criada Â· Ãšltimo uso Â· Tools (contagem) Â· Switch)
+ botÃ£o primary **"Nova chave"** â†’ Dialog: nome + checkboxes SÃ“ das tools read-only â†’
resultado: chave em bloco mono + botÃ£o copiar + aviso amber **"Guarde agora â€” a chave
nÃ£o serÃ¡ exibida de novo."** + snippet copiÃ¡vel do `claude_desktop_config.json` com a
URL do ambiente. Delete â†’ ConfirmDialog **"Revogar esta chave?"** / **"IntegraÃ§Ãµes
usando esta chave param de funcionar imediatamente."**

### Testes
Key invÃ¡lida â†’ 401; **tool de ESCRITA nunca listada mesmo se injetada em `key.tools`
(o teste mais importante â€” defesa dupla)**; executor recebe o tenant da key; plaintext
da chave nÃ£o persiste (grep no insert); E4: `READ_ONLY âˆª SIDE_EFFECT == catÃ¡logo`
(quebra se alguÃ©m adicionar tool sem classificar).

### CritÃ©rios de aceite
- [ ] Claude Desktop real conectado em staging executa `check_coverage` (print da
      conversa).
- [ ] `suspend_signal` inacessÃ­vel via MCP (tentativa manual â†’ erro; colar no log).
- [ ] Revogar key â†’ chamada seguinte 401 (curl no log).
- [ ] RN8 completo.
**Rollback:** flags off (`POST /api/v2/mcp` â†’ 404). **Commit:** `feat(ia17): mcp server read-only por api key/tenant (flag off)`.

---

# â¬œ IA-22 â€” Web browsing agent (allowlist + citaÃ§Ã£o obrigatÃ³ria)

**Objetivo:** tool `browse_url` â€” o agente consulta pÃ¡ginas externas (status da
operadora upstream, site da prefeitura, pÃ¡gina do prÃ³prio ISP) SOMENTE em domÃ­nios da
allowlist do tenant, com extraÃ§Ã£o de texto legÃ­vel e citaÃ§Ã£o da fonte na resposta.
**Flags:** `BROWSING_ENABLED` / client `browse`.
**Depende de:** IA-19 âœ“ (catÃ¡logo/registry); padrÃ£o de defesa em camadas da IA-44 âœ“.

**Auditoria:** extraÃ§Ã£o JÃ existe â€” `extractReadableContent` (`site-scrape.ts:10`,
usada no scrape do onboarding; REUSAR â€” R5) + `contentHash:17`. Se ela for regex-based
e insuficiente, avaliar `cheerio` (dep a instalar) NA SESSÃƒO â€” registrar a decisÃ£o.
SSRF Ã© o risco central: o fetch roda DENTRO da infra.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_browse_allowlist.sql` â†’ `browse_allowlist(tenant_id, domain text, added_by, created_at, PRIMARY KEY (tenant_id, domain))` + RLS 023 |
| CRIAR | `apps/api/src/infrastructure/browse/url-guard.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/infrastructure/browse/browser.service.ts` (+ teste) |
| MODIFICAR | `vercel-ai.service.ts` (def `browse_url`) + `tools.executor.ts` (case novo) |
| CRIAR | `apps/api/src/domain/ia/browse-admin.routes.ts` (`GET/POST/DELETE /ia/browse/allowlist`) |
| MODIFICAR | `public-flags.ts` (`browse`) |

`url-guard.ts` (a suÃ­te crÃ­tica): (a) sÃ³ http/https; (b) domÃ­nio (eTLD+1, lowercase) âˆˆ
allowlist â€” polÃ­tica EXPLÃCITA: domÃ­nio exato E subdomÃ­nios diretos (`*.dominio.com`)
â€” documentar e testar; (c) resolver DNS e RECUSAR IP privado/loopback/link-local/
metadata (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, 169.254.169.254) â€” e conectar NO
IP RESOLVIDO (anti-rebinding: lookup custom no Agent do undici â€” conferir a API NO
DIA); (d) redirects: mÃ¡x 3, NUNCA cross-domain.
`browser.service.ts`: timeout 5s, mÃ¡x 500KB, User-Agent identificado
(`AstrumISP-Agent/1.0`), `extractReadableContent`, retorno `{url_final, title, text
(mÃ¡x 4000 chars), fetched_at}`; cache Redis 10min por URL.
Tool def: descriÃ§Ã£o **"Consulta uma pÃ¡gina web da lista de sites confiÃ¡veis do
provedor. SEMPRE cite a URL da fonte na resposta ao cliente."** Recusa do guard â†’
`{error: 'DomÃ­nio fora da lista de sites permitidos.'}`. `nodeValidate`: resposta que
usou `browse_url` sem URL na resposta â†’ `validationIssue` (regex barata).

### Frontend
MODIFICAR `ToolsPage` â€” aba nova **"NavegaÃ§Ã£o"** (Tabs; sÃ³ com flag `browse`): lista de
domÃ­nios + input validado + botÃ£o **"Adicionar"**; remover â†’ ConfirmDialog **"Remover
este site?"** / **"O agente deixa de poder consultÃ¡-lo imediatamente."** MicrocÃ³pia do
topo: **"O agente sÃ³ navega nos domÃ­nios desta lista. PÃ¡ginas sÃ£o lidas como texto â€”
sem login, sem formulÃ¡rios."** SEM tela prÃ³pria (RN12 via ToolsPage; log).

### Testes
url-guard: TODOS os ranges privados recusados; rebinding (DNS muda entre check e
fetch â€” mock lookup) recusado; domÃ­nio fora â†’ recusa; subdomÃ­nio conforme polÃ­tica;
redirect cross-domain cortado; 500KB trunca sem explodir. Executor roteia; validate
pega resposta sem citaÃ§Ã£o.

### CritÃ©rios de aceite
- [ ] e2e staging: allowlist com uma status page real â†’ "a operadora X estÃ¡ com
      problema?" â†’ resposta cita a URL (print).
- [ ] `http://169.254.169.254/` recusada (log).
- [ ] Flag off: tool fora do catÃ¡logo; aba fora do DOM.
**Rollback:** flags off. **Commit:** `feat(ia22): browsing agent com allowlist e citaÃ§Ã£o obrigatÃ³ria (flag off)`.

---

# â¬œ IA-39 â€” Constitutional loop (constituiÃ§Ã£o editÃ¡vel por tenant)

**Objetivo:** o tenant edita os princÃ­pios de atendimento ("nunca prometer prazo sem OS
criada", "sempre oferecer 2Âª via antes de falar de suspensÃ£o"); em intents SENSÃVEIS a
resposta passa por 1 ciclo crÃ­ticaâ†’revisÃ£o contra a constituiÃ§Ã£o ANTES do safety_veto.
Complementa a IA-21 (rubrica fixa e VETADORA; aqui Ã© editÃ¡vel e REVISORA).
**Flags:** `CONSTITUTIONAL_LOOP_ENABLED` / client `constitution`.
**Depende de:** IA-21 âœ“.

**Auditoria:** grafo real (`langgraph.service.ts:83-146`): `generate â†’ self_check â†’
validate â†’ safety_veto â†’ (escalate|END)`. Ponto de inserÃ§Ã£o: nÃ³ `constitutional_review`
entre `validate` (passou) e `safety_veto` â€” RELER as edges no dia (RN9). Intents
sensÃ­veis (enum real, `agent.state.ts:19-22`): `cancel_service`, `complaint`, e
`support_billing` quando `sentiment âˆˆ {negative, frustrated}`. PadrÃ£o de nÃ³: factory
em `nodes/*.node.ts` com deps injetadas (estabelecido pela IA-01/IA-21; barrel em
`agent.nodes.ts:44-59`).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_tenant_constitutions.sql` â†’ `tenant_constitutions(tenant_id uuid PRIMARY KEY, principles text[] NOT NULL, updated_by text, updated_at timestamptz DEFAULT now())` + RLS 023 (validar mÃ¡x 10 princÃ­pios Ã— 280 chars na APLICAÃ‡ÃƒO â€” array CHECK em SQL Ã© frÃ¡gil) |
| CRIAR | `apps/api/src/infrastructure/guardrails/constitution.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/agent/nodes/constitutional-review.node.ts` (+ `.test.ts`) |
| MODIFICAR | `agent.state.ts` (+ `constitutionApplied: z.boolean().optional()`) + `langgraph.service.ts` (nÃ³ + edges + CHANNEL novo â€” armadilha B1) + `agent.nodes.ts` (barrel) |
| CRIAR | rotas `GET/PUT /ia/constitution` em `apps/api/src/domain/ia/constitution.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`constitution`) |

`constitution.service.ts`: `getConstitution(tenantId)` (cache Redis 60s; DEFAULT de
fÃ¡brica = 4 princÃ­pios CONSTANTES no arquivo) Â· `critiqueAndRevise(response,
principles, context)` â†’ `gpt-4o-mini` generateObject `{violates: boolean,
principle_index: number|null, revised_response: string|null}`, UseCase
`constitutional-review` (RN7), fail-open (RN4).
NÃ³: short-circuit com flag off OU intent nÃ£o-sensÃ­vel; `violates` â†’ substitui
`response` pela revisada + `constitutionApplied: true`. **1 ciclo, NUNCA loop.**

### Frontend
MODIFICAR `GuardrailsPage` (RELER INTEIRA â€” RN9) â€” vira Tabs: aba atual **"Vetos"** +
aba nova **"ConstituiÃ§Ã£o"**: lista editÃ¡vel (mÃ¡x 10; input + adicionar; lixeira com
ConfirmDialog). MicrocÃ³pia topo: **"PrincÃ­pios que a IA segue ao revisar as prÃ³prias
respostas em conversas sensÃ­veis (cancelamento, reclamaÃ§Ã£o). Frases curtas e diretas
funcionam melhor."** BotÃ£o primary **"Salvar constituiÃ§Ã£o"** â†’ toast **"ConstituiÃ§Ã£o
atualizada â€” vale para as prÃ³ximas conversas."** Nos vetos, badge slate **"revisada
pela constituiÃ§Ã£o"** quando `constitutionApplied`. SEM tela nova (RN12 via
GuardrailsPage; log).

### Testes
NÃ³: flag off â†’ zero LLM (spy); intent `other` â†’ skip; `violates` â†’ response
substituÃ­da, 1 ciclo sÃ³; fail-open em erro. Service: cache; default de fÃ¡brica quando
nÃ£o hÃ¡ linha. Rotas: PUT valida limites (11 princÃ­pios â†’ 400). Front: aba salva e
lista.

### CritÃ©rios de aceite
- [ ] Staging: princÃ­pio "nunca prometa visita sem OS criada" + fixture que promete â†’
      resposta final SEM a promessa (colar antes/depois no log).
- [ ] LatÃªncia extra p50 <800ms no caminho sensÃ­vel (log com timestamps).
- [ ] Flag off: grafo byte a byte (suÃ­te `langgraph.service.test.ts` verde sem
      mudanÃ§a).
**Rollback:** flags off. **Commit:** `feat(ia39): constitutional loop editÃ¡vel por tenant (flag off)`.

---

# â¬œ IA-28 â€” Perfil de comunicaÃ§Ã£o (formal â†” coloquial â†” tÃ©cnico)

**Objetivo:** a IA adapta o TOM ao cliente â€” UM Ãºnico eixo (decisÃ£o anti-creepy
registrada: nada de perfil psicolÃ³gico); perfil visÃ­vel e com opt-out no cadastro do
cliente. HeurÃ­stica TS pura, ZERO LLM.
**Flags:** `COMM_PROFILE_ENABLED` / client `commprofile`.
**Depende de:** IA-05 âœ“ (composer), IA-27 âœ“ (o perfil persiste como FEATURE).

**Auditoria:** o registry aceita feature textual (`FeatureValue = number|string|null`,
`feature-registry.ts:55`) â€” ZERO tabela nova. Mecanismo de sufixo no `systemContext`
jÃ¡ existe (IA-14 idioma, `generate.node.ts`) â€” mesmo ponto. Cache semÃ¢ntico precisa
ser desabilitado quando hÃ¡ sufixo personalizado (padrÃ£o IA-14; auditar
`isEligibleForCache`, `semantic-cache.service.ts:147`).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/ml/comm-style.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `packages/db/src/migrations/0XX_comm_optout.sql` â†’ `ALTER TABLE customers ADD COLUMN IF NOT EXISTS comm_profile_opt_out BOOLEAN NOT NULL DEFAULT FALSE;` |
| MODIFICAR | `feature-registry.ts` (+ `comm_style` value_text, `comm_style_confidence`; ttl 24h) |
| MODIFICAR | `feature-store.service.ts` (`computeAllForTenant` computa das Ãºltimas 50 msgs/cliente â€” query em batch, nÃ£o N+1) |
| MODIFICAR | `generate.node.ts` (sufixo condicionado) Â· `public-flags.ts` (`commprofile`) |

`inferCommStyle(messages: string[])` â†’ `{style: 'formal'|'coloquial'|'tecnico',
confidence: 0..1}` â€” sinais: % de emoji/internetÃªs ("vc","blz","pq","mn") â†’ coloquial;
termos tÃ©cnicos ("pppoe","onu","latÃªncia","ip fixo","dns","roteador em bridge") â†’
tÃ©cnico; senÃ£o formal. Listas CONSTANTES no arquivo. <10 msgs â†’ formal com
confidence 0.
`generate.node.ts`: flag on + `!opt_out` + confidence â‰¥0.6 â†’ sufixo (3 strings EXATAS,
RN14): **"Tom da conversa: o cliente se comunica de forma informal; seja leve, use
frases curtas, evite jargÃ£o."** / **"...de forma tÃ©cnica; pode usar termos de rede com
precisÃ£o."** / **"...de forma formal; trate por senhor/senhora e evite gÃ­rias."**

### Frontend
MODIFICAR a pÃ¡gina de DETALHE do cliente do legado (auditar o arquivo real nas 22
pÃ¡ginas â€” `AUDITORIA_FRONTEND.md`; RELER INTEIRA antes â€” RN9): card **"ComunicaÃ§Ã£o"**
com badge do estilo (slate) + `ConfidenceMeter` + Switch **"Adaptar tom
automaticamente"** (desligar = opt-out; toast **"A IA volta ao tom padrÃ£o com este
cliente."**). MicrocÃ³pia LGPD: **"Estimado pelo estilo de escrita das mensagens deste
cliente. Nenhum dado Ã© compartilhado."** SEM tela no hub (RN12 via pÃ¡gina do cliente;
log).

### Testes
comm-style: fixtures dos 3 estilos + <10 msgs â†’ formal/0; worker grava a feature;
generate: opt-out â†’ sem sufixo; confidence 0.5 â†’ sem sufixo; cache semÃ¢ntico nÃ£o
cacheia com sufixo presente; flag off â†’ snapshot do systemContext idÃªntico.

### CritÃ©rios de aceite
- [ ] Staging: cliente com histÃ³rico "vc pode ver isso pra mim? blz" â†’ resposta
      perceptivelmente informal (print antes/depois).
- [ ] Opt-out na tela â†’ prÃ³xima resposta volta ao padrÃ£o (e2e).
- [ ] Flag off: zero mudanÃ§a (snapshot).
**Rollback:** flags off. **Commit:** `feat(ia28): perfil de comunicaÃ§Ã£o 1-eixo com opt-out (flag off)`.

---

# â¬œ IA-36 â€” Edge inference (triagem na borda, modo shadow)

**Objetivo:** classificar intent na borda (Cloudflare Workers AI,
`@cf/meta/llama-3.1-8b-instruct` â€” conferir o modelo vigente NO DIA) â€” SÃ“ assume a
triagem depois de concordÃ¢ncia â‰¥85% com o central medida em SHADOW. Esta sessÃ£o
implementa o shadow + painel; o cutover Ã© decisÃ£o futura com o nÃºmero na mÃ£o.
**Flags:** env `EDGE_INFERENCE_MODE` enum `off|shadow` (o valor `active` NÃƒO existe
nesta sessÃ£o â€” honestidade de escopo) / client `edge`.

**Auditoria:** alvo = `classifyIntent` (`vercel-ai.service.ts:176`, gpt-4o-mini via
`withFailover('mini')`, schema `CustomerIntentSchema:54` â€” 7 intents + urgency +
sentiment). Workers AI expÃµe REST
`https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/ai/edge-classifier.ts` (+ `.test.ts`) |
| CRIAR | `packages/db/src/migrations/0XX_edge_shadow.sql` |
| MODIFICAR | `vercel-ai.service.ts` (`classifyIntent`: shadow fire-and-forget) |
| CRIAR | `GET /ia/edge/agreement` em `apps/api/src/domain/ia/edge.routes.ts` (+ teste) |
| MODIFICAR | `env.validator.ts` (`CF_ACCOUNT_ID?`, `CF_AI_API_TOKEN?`, `EDGE_INFERENCE_MODE`) Â· `public-flags.ts` (`edge`) |

Migration: `edge_shadow_results(id uuid pk, tenant_id, message_hash text NOT NULL,
central_intent text NOT NULL, edge_intent text, agree boolean, edge_ms int, created_at
timestamptz DEFAULT now())` + RLS 023. **SEM o texto da mensagem â€” sÃ³ hash (LGPD).**
Regras: 1. `classifyAtEdge(message, history)`: REST com timeout 2s; prompt curto
pedindo JSON do MESMO enum de 7 intents; parse defensivo (JSON invÃ¡lido â†’ null, conta
como discordÃ¢ncia `edge_intent=null`). 2. Shadow NUNCA bloqueia nem atrasa o caminho
central: fire-and-forget em paralelo, `.catch` â†’ warn. 3. Sem env CF â†’ shadow vira
no-op com warn 1x no boot.

### Frontend
MODIFICAR `AIObservabilityPage` â€” card **"Triagem na borda"**: taxa de concordÃ¢ncia
(mono %, RiskBadge â‰¥85% baixo / â‰¥70% mÃ©dio / abaixo alto), latÃªncia mÃ©dia edge Ã—
central (mono), barras por intent. MicrocÃ³pia: **"O modelo de borda sÃ³ assume a
triagem quando concordar com o central em pelo menos 85% por 14 dias."** SEM tela
prÃ³pria (RN12; log).

### Testes
Parse defensivo (JSON lixo â†’ null, nÃ£o explode); shadow nÃ£o atrasa o central (fake
timers: central resolve antes do edge); `agree` correto; sem env â†’ no-op; hash no
insert (nunca o texto â€” teste com grep no payload do mock).

### CritÃ©rios de aceite
- [ ] 100 mensagens em staging â†’ `SELECT count(*), avg(agree::int)` colado no log;
      painel bate com a query.
- [ ] p95 do `classifyIntent` central INALTERADO com shadow on (comparar logs).
- [ ] Zero PII na tabela (SELECT no log).
**Rollback:** `EDGE_INFERENCE_MODE=off`. **Commit:** `feat(ia36): edge inference em shadow + painel de concordÃ¢ncia (off)`.

---

# â¬œ IA-35 â€” OrÃ§amento de latÃªncia por nÃ³

**Objetivo:** p95 por nÃ³ do grafo contra budgets DECLARADOS; estouro â†’ notificaÃ§Ã£o.
Nota de realismo mantida: nÃ£o existe "speculative decoding" sobre a API da OpenAI â€”
o ganho vem de MEDIR e atacar o nÃ³ certo.
**Flags:** `LATENCY_BUDGET_ENABLED` / client `latency`.
**Depende de:** IA-32 (os spans sÃ£o a fonte).

**Auditoria/decisÃ£o registrada:** em vez de CONSULTAR o backend OTLP (acoplamento a
Tempo/Jaeger), o `withSpan` da IA-32 ganha um hook `onEnd` que alimenta agregado local
barato: rolling 24h no Redis + fechamento diÃ¡rio em Postgres. NotificaÃ§Ãµes = tabela
`notifications` (016; auditar o insert padrÃ£o, mesmo caminho da IA-33).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/observability/latency-budget.ts` (+ `.test.ts`) |
| CRIAR | `packages/db/src/migrations/0XX_node_latency.sql` |
| MODIFICAR | `otel-span.helper.ts` (hook `onEnd` â†’ `recordNodeLatency` quando flag on) |
| MODIFICAR | `packages/queue/src/workers/drift.worker.ts` (**decisÃ£o registrada:** job `latency-rollup` no cron 04h do drift â€” NÃƒO criar 14Âº worker) |
| CRIAR | `GET /ia/latency/report` em `apps/api/src/domain/ia/latency.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`latency`) |

`BUDGETS_MS` exportado (valores INICIAIS â€” recalibrar com 7d de dados reais, registrar):
`classify 800 Â· guardrails 50 Â· decide_source 20 Â· fetch_context 1200 Â· grade_context
700 Â· rewrite_query 700 Â· generate 6000 Â· self_check 900 Â· validate 20 Â· safety_veto
900 Â· escalate 100` (+ `constitutional_review 900` se a IA-39 jÃ¡ rodou â€” conferir o
grafo no dia). Migration: `node_latency_daily(node text, day date, p50 numeric, p95
numeric, count int, PRIMARY KEY (node, day))` â€” agregado GLOBAL de infra, sem
tenant_id/RLS; acesso sÃ³ admin (decisÃ£o registrada). Estouro: p95(7d) > budgetÃ—1.2 â†’
notificaÃ§Ã£o com dedupe 1/dia por nÃ³.

### Frontend
MODIFICAR `AIObservabilityPage` â€” seÃ§Ã£o **"LatÃªncia por nÃ³"**: barras horizontais
(Recharts) p95 vs budget (o excedente do budget em orange), valores mono; select
24h/7d. MicrocÃ³pia: **"p95 por etapa do pipeline. O orÃ§amento Ã© a linha; o que passa
dela Ã© o que o cliente sente."** SEM tela prÃ³pria (RN12; log).

### Testes
Percentil correto (fixtures com distribuiÃ§Ã£o conhecida); estouro cria notificaÃ§Ã£o com
dedupe; flag off â†’ `onEnd` nÃ£o grava (spy no Redis); rollup idempotente (2 execuÃ§Ãµes =
mesmas linhas).

### CritÃ©rios de aceite
- [ ] 24h de staging â†’ report com p95 real dos nÃ³s (print).
- [ ] Estouro sintÃ©tico no `generate` (sleep no mock) â†’ notificaÃ§Ã£o criada (query no
      log).
- [ ] Flag off: zero escrita no Redis.
**Rollback:** flags off. **Commit:** `feat(ia35): orÃ§amento de latÃªncia p95 por nÃ³ (flag off)`.

---

# â¬œ IA-24 â€” Anomalia de rede (EWMA/z-score) + ADR ML/Python

**Objetivo:** detectar CTO com comportamento anÃ´malo (packet loss/latÃªncia fora da
banda esperada) ANTES do cliente reclamar, com estatÃ­stica TS pura; e ESCREVER a
`ADR-ml-python-service.md` (RN15) â€” a decisÃ£o de como o produto ganha um serviÃ§o
Python (Isolation Forest aqui; sobrevivÃªncia p/ LTV; SHAP real p/ churn; embeddings
de voz p/ IA-12).
**Flags:** `NETWORK_ANOMALY_ENABLED` / client `netanomaly`.
**Depende de:** IA-09 âœ“. **GATE DE DADOS:** â‰¥30 dias de `network_metrics` em staging â€”
verificar `SELECT min(collected_at) FROM network_metrics` ANTES de comeÃ§ar; sem 30d,
registrar o bloqueio no PROGRESS_LOG e pular para a prÃ³xima da ordem.

**Auditoria:** `network_metrics` (035) â€” `metric CHECK IN ('latency_ms',
'packet_loss_pct','signal_dbm','clients_online')`, Ã­ndice `(tenant_id, cto_id, metric,
collected_at DESC)`; ingest `POST /api/v2/rede/metrics` batch atÃ© 500
(`metrics-ingest.routes.ts:25`); `cto-alert.worker.ts` roda cron 15min com threshold
FIXO de 5% packet loss + dedupe de ticket â€” a anomalia Ã© o upgrade ESTATÃSTICO desse
threshold. NotificaÃ§Ãµes: tabela `notifications` (016).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `docs/adr/ADR-ml-python-service.md` â€” status `proposed`; a DECISÃƒO Ã© do Lucas |
| CRIAR | `apps/api/src/domain/rede/anomaly.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `packages/db/src/migrations/0XX_network_anomalies.sql` |
| MODIFICAR | `packages/queue/src/workers/cto-alert.worker.ts` (flag on: alÃ©m do threshold fixo â€” MANTIDO â€”, roda detecÃ§Ã£o na janela 48h) |
| CRIAR | `GET /ia/network/anomalies?days=7` + `GET /ia/network/health` em `apps/api/src/domain/rede/anomaly.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`netanomaly`) |

ADR: contexto (4 demandas de ML que o TS nÃ£o cobre), opÃ§Ãµes (A: FastAPI sidecar no
mesmo deploy; B: serviÃ§o separado com fila; C: continuar TS-only), recomendaÃ§Ã£o A com
contrato HTTP interno + healthcheck + fallback TS (fail-open), consequÃªncias.
**Nenhuma linha de Python nesta sessÃ£o.**
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
('medio','alto')), created_at timestamptz DEFAULT now())` + RLS 023. Severity: zâ‰¥3
mÃ©dio, zâ‰¥4 alto. Worker: anomalia â†’ grava + notificaÃ§Ã£o com dedupe 6h por
(cto, metric); flag off â†’ byte a byte o worker atual.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/NetworkHealthPage.tsx` (+ teste) |
| MODIFICAR | hub (key `netanomaly`, "SaÃºde da Rede", "Anomalias estatÃ­sticas por CTO antes do cliente reclamar.", Ã­cone `HeartPulse`, `/intelligence/network-health`) Â· App.tsx Â· pt-br.ts |

Grid de `RiskStripeCard` por CTO com anomalia ativa (mÃ©trica, valor vs esperado mono,
"hÃ¡ 2h") + LineChart da mÃ©trica com banda EWMA sombreada e pontos anÃ´malos marcados +
link Ghost **"Ver impacto"** â†’ `/intelligence/graph` (IA-16, aba Impacto). Vazio:
**"Rede dentro do esperado."** / **"Nenhuma anomalia nas Ãºltimas 24 horas."** (sem
botÃ£o). Erro: padrÃ£o IA-21.

### Testes
ewma/zscore: sÃ©rie com degrau â†’ detecta; ruÃ­do gaussiano â†’ nÃ£o detecta; `minPoints`
respeitado (47 pontos â†’ vazio); worker flag off inalterado (snapshot de chamadas);
dedupe 6h; severity nos cortes.

### CritÃ©rios de aceite
- [ ] InjeÃ§Ã£o sintÃ©tica em staging (batch com packet_loss 3Ïƒ acima) â†’ anomalia +
      notificaÃ§Ã£o (queries no log).
- [ ] Falsos positivos controlados: 7d de dados reais â†’ â‰¤2 anomalias/dia/tenant
      (senÃ£o subir zThreshold; registrar a calibraÃ§Ã£o no log).
- [ ] ADR commitada, linkada no PROGRESS_LOG, decisÃ£o marcada como pendente do Lucas.
- [ ] RN8 completo.
**Rollback:** flags off. **Commit:** `feat(ia24): anomalia de rede ewma/z-score + ADR ml-python (flag off)`.

---

# â¬œ IA-25 â€” Forecast de demanda (staffing)

**Objetivo:** prever o volume de tickets 14 dias Ã  frente (mÃ©dia mÃ³vel sazonal por
dia-da-semana sobre DuckDB) e traduzir em staffing sugerido. Prophet/Python sÃ³ via ADR
aprovada (IA-24).
**Flags:** `DEMAND_FORECAST_ENABLED` / client `forecast`.
**Depende de:** IA-24 (ADR escrita). **Gate de dados:** â‰¥60d de tickets no DuckDB.

**Auditoria:** DuckDB REAL â€” `duckdb.service.ts` (`getDuckDB:20`); ETL jÃ¡ sincroniza
`syncTickets` (`etl.service.ts:133`) e `syncMessages:67`, com rota admin
`POST /api/v2/admin/etl/sync` (`etl.routes.ts:6`); schema em `analytics.schema.ts:8`.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/ml/forecast.ts` (+ `.test.ts`) â€” PURO |
| CRIAR | `apps/api/src/domain/ia/forecast.routes.ts` (+ teste) â€” `GET /ia/forecast/demand?days=14` |
| MODIFICAR | `env.validator.ts` (`AGENT_CAPACITY_PER_DAY?` default 25) Â· `public-flags.ts` (`forecast`) |

```ts
// forecast.ts
export function seasonalMovingAverage(daily: {date: string; count: number}[], horizon = 14):
  { date: string; forecast: number; low: number; high: number }[];
// mÃ©dia das Ãºltimas 4 ocorrÃªncias do mesmo dia-da-semana Ã— fator de tendÃªncia
// (mÃ©dia 14d Ã· mÃ©dia 28d, clamp 0.7..1.3); IC = Â±1.5Ã—desvio dos resÃ­duos.
export function suggestStaffing(forecast: number, perAgentPerDay: number): number; // ceil
```
Rota: lÃª a sÃ©rie agregada por dia do DuckDB; <60d de histÃ³rico â†’ `409 {error, hint:
"Rode a sincronizaÃ§Ã£o de analytics e acumule histÃ³rico."}`.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/StaffingPage.tsx` (+ teste) |
| MODIFICAR | hub (key `forecast`, "PrevisÃ£o de Demanda", "Quantos atendimentos vÃªm aÃ­ â€” e quanta gente precisa.", Ã­cone `TrendingUp`, `/intelligence/staffing`) Â· App.tsx Â· pt-br.ts |

BarChart: 28d passados (slate) + 14d previstos (fiber, IC como Ã¡rea) + `DataTablePro`
(Dia Â· Dia da semana Â· Previsto com IC (mono) Â· Atendentes sugeridos (mono)) + StatCard
**"Pico previsto"**. Nota metodolÃ³gica: **"MÃ©dia sazonal por dia da semana com
tendÃªncia. PrevisÃµes sÃ£o estimativas â€” confie mais no intervalo do que no ponto."**
Vazio/409: **"HistÃ³rico insuficiente para prever."** / **"SÃ£o necessÃ¡rios 60 dias de
tickets sincronizados."** + botÃ£o Secondary **"Sincronizar analytics"** (dispara a
rota de ETL existente).

### Testes
forecast puro: sÃ©rie sintÃ©tica com sazonalidade semanal â†’ o padrÃ£o aparece na
previsÃ£o; tendÃªncia clampada em 0.7/1.3; IC cresce com o ruÃ­do; staffing arredonda
para cima; rota: <60d â†’ 409.

### CritÃ©rios de aceite
- [ ] Backtest no log: treinar atÃ© dâˆ’14 e comparar com o real â€” MAPE â‰¤30% em staging
      (registrar o nÃºmero; se pior, registrar e ajustar janelas).
- [ ] Tela com dado real (print).
- [ ] Flag off: tela fora do DOM; zero rota nova exposta sem flag server.
**Rollback:** flags off. **Commit:** `feat(ia25): forecast sazonal de demanda + staffing (flag off)`.

---

# â¬œ IA-13 â€” Speech analytics QA (scorecard de 100% das chamadas)

**Objetivo:** toda chamada de voz ganha transcript PERSISTIDO + scorecard automÃ¡tico
(rubrica ISP de 6 critÃ©rios via gpt-4o-mini) + tela `/intelligence/voice-qa`. Ã‰ a
PRIMEIRA sessÃ£o de voz da Fase 2: cria a persistÃªncia que IA-40 e IA-12 usam.
**Flags:** `VOICE_QA_ENABLED` / client `voiceqa`.
**Depende de:** IA-08 A1+A2 âœ“. IA-08 A3 (identificaÃ§Ã£o) CONCLUÍDA em 2026-07-09 â€”
`voice-stream.routes.ts` agora passa `customer_id` real da FSM para `persistCall`
(antes gravava `customer_id` NULLABLE quando a identificaÃ§Ã£o estava pendente).

**Auditoria:** `RealtimeBridge` (`realtime-bridge.service.ts:60`) jÃ¡ troca eventos com
a OpenAI Realtime â€” os eventos de transcriÃ§Ã£o
(`conversation.item.input_audio_transcription.completed` /
`response.audio_transcript.done` â€” conferir os nomes na versÃ£o instalada NO DIA)
passam pelo bridge e HOJE sÃ£o descartados. `voice-call.ts` tem a mÃ¡quina de estados
(`transition:31`, `initialCall:68`). NADA de chamada Ã© persistido hoje (auditado:
zero tabela de voz). `BridgeDeps` (:50) Ã© seam injetÃ¡vel â€” estender por ele.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_voice_calls.sql` |
| MODIFICAR | `realtime-bridge.service.ts` (`BridgeDeps` + `onTranscript?: (turn) => void`; flag on â†’ acumula e persiste no fim da chamada, fire-and-forget) |
| MODIFICAR | `prompt-registry.ts` (PromptId `voice_qa` + rubrica de 6 critÃ©rios) |
| CRIAR | `apps/api/src/domain/atendimento/voice-qa.service.ts` (+ `.test.ts`) |
| CRIAR | `packages/queue/src/workers/voice-qa.worker.ts` (fila sob demanda, padrÃ£o `replay.worker.ts` â€” sem cron; job enfileirado no fim da chamada) |
| CRIAR | `GET /ia/voice/calls` + `GET /ia/voice/calls/:id` em `apps/api/src/domain/ia/voice.routes.ts` (+ teste) |
| MODIFICAR | `public-flags.ts` (`voiceqa`) |

Migration: `voice_calls(id uuid pk, tenant_id, customer_id uuid NULL, phone_last4
text, phone_hash text, started_at, ended_at, duration_s int, status text)` +
`voice_transcripts(id uuid pk, call_id uuid REFERENCES voice_calls(id) ON DELETE
CASCADE, tenant_id, role text CHECK (role IN ('customer','agent')), content text,
t_offset_ms int)` + `voice_scorecards(call_id uuid PRIMARY KEY REFERENCES
voice_calls(id), tenant_id, total int, criteria jsonb, model text, created_at)` + RLS
023. **Telefone NUNCA em claro: sÃ³ last4 + hash.**
Rubrica (6 critÃ©rios fixos, 0-100 + justificativa cada): saudaÃ§Ã£o identificou o
provedor Â· confirmou o problema Â· linguagem clara sem jargÃ£o Â· resolveu ou encaminhou
corretamente Â· confirmou a resoluÃ§Ã£o com o cliente Â· despedida com prÃ³ximos passos.
`scoreCall(callId)`: transcript â†’ generateObject (schema Zod dos 6), UseCase
`voice-qa` (RN7), fail-open.

### Frontend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `src/pages/intelligence/VoiceQaPage.tsx` (+ teste) |
| MODIFICAR | hub (key `voiceqa`, "Qualidade de Voz", "Scorecard automÃ¡tico de todas as chamadas.", Ã­cone `PhoneCall`, `/intelligence/voice-qa`) Â· App.tsx Â· pt-br.ts |

Lista (`DataTablePro`: Quando Â· DuraÃ§Ã£o (mono) Â· Telefone (â€¢â€¢â€¢1234) Â· Nota (mono;
signal â‰¥80 / amber â‰¥60 / orange abaixo)) â†’ detalhe: RadarChart (Recharts) dos 6
critÃ©rios + `TimelineList` do transcript (cliente/agente alternados, offset mono) +
card com a justificativa por critÃ©rio. Vazio: **"Nenhuma chamada analisada."** /
**"As chamadas aparecem aqui quando o atendimento por telefone estiver ativo
(VOICE_ENGINE=mvp)."**

### Testes
Bridge: `onTranscript` chamado nos eventos (fixtures de evento Realtime); persistÃªncia
agrupa por chamada e ordena por offset; `scoreCall`: schema vÃ¡lido, total coerente com
os critÃ©rios; telefone mascarado SEMPRE (teste que FALHA se nÃºmero completo aparecer
em qualquer insert); pÃ¡gina renderiza radar do fixture.

### CritÃ©rios de aceite
- [ ] Chamada real em staging (`VOICE_ENGINE=mvp`) â†’ transcript + scorecard no banco e
      na tela (prints).
- [ ] Cobertura 100%: 5 chamadas â†’ 5 scorecards (query no log).
- [ ] Custo por chamada visÃ­vel no Helicone (`voice-qa`).
- [ ] Flag off: bridge byte a byte (zero persistÃªncia; snapshot).
**Rollback:** flags off. **Commit:** `feat(ia13): speech qa â€” transcript persistido + scorecard por rubrica (flag off)`.

---

# â¬œ IA-40 â€” PII em voz (mascarar ANTES de persistir)

**Objetivo:** transcripts de voz nunca persistem PII em claro: CPF, telefone, e-mail,
cartÃ£o DITADOS sÃ£o mascarados antes do INSERT (LGPD by design), com marcaÃ§Ã£o visÃ­vel
na tela.
**Flags:** `VOICE_PII_MASK_ENABLED` / client `voicepii`.
**Depende de:** IA-13 (o ponto ÃšNICO de persistÃªncia criado lÃ¡).

**Auditoria:** detector REAL jÃ¡ existe e Ã© puro â€” `detectAndMaskPII`
(`pii-detector.service.ts:82`), `PIIType:34`, `maskPII:127` â€” REUSAR (R5). Risco
especÃ­fico de voz: nÃºmero DITADO pode virar "um dois trÃªs quatro..." â€” a transcriÃ§Ã£o
da Realtime normalmente normaliza para dÃ­gitos (CONFIRMAR em staging), mas cobrir a
variante por extenso Ã© escopo desta sessÃ£o.

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| MODIFICAR | `pii-detector.service.ts` (+ `spokenNumbersToDigits(text)` pt-BR pura exportada: "um dois trÃªs"â†’"123", "meia"â†’"6"; aplicada SÃ“ com opÃ§Ã£o `{spoken: true}` â€” snapshot dos consumidores atuais INALTERADO) |
| MODIFICAR | ponto de persistÃªncia da IA-13 (pipeline: turno â†’ flag on â†’ `detectAndMaskPII(turn, {spoken:true})` â†’ INSERT do MASCARADO + `pii_entities` (tipos + offsets pÃ³s-mÃ¡scara; NUNCA o valor original)) |
| CRIAR | `packages/db/src/migrations/0XX_voice_pii.sql` â†’ `ALTER TABLE voice_transcripts ADD COLUMN IF NOT EXISTS pii_entities JSONB;` |
| CRIAR | `apps/api/scripts/mask-existing-transcripts.ts` (one-shot retroativo, idempotente) |
| MODIFICAR | `public-flags.ts` (`voicepii`) |

### Frontend
MODIFICAR `VoiceQaPage` â€” trecho mascarado renderiza chip slate **`[CPF]`** /
**`[telefone]`** com tooltip **"Removido automaticamente antes de salvar (LGPD)."**;
contador no detalhe: **"3 dados pessoais mascarados nesta chamada."** SEM tela prÃ³pria
(RN12 via VoiceQaPage; log).

### Testes (a suÃ­te crÃ­tica)
CPF ditado por extenso mascarado; telefone com DDD; e-mail com "arroba"; falso
positivo controlado: protocolo de 8 dÃ­gitos NÃƒO mascara (regra: sÃ³ padrÃµes com
validaÃ§Ã£o estrutural â€” CPF com dÃ­gito verificador); snapshot dos consumidores atuais
do detector inalterado; o INSERT nunca contÃ©m o original (teste no seam); script
retroativo 2Ã— = mesmo resultado.

### CritÃ©rios de aceite
- [ ] Chamada staging ditando um CPF â†’ banco SEM o CPF (SELECT no log) e chip na tela
      (print).
- [ ] `{spoken:true}` nÃ£o ativa no caminho WhatsApp/texto (snapshot).
- [ ] Script retroativo idempotente provado no log.
**Rollback:** flag off para NOVAS chamadas (recomendaÃ§Ã£o registrada: manter ON).
**Commit:** `feat(ia40): mÃ¡scara de pii em transcripts de voz antes de persistir (flag off)`.

---

# â¬œ IA-12 â€” Voice biometrics (trilho com consentimento LGPD)

**Objetivo:** cliente que CONSENTIU tem identidade reforÃ§ada na chamada; badge
"verificado por voz". **Honestidade tÃ©cnica registrada:** a API Realtime NÃƒO expÃµe
speaker embeddings; embedding real (resemblyzer/pyannote) Ã© Python â†’ depende da ADR
(IA-24) IMPLEMENTADA. Esta sessÃ£o entrega o TRILHO completo: consentimento,
verificaÃ§Ã£o por desafio de conhecimento (fallback), port de verificaÃ§Ã£o com adapter
`null` â€” zero Python.
**Flags:** `VOICE_BIOMETRICS_ENABLED` / client `voicebio`.
**Depende de:** IA-08 A3 (identificaÃ§Ã£o â€” E2, CONCLUÍDA 2026-07-09) + IA-13 âœ“ + ADR (IA-24).

**Auditoria:** `CustomerIdentifier` jÃ¡ Ã© seam injetÃ¡vel do bridge
(`realtime-bridge.service.ts:45` â€” `(ctx: {cpf?, phone?}) => Promise<string|null>`);
nenhuma tabela de consentimento existe (auditar colunas de `customers` NO DIA).

### Backend
| AÃ§Ã£o | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/0XX_voice_biometry.sql` |
| CRIAR | `apps/api/src/domain/atendimento/voice-verify.port.ts` (+ adapter `nullVoiceVerify` + teste) |
| MODIFICAR | integraÃ§Ã£o A3 do bridge (identificado + consentiu â†’ `verify()`; `'unavailable'` â†’ desafio de conhecimento via prompt `voice_identity` no registry: confirmar data de nascimento OU 3 primeiros dÃ­gitos do CPF ANTES de dados sensÃ­veis) |
| CRIAR | `POST /ia/voice/consent` + `DELETE /ia/voice/consent/:customerId` em rotas de voz (+ teste) |
| MODIFICAR | `prompt-registry.ts` (`voice_identity`) Â· `public-flags.ts` (`voicebio`) |

Migration: `voice_biometry_consents(customer_id uuid PRIMARY KEY, tenant_id,
consented_at timestamptz NOT NULL, consent_channel text, revoked_at timestamptz)` +
`voice_prints(customer_id uuid PRIMARY KEY, tenant_id, print bytea, model_version
text, created_at)` + RLS 023. `print` Ã© OPACO (gerado pelo serviÃ§o Python futuro);
sem pgvector novo.
```ts
export interface IVoiceVerifyPort {
  enroll(callId: string, customerId: string): Promise<'ok' | 'unavailable'>;
  verify(callId: string, customerId: string): Promise<{ verified: boolean; confidence: number } | 'unavailable'>;
}
```
**LGPD:** revogaÃ§Ã£o (`DELETE`) apaga `voice_prints` imediatamente (art. 18); sem
consentimento, `verify()` NUNCA Ã© chamado.

### Frontend
Badge **"Verificado por voz"** (signal) / **"Identidade por desafio"** (slate) no
detalhe da chamada (VoiceQaPage); card de consentimento no cadastro do cliente
(Switch + microcÃ³pia: **"Com o consentimento, a voz do cliente reforÃ§a a identificaÃ§Ã£o
nas chamadas. RevogÃ¡vel a qualquer momento; o registro de voz Ã© apagado na
revogaÃ§Ã£o."**). SEM tela prÃ³pria (RN12; log).

### Testes
Sem consentimento â†’ `verify` NUNCA chamado (spy â€” o teste mais importante); revogaÃ§Ã£o
apaga `voice_prints` (mock verifica delete); adapter null â†’ fluxo cai no desafio;
contrato do port respeitado.

### CritÃ©rios de aceite
- [ ] e2e staging (com A3): cliente sem consentimento â†’ desafio de conhecimento no
      Ã¡udio (transcript no log).
- [ ] Consentir â†’ revogar â†’ SELECT prova `voice_prints` vazio.
- [ ] Zero Python nesta sessÃ£o; adapter HTTP sÃ³ nasce com a ADR implementada.
**Rollback:** flags off. **Commit:** `feat(ia12): trilho de biometria de voz â€” consentimento + desafio + port (flag off)`.

---

# ðŸ”’ IA-18 â€” A2A protocol (GATED)

**GATE (nÃ£o agendar atÃ© TODOS):** (a) cutover `ATENDIMENTO_ENGINE=v2` estÃ¡vel â‰¥30d;
(b) IA-10 multi-agent com trÃ¡fego real; (c) existir um parceiro/agente externo
CONCRETO para interoperar â€” sem contraparte, Ã© especulaÃ§Ã£o.
**Objetivo (quando abrir):** expor o agente Astrum como agente A2A (Agent Card em
`/.well-known/agent.json`, tasks com lifecycle submittedâ†’workingâ†’completed via
JSON-RPC) para agentes externos (ERP, marketplace de ISPs) delegarem/receberem tarefas.
**Esqueleto jÃ¡ auditado:** auth por API key generaliza a da IA-17 (`mcp_api_keys` â†’
`agent_api_keys`); a fronteira read-only/side-effect (E4) vale idÃªntica; o supervisor
da IA-10 (`buildMultiAgentGraph`, `multi-agent.supervisor.ts:77`; domÃ­nios
`atendimento|cobranca|retencao|escalation` em `multi-agent.state.ts:11`) Ã© o executor
natural de uma task A2A.
**Ao abrir o gate:** rodar uma mini-sessÃ£o de expansÃ£o (padrÃ£o IA-F2-PLAN) auditando a
spec A2A VIGENTE â€” ela muda rÃ¡pido; detalhar hoje apodrece.
**Flags:** `A2A_ENABLED` / client `a2a`. **Commit futuro:** `feat(ia18): a2a server mÃ­nimo (flag off)`.

---

# ðŸ”’ IA-20 â€” Multi-agent debate (GATED)

**GATE:** (a) IA-10 com trÃ¡fego real (pÃ³s-cutover); (b) regra de custo definida pelo
Lucas: debate = ~3Ã— chamadas full â€” sÃ³ para decisÃµes acima de um limiar (ex.:
suspensÃ£o de cliente com MRR â‰¥ R$200; desconto de retenÃ§Ã£o >20%).
**Objetivo (quando abrir):** decisÃµes FINANCEIRAS de alto valor passam por debate:
agente-prÃ³ e agente-contra (gpt-4o, 1 rodada cada) + juiz (gpt-4o) â†’ decisÃ£o final com
os votos GRAVADOS no audit trail imutÃ¡vel.
**Esqueleto jÃ¡ auditado:** `ai_decision_log` (035) tem `decision_type CHECK IN
('agent_response','escalation','tool_call','block')` â†’ precisarÃ¡ de migration
`ALTER TABLE ... DROP CONSTRAINT / ADD CHECK` incluindo `'debate_vote'` (as RULEs
`no_update`/`no_delete` nÃ£o impedem ALTER â€” ok, E6); writer canÃ´nico =
`recordDecision` (`ai-audit.service.ts:115`, hash-chain com `computeHash:44` e
`verifyChain:58`); UI: `TimelineList` (IA-11) pronta para a tela
`/intelligence/decisions`.
**Flags:** `DEBATE_ENABLED` / client `decisions`. **Commit futuro:** `feat(ia20): debate prÃ³/contra/juiz em decisÃµes financeiras (flag off)`.

---

# ðŸ”’ IA-41 â€” Federated evaluation (GATED)

**GATE:** (a) â‰¥3 tenants grandes ativos; (b) anÃ¡lise LGPD ESCRITA e aprovada pelo
Lucas (agregaÃ§Ã£o entre tenants Ã© zona sensÃ­vel â€” mesmo agregado pode vazar sinal);
(c) IA-42 rodando (a mÃ©trica federada Ã© o pass-rate do eval).
**Objetivo (quando abrir):** comparar qualidade ENTRE tenants sem mover dado bruto:
cada tenant computa agregados locais â†’ agregaÃ§Ã£o com ruÃ­do (DP, Îµ documentado) â†’
benchmark "vocÃª vs mediana anÃ´nima" no hub.
**Esqueleto jÃ¡ auditado:** todas as mÃ©tricas-fonte jÃ¡ existem POR TENANT â€” pass-rate
(eval IA-03/IA-42), taxa de veto (`GET /ia/safety/stats`, `safety.routes.ts:86`),
drift PSI (`drift_reports`, 043). O que falta Ã© decisÃ£o de produto/jurÃ­dico, nÃ£o
cÃ³digo.
**Flags:** `FEDERATED_EVAL_ENABLED` / client `fedeval`. **Commit futuro:** `feat(ia41): benchmark federado com ruÃ­do dp (flag off)`.

---

## APÃŠNDICE C â€” ARMADILHAS DE FRONTEND
Detalhe no `AUDITORIA_FRONTEND.md` Â§5. Bolso: C1 App.tsx monÃ³lito (rotas ~l.2958; nÃ£o
refatorar) Â· C2 `@/` = raiz (`@/src/...`) Â· C3 dark muda `--radius` (nunca raio fixo) Â·
C4 `--primary` dark Ã© vermelho (risco = `--astrum-*`) Â· C5 e2e Playwright aponta p/
apps/web condenado Â· C6 sem proxy vite (base URL do Fastify = padrÃ£o `auth-v2.ts`) Â·
C7 tab nova exige `canAccess` Â· C8 Sidebar colapsada (testar os 2 modos).

## APÃŠNDICE D â€” ACHADOS DA AUDITORIA DE 2026-07-05 (li o cÃ³digo por vocÃª)

- **D1 â€” Bug real:** `tools.executor.ts:24-26` tem `case 'check_invoice'` DUPLICADO
  (jÃ¡ casado na linha 18) â€” cÃ³digo morto que mascara a intenÃ§Ã£o do alias
  `get_billing_status`. Corrigir na IA-19 com teste.
- **D2 â€” Gap real:** `agentTools` (`vercel-ai.service.ts:79-112`) define 4 tools, mas o
  executor implementa 8 â€” `check_coverage`, `run_diagnostics`,
  `schedule_technical_visit` (e o alias `get_billing_status`) sÃ£o INALCANÃ‡ÃVEIS pelo
  modelo hoje. A IA-19 corrige.
- **D3 â€” Reuso obrigatÃ³rio:** `computeEquivalenceRate` (`shadow-mode.ts:73-83`) jÃ¡
  aceita judge injetÃ¡vel â€” IA-46 usa; recriar Ã© violar R5/estilo da casa.
- **D4 â€” Bug real:** `state.tokensUsed` NUNCA Ã© populado (fica 0 em todo retorno do
  grafo â€” `agent.state.ts:61` + nenhum nÃ³ escreve). IA-34 corrige capturando `usage` do
  `streamText`.
- **D5 â€” Regra de ouro do replay:** o envio WhatsApp fica no `message.worker.ts:83-88`
  (fora do grafo) â€” replay chama o grafo direto e NUNCA envia; tools de escrita em
  dry-run via decorator (IA-46).
- **D6 â€” PadrÃ£o de porta:** `cobrai-rules.service.ts` usa ports injetÃ¡veis
  (`ICobrancaDbPort`) â€” os serviÃ§os novos de cobranÃ§a (IA-26) seguem esse padrÃ£o, nÃ£o o
  de import direto do supabase.
- **D7 â€” RLS canÃ´nica:** `023_shadow_results.sql` (policy `tenant_isolation` +
  `app.current_tenant_id`) Ã© o modelo para TODA migration nova deste plano.
- **D8 â€” PreÃ§os duplicados:** `MODEL_COSTS` vive no client (`AICostsPage.tsx:23-30`) â€”
  IA-34 move a fonte para o server (`MODEL_PRICING`) e o client passa a ler `cost_usd`.

## APÃŠNDICE E â€” DÃVIDAS E ACHADOS DA AUDITORIA IA-F2-PLAN (2026-07-07 â€” li o cÃ³digo mergeado por vocÃª)

- **E1 â€” SandboxPage NÃƒO existe.** A IA-44 entregou o backend completo
  (`sandbox.routes.ts`: POST `:81`, histÃ³rico `:153`, guard super_admin `:65`), mas a
  consolidaÃ§Ã£o das sessÃµes paralelas NÃƒO trouxe `src/pages/intelligence/SandboxPage.tsx`
  nem a rota no `App.tsx` â€” o card `sandbox` do hub (BRANCH_REGISTRY) aponta para rota
  MORTA. QuitaÃ§Ã£o atribuÃ­da Ã  **IA-38** (primeira sessÃ£o de Fase 2 com UI); a spec da
  tela estÃ¡ na IA-44 da Fase 1.
- **E2 â€” IA-08 A3 CONCLUÍDA em 2026-07-09** (tools/identificaÃ§Ã£o na voz).
  Gate duro para IA-12 destravado; IA-13/IA-40 jÃ¡ tinham rodado com `customer_id`
  nullable, agora recebem o valor real quando a chamada identifica o cliente.
- **E3 â€” `churn-features.service.ts:159` usa SQL prÃ³prio** e NÃƒO o Feature Store â€” a
  nota cruzada da IA-27 nÃ£o foi aplicada porque a IA-07 rodou ANTES da IA-27.
  QuitaÃ§Ã£o na **IA-23** (com fallback fail-open).
- **E4 â€” `SIDE_EFFECT_TOOLS` vive em `replay.service.ts:76`** â€” a fonte Ãºnica deveria
  ser o registry. QuitaÃ§Ã£o na **IA-17** (mover para `tool-registry.ts` + reexport).
- **E5 â€” Migrations `035` duplicadas** (`035_ai_decision_log` + `035_network_metrics`)
  â€” heranÃ§a das sessÃµes paralelas; o runner aguenta, mas NÃƒO repetir o padrÃ£o.
  PrÃ³ximo nÃºmero livre em 2026-07-07 = `048` (RN5: conferir NO DIA).
- **E6 â€” `ai_decision_log.decision_type` tem CHECK restritivo** (4 valores) â€” a IA-20
  precisarÃ¡ de ALTER para `'debate_vote'`; as RULEs de imutabilidade nÃ£o impedem ALTER.
- **E7 â€” `metadata.language` ainda nÃ£o persiste** no `message.worker` (observaÃ§Ã£o da
  IA-14) â€” nÃ£o bloqueia nenhuma sessÃ£o da Fase 2; entra no cutover S74.
- **E8 â€” Typecheck:** 14 erros prÃ©-existentes em `packages/queue/src/workers/
  message.worker.ts` (imports relativos â€” conhecidos; NÃƒO atribuir Ã s sessÃµes novas).
- **E9 â€” PadrÃ£o `costdrill`:** flag client-only (`public-flags.ts:24`, env `undefined`
  = sempre on) â€” disponÃ­vel para flags de UI inÃ³cuas da Fase 2.
- **E10 â€” CatÃ¡logo real = 9 tools** (`agentTools`, `vercel-ai.service.ts:94-166` â€”
  as 8 da IA-19 + `query_network_graph` da IA-16). Toda sessÃ£o que adicionar tool
  (IA-22) DEVE classificÃ¡-la como read-only ou side-effect (teste da IA-17 quebra se
  nÃ£o classificar).
