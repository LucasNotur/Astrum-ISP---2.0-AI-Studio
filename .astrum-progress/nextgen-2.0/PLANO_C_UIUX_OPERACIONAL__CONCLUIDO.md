# NEXTGEN 2.0 — PLANO C — UI/UX OPERACIONAL
# "Tecnológico, limpo e bonito — sem cara de feito por IA"

> **Para a IA executora e para o Lucas.** Escrito em 2026-07-07 pela sessão NG2-PLAN
> (mesma auditoria dos Planos A/B). Contexto dado pelo Lucas: a UI atual foi
> deixada deliberadamente básica porque a IA insistia em gerar interface GENÉRICA
> ("nível IA" — qualquer um bate o olho e sabe). O objetivo agora é o oposto:
> **nível tecnológico, UI limpa e bonita**, usável com máxima eficiência pelo dono
> e por cada colaborador no seu nível de acesso, configurável por ISP e fácil de
> manter pelo dev.
>
> **✅ GATE-VISUAL LEVANTADO — 2026-07-11.**
> O Lucas confirmou que o padrão de UI já está mapeado no sistema (sessões
> anteriores com imagens de referência foram suficientes para calibrar a direção).
> As imagens eram testes; o padrão resultante já está internalizado.
> Consequências: U2/U3/U4 podem avançar sem mais espera. A Skill `astrum-design`
> pode ser criada a partir do padrão que já existe nos tokens U1-02 + direção §2b.
> A lista negra §2a continua válida (anti-genérico é permanente).

---

## §0 — PROTOCOLO E REGRAS

- Herda R1–R6 (`PLANO_MESTRE_V2__EM_ANDAMENTO.md`), RN8–RN16 (PARTE2) e RN17–RN20 (Planos A/B).
  **R1 reafirmado:** o frontend oficial é o legado (`src/pages/*`, Vite na raiz) —
  todo este plano opera NELE. `apps/web` segue condenado.
- **RN21 — Anti-genérico é lei.** Checklist de "cara de IA" (§2a) vira teste de
  revisão: qualquer tela nova/redesenhada que viole um item volta. Depois do
  GATE-VISUAL, a Skill `astrum-design` é a fonte da verdade e TODA sessão de UI a
  invoca antes de codar.
- **RN22 — Toda tela declara persona + tarefa + métrica.** Nenhuma tela é
  redesenhada "para ficar bonita": declara-se quem usa (§3), qual a tarefa nº 1,
  e a métrica de eficiência (cliques/toques/segundos até completar). Medir antes
  e depois (nem que seja manualmente, registrado no PROGRESS_LOG).
- **RN23 — Regressão visual obrigatória.** Print antes/depois (light + dark +
  mobile 375px) no PROGRESS_LOG em toda sessão de UI; testes existentes continuam
  verdes; zero regressão funcional nas 38 telas.
- **RN24 — Tokens ou nada.** Nenhum hex/px mágico em componente (armadilhas C3/C4
  continuam: dark muda `--radius`, `--primary` no dark é vermelho). Cor, espaço,
  raio, sombra e motion só via tokens (§U1). Lint automatizado (U1-04).

---

## §1 — DIAGNÓSTICO DO FRONTEND REAL (auditado 2026-07-07)

| Fato | Número | Implicação |
|---|---|---|
| Páginas legadas (`src/pages/*.tsx`) | 28 | + 10 em `pages/intelligence/` = **38 telas** |
| `App.tsx` | **5.903 linhas** | Monólito (C1); rotas ~l.2958+; refatorar é pré-condição de manutenibilidade (U1-01) |
| Componentes shadcn (`components/ui/`) | 18 | Base sólida; faltam padrões de página (U1-03) |
| Componentes próprios | `intelligence/` (7, IA-11) + `layout/` | O design system Astrum-IA (§1 da PARTE2) já nasceu — expandir, não recriar |
| Tokens `--color-astrum-*` + `--font-display` | 7 no `index.css` | Fundação de identidade existe (signal/fiber/amber/orange/red/slate + Space Grotesk) |
| Páginas SEM nenhum breakpoint (`sm:/md:/lg:`) | **7 de 28** | Não responsivas — lista exata sai na U0 |
| Acesso por papel | `rbac`: super_admin/admin/operator/viewer · `canAccess` no `useAppStore` (C7) | A UI por persona (§3) tem onde se pendurar |
| Colaboração | `ticket-collab.service.ts` (CRDT/Yjs) no backend | Presença/colaboração ao vivo já tem motor — falta UI (§5) |
| E2E | Playwright aponta para `apps/web` condenado (C5) | Corrigir na U7 |
| Dark mode | Existe, com armadilhas C3/C4 | Vira cidadão de primeira classe na U1 |

