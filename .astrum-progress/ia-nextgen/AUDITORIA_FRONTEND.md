# AUDITORIA_FRONTEND — Auditoria do frontend real (RN9/§2 do PARTE2_IA11-IA46_fullstack)

> Gerado em 2026-07-05 por auditoria direta do código. Este arquivo é lido no início de
> TODA sessão IA-11..IA-46. Se algo aqui divergir do repo no dia da execução, o repo vence
> — atualize este arquivo e registre no PROGRESS_LOG.

## 1. Qual é o app web real

**O frontend oficial é o LEGADO na raiz do monorepo (regra R1 do CLAUDE.md).**
`apps/web` existe mas será canibalizado e deletado na S78 — **PROIBIDO criar tela lá**.
Páginas NOVAS no legado são explicitamente permitidas pela R1.

| Item | Valor auditado |
|---|---|
| Build | Vite na raiz (`vite.config.ts`), React 18.3, TypeScript |
| Entrada | `src/main.tsx` → `src/App.tsx` |
| Roteador | `react-router-dom` v6. Rotas declaradas DENTRO de `src/App.tsx` (monólito ~3.100 linhas): bloco público ~linha 279 (`/webchat`, `/register`...), bloco autenticado ~linhas 2958-3126 (`/dashboard`, `/bi`, `/cobrai`...) |
| Estado global | Zustand — `src/store/useAppStore.ts`, com `canAccess(role, tab, rolePermissions)` controlando visibilidade de nav por papel |
| Data fetching | `QueryClientProvider` (TanStack Query v5) JÁ montado no App.tsx, mas páginas antigas usam `useState/useEffect` + supabase direto. **Telas novas: usar TanStack Query.** |
| Camada de dados | `src/lib/db.ts` (repositories — único lugar do legado que a R1 deixa mexer) + `src/lib/supabase.ts` (client). Chamadas ao backend v2 (Fastify, porta 3001): padrão em `src/lib/auth-v2.ts` — copiar a resolução de base URL de lá |
| Lib de UI | shadcn-style em `src/components/ui/*` (card, button, badge, table, tabs, dialog, input, label, switch, scroll-area, avatar, tooltip, sonner). CVA + clsx + tailwind-merge |
| Toasts | `sonner` (`<Toaster/>` já no App; `import { toast } from 'sonner'`) |
| Ícones | `lucide-react` |
| Gráficos | **Recharts** (já usado em App.tsx, AICostsPage, BIPage) → decisão §1.6: Recharts confirmado, nada novo |
| Motion | framer-motion (usado com moderação nas páginas) |
| Tema | Tailwind **v4** — tokens via `@theme` em `src/index.css` (NÃO há tailwind.config de tokens; o `tailwind.config.js` da raiz é residual). Convenção shadcn HSL: `--primary`, `--card`, etc. Dark mode = classe `.dark` via `next-themes` |
| Fontes | `--font-sans: Inter`, `--font-mono: JetBrains Mono` JÁ definidas (`src/index.css:8-9`) |
| Layout | `src/components/layout/AppLayout.tsx`, `Sidebar.tsx`, `TopHeader.tsx`, `BottomNav.tsx` |
| Sidebar | `Sidebar.tsx` — seções com header uppercase (`"Atendimento"` linha ~180, `"Infra & Gestão"` linha ~227), componente interno `NavItem` (props: `active,onClick,icon,label,collapsed,shortcut,badge`). Gate por `hasAccess(tab)` = `canAccess(...)`. **A seção "Inteligência" entra aqui, seguindo exatamente esse padrão** |
| Testes de UI | Testing Library + jsdom configurados no vitest da RAIZ (`vitest.setup.ts`). Playwright existe mas aponta para `apps/web` (condenado à S78) — **e2e novos NÃO vão para lá** |
| Alias | `@/` → **RAIZ do repo** (`vite.config.ts:12`). Imports são `@/src/components/ui/card`, nunca `@/components/...` |