Dívidas de frente (Apêndice C da PARTE2) que este plano ATACA em vez de contornar:
C1 (monólito), C3/C4 (tokens dark), C5 (e2e errado), C8 (sidebar 2 modos).

---

## §2 — DIREÇÃO DE DESIGN: "TECNOLOGIA LIMPA" (hipótese até o GATE-VISUAL)

### 2a. A lista negra — o que denuncia UI feita por IA (RN21, proibido)
1. Gradiente roxo/azul genérico em hero, botão ou fundo.
2. Emoji como ícone de feature ou título.
3. Grid de 3 cards idênticos com ícone em círculo colorido + título + frase.
4. Hero centrado com headline gigante e subtítulo motivacional.
5. Sombra difusa grande em tudo; glassmorphism gratuito.
6. Raio de borda grande e uniforme em todo elemento (cara de template).
7. Paleta default do shadcn/Tailwind intocada; roxo `#8B5CF6` em geral.
8. Texto de marketing vazio ("Potencialize seu negócio") dentro do produto.
9. Ilustrações 3D genéricas de banco de imagem.
10. Espaçamento inflado (padding gigante, densidade de brochura, não de ferramenta).

### 2b. A direção — o que buscar (a calibrar com as imagens do Lucas)
- **Ferramenta profissional, não site.** Densidade de informação de quem trabalha
  8h na tela (referências de classe: Linear, Grafana, painéis de NOC) — o dado é o
  protagonista, o chrome desaparece.
- **Número é herói:** JetBrains Mono já é o padrão para todo número medido (§1
  PARTE2); hierarquia por PESO e cor, não por tamanho inflado.
- **Grid rígido** 4/8px; bordas 1px hairline e separadores no lugar de sombra;
  raio via token, contido.
- **Cor com função, nunca decoração:** a paleta de risco astrum (signal/amber/
  orange/red/slate) é a linguagem; acento tecnológico (fiber `#3D5AFE`) usado com
  parcimônia cirúrgica.
- **Space Grotesk display** para títulos e números-herói (já carregada) — é o
  "tecnológico"; Inter para o corpo — é o "limpo".
- **Dark mode de verdade** (não inversão): operador de NOC/atendimento vive no
  escuro; decidir no gate se dark é o DEFAULT do produto.
- **Motion funcional:** <200ms, só para orientar (entrada de painel, confirmação);
  nunca decorativo. `prefers-reduced-motion` respeitado (RN13).
- **Microdetalhe é a assinatura:** estados de foco visíveis, skeletons fiéis ao
  layout final, empty states com AÇÃO (padrão IA-11 já exige), toasts sóbrios.

### 2c. Materialização do gate
Sessão U2 recebe as imagens → extrai: paleta final, densidade, raio, sombra,
iconografia, tom de microcópia visual → **cria a Skill `astrum-design`**
(via skill-creator) contendo: princípios, tokens finais, 3 exemplos bons e 3 maus
(prints), checklist RN21 expandido, e receitas por tipo de tela (lista, detalhe,
dashboard, form, console). Toda sessão de UI futura ABRE com essa skill — é assim
que o padrão "se mantém sempre", como o Lucas pediu.

---

## §3 — PERSONAS × SUPERFÍCIES × EFICIÊNCIA (RN22)

| Persona (papel RBAC) | Vive em | Tarefa nº 1 | Métrica de eficiência |
|---|---|---|---|
| **Dono/gestor** (admin/owner) | Dashboard de valor (P5-01), CFO virtual (D-08 futuro), relatórios | "Como está minha operação HOJE? Onde ajo?" | 1 tela, zero clique para a resposta do dia |
| **Atendente** (operator) | Inbox unificada (P2-04) | Resolver conversa com contexto | Conversas/hora; cliques até 1ª resposta ≤2 |
| **Financeiro/cobrança** (operator) | Cobrança, campanhas (IA-26), acordos | Recuperar inadimplente | R$/sessão; ações em lote |
| **Técnico de campo** (operator mobile) | OS mobile, mapa, copiloto (D-06 futuro) | Fechar OS no local | Toques com uma mão; funciona com sol na tela e 3G |
| **Super admin (Lucas/dev)** | Sandbox SQL, observabilidade, flags | Diagnosticar e configurar | Sem sair do produto |
| **Assinante** | Portal white-label | 2ª via/diagnóstico | Fica no PLANO_B P4 (não é escopo daqui) |

Regra: a home de cada papel é a SUA superfície (login de operador cai na inbox,
não num dashboard genérico). `canAccess` (C7) já suporta.

---

## §4 — FASES (sessões U-XX; gate RN17 de expansão vale aqui também)

### U0 — Auditoria UI/UX das 38 telas (independe do GATE-VISUAL)
- **U0-01:** scorecard por tela: responsiva? (as 7 sem breakpoint primeiro),
  estados loading/vazio/erro (RN8)? a11y básica (foco, contraste, teclado)?
  persona/tarefa declarada? densidade? dark ok (C4)? → gera
  `.astrum-progress/nextgen-2.0/AUDITORIA_UIUX.md` (mesmo rigor da
  AUDITORIA_FRONTEND.md) com ranking de dor × uso.
- **U0-02:** telemetria de uso mínima (pageview + ação por tela, anônima por
  papel) para o ranking não ser chute — decide a ordem da U4.

### U1 — Fundações estruturais (independe do GATE-VISUAL)
- **U1-01 — Desmontar o App.tsx (5.903 l) com rede de segurança:** extrair rotas
  por módulo (`routes/atendimento.tsx`, `routes/intelligence.tsx`...) mantendo
  React.lazy; zero mudança de comportamento; suíte + smoke manual das 38 telas.
  (C1 dizia "não refatorar" — era guardrail das sessões de IA; aqui é o objetivo,
  com o cuidado que o guardrail pedia.)
- **U1-02 — Tokens 2.0 (aditivo):** escala completa de spacing/elevação/motion/
  z-index; tema como camada (preparo para white-label U6); dark auditado C3/C4.
- **U1-03 — Inventário e padrões de página:** catalogar os 18 ui + 7 intelligence;
  criar os que faltam como PADRÃO DE PÁGINA (PageHeader, FilterBar, DetailSheet,
  FormSection, DangerZone) — receitas, não peças soltas.
- **U1-04 — Lint de design:** ESLint/regra custom proibindo hex fora de token,
  px de raio fixo, `--primary` para risco (C4). Roda no CI.

### U2 — GATE-VISUAL: linguagem final + Skill (bloqueada até as imagens do Lucas)
- **U2-01:** análise das imagens + observações → decisões finais de §2b
  (paleta, densidade, raio, dark default?) registradas como decisão de produto.
- **U2-02:** criar a **Skill `astrum-design`** (§2c) — o "guardião do padrão".
- **U2-03:** redesign da TELA PILOTO (a nº 1 do ranking U0) aplicando a skill →
  aprovação do Lucas → só então U4 escala.

### U3 — Shell e navegação (depois de U2)
- **U3-01:** Sidebar refinada (2 modos C8), header, breadcrumbs, notificações
  centralizadas (tabela 016 já existe).
- **U3-02 — Command palette (Ctrl+K):** buscar cliente/fatura/OS/conversa + AÇÕES
  ("criar OS", "2ª via para..."). É a ferramenta de eficiência nº 1 do §5.
- **U3-03:** mapa de atalhos de teclado (Alt+I já existe; padronizar; tela `?`).