## 2. Flags no client

**NÃO existe** propagação de feature flag para o client hoje (grep `import.meta.env` só
acha supabase em `src/lib/supabase.ts` e `src/lib/auth-v2.ts`). A IA-11 cria:
`GET /api/v2/flags/public` (Fastify, whitelist explícita) + `src/lib/feature-flags.ts` +
hook `useFeatureFlags()` (TanStack Query, fail-closed).

## 3. Páginas de IA que JÁ existem (integrar, não duplicar)

`AIConfigPage`, `AICostsPage`, `AIObservabilityPage`, `QualityMonitorPage`,
`MonitoringPage`, `CobrAIPage`, `KnowledgeBasePage` — 27 páginas no total em `src/pages/`.
Sessões que o plano manda MODIFICAR página existente (IA-30, IA-34, IA-43...) modificam
essas, não criam concorrente.

## 4. Mapeamento dos tokens §1 (Astrum-IA DS → repo real) — decisão RN10

O repo já tem design system (shadcn/HSL). Decisão: os tokens `--astrum-*` do §1 entram
como **variáveis ADICIONAIS** no `@theme` de `src/index.css`, sem tocar nos tokens shadcn
existentes. Componentes novos usam `--astrum-*` para a linguagem de risco e `--primary`/
`--card`/etc. para o chassi (assim herdam dark mode de graça).

| Token §1 | Destino real |
|---|---|
| `--astrum-signal/fiber/amber/orange/red/slate` | novas vars no `@theme` de `src/index.css` |
| `--astrum-ink/paper` | NÃO criar — usar `--background`/`--card` existentes (já têm dark mode) |
| Inter / JetBrains Mono | já existem (`--font-sans`/`--font-mono`) — nada a fazer |
| Space Grotesk (display) | adicionar carregamento no `index.html` (seguir como Inter é carregada hoje — confirmar lá) + var `--font-display` |
| Raio 8px | usar `--radius-*` existentes (**atenção**: dark mode muda `--radius` p/ 1.5rem — ver armadilha C3) |

## 5. Armadilhas de frontend (espelhadas no Apêndice C do plano)

C1. `App.tsx` é monólito de ~3.100 linhas com DOIS blocos de rotas (público ~l.279,
    autenticado ~l.2958). Rotas novas entram no bloco autenticado. NÃO refatorar o
    monólito (R1 — só páginas novas, camada de dados, auth, hooks de rede).
C2. Alias `@/` = raiz do repo → `@/src/...`. Errar isso quebra o build silenciosamente
    no editor e barulhentamente no vite.
C3. Dark mode redefine `--radius` de 0.5rem para **1.5rem** (`src/index.css:98`).
    Componente novo usa tokens de raio, nunca px fixo, senão fica quadrado no dark.
C4. `--primary` no dark é VERMELHO (`350 89% 50%`). NUNCA usar `--primary` para
    semântica de risco — colide com `crítico`. Risco = só `--astrum-*`.
C5. `npm run test:e2e` roda Playwright de `apps/web` (morre na S78). Teste de UI novo =
    Testing Library/jsdom no vitest da raiz. E2e do legado: TODO futuro, não desta parte.
C6. Não há proxy `/api` no `vite.config.ts` — em dev o Express raiz serve o app; chamadas
    ao Fastify (porta 3001) precisam de base URL absoluta → copiar o padrão de
    `src/lib/auth-v2.ts`, com CORS já habilitado no Fastify (`@fastify/cors` presente).
C7. Tab nova de nav exige registrar a permissão no modelo `canAccess`/`rolePermissions`
    (`src/store/useAppStore.ts` + `companySettings.rolePermissions`) — senão nem admin vê.
C8. Sidebar tem larguras fixas (`w-72`/`md:w-24` colapsada) e NavItem com tooltip no modo
    colapsado — a seção nova precisa funcionar nos DOIS modos (label some, tooltip entra).