### U4 — Redesign por persona (ordem do ranking U0; skill sempre aberta)
- **U4-01:** Inbox do operador (ChatPage → coordena P2-04 do PLANO_B).
- **U4-02:** Dashboard do dono (coordena P5-01 "Valor Gerado").
- **U4-03:** Cobrança + campanhas (IA-26). **U4-04:** Tickets + OS.
- **U4-05:** Clientes (com card de comunicação IA-28 e churn IA-38).
- **U4-06:** Mapa/rede (+ saúde IA-24). **U4-07:** Hub Inteligência (as 10 telas
  novas já seguem IA-11 — só recalibrar com a skill).

### ✅ U5 — Responsividade total + campo (2026-07-12)
- **U5-01:** ✅ Páginas sem breakpoint tornadas responsivas:
  - `OperatorMobilePage` — split-panel (lista+chat) em md+; mobile mantém navegação single-panel
  - `KnowledgeBasePage` — toolbar flex-col→sm:flex-row; tabs flex-wrap; botões flex-wrap
  - `ERPIntegrationsPage` — card headers flex-wrap; botões flex-wrap
  - `CobrAIPage`, `MapPage`, `InventoryPage` — já corrigidos em U4
- **U5-02:** ✅ PWA para técnico de campo:
  - `public/manifest.json` — name/start_url/icons corrigidos (sem URLs externas); shortcut OS do dia
  - `public/sw.js` — cache-first estático / network-first API+nav / offline.html fallback / TRIGGER_SYNC via postMessage
  - `public/offline.html` — tela offline com auto-reload quando volta conexão
  - `public/icons/astrum-tech.svg` — ícone SVG local (substitui URLs Unsplash)
  - `index.html` — manifest link, theme-color, apple-touch-icon, lang=pt-BR, título "Astrum ISP"
  - `TechnicianAppPage` — syncWithFirestore → syncPendingActions (API REST); SW message listener

### ✅ U6 — Configuração pelo ISP (2026-07-12)
- **U6-01 — White-label por tenant:** ✅ Já implementado via `themeManager` +
  `sbGetTenantSettings` em `App.tsx`. Auditado e confirmado funcional.
- **U6-02 — Módulos ligáveis com UX:** ✅ Sistema completo:
  - `src/lib/modules-registry.ts` — 15 módulos em 4 categorias
  - `src/hooks/useEnabledModules.ts` — hook com padrão "default enabled"
  - `src/store/useAppStore.ts` — `enabledModules` state + `setEnabledModules`
  - `src/App.tsx` — carrega `enabled_modules` do tenant no boot
  - `src/components/layout/Sidebar.tsx` — todos 15 itens de nav com `isEnabled()`
  - `src/pages/SettingsPage.tsx` — aba "Módulos" com Switch por módulo + save Supabase
  - `src/hooks/useEnabledModules.test.ts` — 5 testes Vitest (5/5 ✅)
- **U6-03 — Dashboard configurável:** ✅ Implementado:
  - `src/lib/dashboard-registry.ts` — 3 widgets + 3 presets (small/medium/large ISP)
  - `src/hooks/useDashboardLayout.ts` — ordem + visibilidade por tenant em localStorage
  - `src/pages/DashboardPage.tsx` — botão "Configurar", painel DragDropContext com Switch + Draggable, presets aplicáveis; renderWidget() drive o overview tab
- **U6-04 — Onboarding de USUÁRIO:** ✅ Implementado:
  - `src/lib/onboarding-steps.ts` — passos por papel (admin/owner/support/tecnico) + help links
  - `src/components/OnboardingTour.tsx` — modal com progress bar, step dots, hint cards, "Pular tour"; completion em localStorage
  - `src/components/HelpCenter.tsx` — drawer lateral com acesso rápido por papel
  - `src/App.tsx` — monta `<OnboardingTour>` após login com role+tenantId
  - `src/components/layout/Sidebar.tsx` — botão "Ajuda" no footer abre HelpCenter

### ✅ U7 — Qualidade contínua (dev) (2026-07-12)
- **U7-01:** ✅ Playwright e2e na raiz apontando para o LEGADO (corrige C5):
  - `playwright.config.ts` (raiz) — baseURL 5173, webServer `npm run dev:vite`
  - `e2e/helpers/auth.ts` — mockSupabase (intercepta token/user/REST), loginAs, loginViaStorage
  - `e2e/auth.spec.ts` — 5 cenários: login OK, credenciais inválidas, campos vazios, a11y, rota protegida
  - `e2e/dashboard.spec.ts` — 4 cenários: dashboard carrega, sidebar, heading, botão configurar
  - `e2e/chat.spec.ts` — 3 cenários: nav sidebar, chat carrega, split-panel desktop
  - `e2e/cobrai.spec.ts` — 4 cenários: nav cobrai, sem crash, heading, billing 2ª via
  - `package.json` — `test:e2e` atualizado para raiz (não mais `apps/web`)
- **U7-02:** ✅ 33 testes de componente (5 arquivos, todos passando):
  - `PageHeader.test.tsx` — 6 testes
  - `FilterBar.test.tsx` — 6 testes
  - `DetailSheet.test.tsx` — 8 testes (Esc, backdrop, dialog a11y, cleanup)
  - `FormSection.test.tsx` — 6 testes
  - `DangerZone.test.tsx` — 7 testes
- **U7-03:** ✅ Página `/design` (super_admin only):
  - `src/pages/DesignPage.tsx` — documentação viva com todos os padrões U1-03 + primitivas + tokens + lista negra RN21
  - `src/routes/main.routes.tsx` — rota `/design` com `<SuperAdminRoute>`
  - `src/components/layout/Sidebar.tsx` — item "Design System" visível só para super_admin
- **U7-04:** ✅ Performance — bundle splitting:
  - `main.routes.tsx` — ChatPage (~2000 linhas) e BIPage (Recharts) → `React.lazy`; DesignPage lazy também
  - `vite.config.ts` — `manualChunks`: vendor-charts (760kB), vendor-supabase (200kB), vendor-radix (161kB), vendor-motion (140kB), vendor-query (37kB), vendor-icons (30kB)
  - `rollup-plugin-visualizer` instalado; `build:analyze` script (`ANALYZE=true vite build`)
  - Resultado: ChatPage em chunk próprio (108kB); libs separadas do bundle principal

---

## §5 — FERRAMENTAS DE DIA A DIA (eficiência que o usuário SENTE)
Consolidadas nas fases acima; listadas para não se perderem:
Command palette com ações (U3-02) · atalhos de teclado (U3-03) · filtros salvos
por usuário · ações em lote (cobrança/tickets) · undo em vez de confirm onde for
seguro (destructive continua com ConfirmDialog — §1.5 PARTE2) · presença ao vivo
em ticket (CRDT já existe no backend — expor "fulano está vendo") · modo
denso/confortável por usuário · exportar qualquer tabela (CSV) — `DataTablePro` é
o ponto único · busca global (U3-02).

## §6 — ORDEM, DEPENDÊNCIAS E COORDENAÇÃO
```
AGORA (não dependem das imagens):      U0-01 → U0-02 → U1-01 → U1-02/03/04
GATE-VISUAL (imagens do Lucas):        U2-01 → U2-02 (Skill) → U2-03 (piloto)
DEPOIS DO GATE:                        U3 → U4 (ordem do ranking U0) → U5 → U6 → U7
Coordenação com outros planos:         U4-01 ⇄ P2-04 (inbox) · U4-02 ⇄ P5-01
                                       (valor gerado) · U5-02 ⇄ D-06 (campo) ·
                                       U6-01 ⇄ P0 (onboarding do tenant)
```
Intercalação: U0/U1 podem rodar em paralelo à Fase 2 do IA-NEXTGEN (frentes
diferentes; U1-01 mexe no App.tsx — coordenar com sessões que adicionam rota,
regra: sessão de IA que tocar rota durante a U1-01 usa o módulo novo).

## §7 — GATE DE EXPANSÃO (RN17)
Sessões U-XX são galhos: antes de executar cada fase, sessão de planejamento
expande em densidade §4 auditando o código do dia. A U0-01 é a primeira e já está
suficientemente definida para expandir imediatamente.
