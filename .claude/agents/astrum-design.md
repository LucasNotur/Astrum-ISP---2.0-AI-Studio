---
name: astrum-design
description: Guardião do padrão visual do Astrum-IA. Carregue esta skill ANTES de criar ou modificar qualquer tela no frontend legado (src/pages/*). Fornece princípios, tokens, anti-patterns e receitas por tipo de tela.
---

# Astrum Design System — Regras de UI/UX

> **Toda sessão de UI abre com esta skill.** Nenhuma tela nova ou redesenhada sem ela.
> Herda R1–R6 do CLAUDE.md. R1 reafirmado: o frontend oficial é `src/pages/*` (Vite na raiz).
> `apps/web` está condenado — nunca criar tela lá.
> **Decisões do design-lab têm precedência:** `docs/DESIGN_SYSTEM.md` é o registro
> print a print (D-001+). Em conflito entre esta skill e o registro, vale o registro.

---

## §0 — DIREÇÃO design-lab (2026-07-19, D-001 a D-004)

- **Dark-first (D-001):** dark é o tema padrão e recebe o capricho; light é secundário.
  Fundo quase preto; profundidade por camadas de superfície, não sombra grande.
- **Accent limão (D-002):** `astrum-lemon #F2E349` é a cor de marca na UI — usada só
  em detalhe (badge, estado ativo, focus ring, ícone). Vermelho volta a ser SÓ
  destructive. A paleta de risco (signal/amber/orange/red) segue para semântica de dado.
- **CTA branco invertido (D-003):** botão primário no dark = branco pill com texto
  quase-preto. Limão NUNCA é fundo de CTA. Hierarquia: primário branco pill ·
  secundário superfície + borda hairline · ghost texto · destrutivo vermelho.
- **Super arredondado com hierarquia (D-004):** botões/chips `rounded-full`; inputs,
  cards e modais `rounded-stable-xl`; elementos densos internos `rounded-stable-sm`.
  Inputs dark sem borda visível (borda só no focus, via ring).
- **Shell (D-005/D-006):** sidebar com logo+tagline, bloco de boas-vindas
  (font-display) e grupos sentence-case muted; item ativo = superfície gradiente
  sutil + hairline + indicador vertical; ícones outline 18–20px. Topbar = breadcrumb
  à esquerda + busca pill à direita.
- **Card de métrica (D-007):** tile de ícone + kebab + label muted + número
  font-mono grande + delta chip translúcido (signal/red) + sparkline discreta.
  Barra de accent fina à esquerda só no card em destaque.
- **Tabela densa (D-008):** eyebrow + título display + chip de filtro; header row
  discreta ordenável; linhas hairline com hover; entidade = ícone + nome + código
  muted; números font-mono; deltas em chips translúcidos.
- **Central de notificações (D-009):** categorias em cards gradientes vívidos
  (signal=Todas, fiber=SLA, red=Críticas) com tile branco translúcido + badge
  circular vermelho de contagem. Gradiente vívido é EXCLUSIVO desse contexto.
- **Glow CTA (D-011):** `<GlowButton>` (glow-button.tsx) para A ação de criação
  da tela — máximo UM por tela. Cor padrão fiber.
- **Spotlight P&B (D-012):** momento-herói pode ser card branco puro
  (`bg-primary`); chave-valor com hairline; timeline numerada com conector.
- **Motion de itens (D-013):** stagger/slide+fade permitidos; <200ms no produto,
  expressivo só em login/landing/onboarding; reduced-motion sempre.
- **Personagens (D-014):** arte cel-shaded em banners/updates/empty states
  especiais via `<UpdateCard>` — NUNCA em área de trabalho densa.
- **Anel com ícones (D-015) — PADRÃO GLOBAL:** TODA composição usa `<RingChart>`
  + `<RingLegend>` (ring-chart.tsx). `PieChart`/`Pie` do recharts é PROIBIDO.
  Cores: `ASTRUM_SPECTRUM` (ordem padrão) ou `ASTRUM_SEMANTIC` (status).
  `astrum-nebula` só em dataviz, nunca como accent de UI.
- **Spotlight (D-012) — componentes globais:** `<SpotlightCard>`, `<KeyValueList>`,
  `<NumberedTimeline>`, `<ThumbStrip>`, `<TipCallout>`, `<FloatingPill>`
  (spotlight.tsx) para detalhe/resumo/app do técnico.

---

## §1 — Princípio: "TECNOLÓGICO, LIMPO, BONITO"

O Astrum é uma **ferramenta profissional**, não um site ou landing page.
O alvo: Linear, Grafana, painéis de NOC — densidade de quem trabalha 8h na tela.
**O dado é o protagonista. O chrome desaparece.**

Regras derivadas:
- **Número é herói.** Todo valor medido usa `font-mono` (JetBrains Mono). Hierarquia por peso/cor, não tamanho inflado.
- **Grid rígido 4/8 px.** Bordas 1px hairline + separadores no lugar de sombra grande.
- **Cor com função, nunca decoração.** A paleta de risco astrum é a linguagem; `fiber` (#3D5AFE) usado com parcimônia cirúrgica.
- **Dark mode de verdade** (não inversão). Operador de NOC/atendimento vive no escuro.
- **Motion funcional: <200ms.** Só para orientar (entrada de painel, confirmação). Nunca decorativo. `prefers-reduced-motion` sempre respeitado.
- **Microdetalhe é a assinatura.** Foco visível, skeletons fiéis, empty states com AÇÃO, toasts sóbrios.

---

## §2 — LISTA NEGRA (RN21 — proibido em tela nova ou redesenhada)

Se qualquer item abaixo estiver presente, a tela VOLTA antes de ir para o usuário:

1. Gradiente roxo/azul genérico em hero, botão ou fundo.
2. Emoji como ícone de feature ou título de seção.
3. Grid de 3 cards idênticos com ícone em círculo colorido + título + frase motivacional.
4. Hero centrado com headline gigante e subtítulo motivacional.
5. Sombra difusa grande em tudo; glassmorphism gratuito.
6. Raio de borda SEM hierarquia — o mesmo valor em botão, card, tabela e badge
   (cara de template). A linguagem é arredondada (D-004), mas com hierarquia:
   pill em botão ≠ 16px em card ≠ raio pequeno em linha densa.
7. Paleta default do shadcn/Tailwind intocada; roxo `#8B5CF6` em destaque.
8. Texto de marketing vazio dentro do produto ("Potencialize seu negócio").
9. Ilustrações 3D genéricas de banco de imagem.
10. Espaçamento inflado (padding de brochura, não de ferramenta).
11. `PieChart`/`Pie` do recharts para composição — use `<RingChart>` (D-015).

---

## §3 — TOKENS (use SEMPRE — hex/px fixo no componente é bloqueado pelo lint)

### Tipografia
```css
font-sans      /* Inter — corpo, labels, descrições */
font-mono      /* JetBrains Mono — números, código, IDs, métricas */
font-display   /* Space Grotesk — títulos de página, números-herói, PageHeader */
```

### Cores astrum (risco e acento)
```css
text-astrum-signal   /* #00C2A8 — OK, online, positivo */
text-astrum-fiber    /* #3D5AFE — acento tecnológico (usar com parcimônia) */
text-astrum-amber    /* #F5A524 — atenção, pendente */
text-astrum-orange   /* #F0713C — alerta moderado */
text-astrum-red      /* #E5484D — crítico, erro, perigo */
text-astrum-slate    /* #5B6472 — neutro, desabilitado */
text-astrum-lemon    /* #F2E349 — accent de MARCA (D-002): badge, estado ativo, focus. Nunca área grande nem CTA */
/* Variantes bg-/border-/fill- funcionam para todos os tokens acima */
```

### Elevação (shadow)
```
shadow-0   /* sem sombra — elementos inline */
shadow-1   /* separador leve (1px border) — cards planos */
shadow-2   /* elevação leve — cards interativos, dropdowns */
shadow-3   /* elevação média — popovers, tooltips */
shadow-4   /* elevação máxima — DetailSheet, modais */
```

### Motion
```
duration-fast   /* 100ms — hover, foco */
duration-base   /* 200ms — entrada de painel, transição de estado */
duration-slow   /* 350ms — modais grandes, DetailSheet */
ease-productive /* cubic-bezier(0.2,0,0,1) — movimentos de trabalho */
ease-expressive /* cubic-bezier(0.4,0.14,0.3,1) — movimentos de atenção */
```

### Z-index semântico
```
z-base, z-raised, z-dropdown, z-sticky, z-overlay, z-modal, z-toast
/* NUNCA usar número literal de z-index */
```

### Radius (não muda no dark — corrige armadilha C4)
```
rounded-stable-none / rounded-stable-xs / rounded-stable-sm
rounded-stable / rounded-stable-lg / rounded-stable-xl
/* NÃO usar rounded-* do Tailwind diretamente — ele muda no dark! */
```

---

## §4 — COMPONENTES DE PADRÃO DE PÁGINA

Importar de `@/src/components/ui/`:

| Componente | Quando usar |
|---|---|
| `<PageHeader title subtitle action>` | TODA tela legada — título com `font-display`, subtítulo opcional, slot de ação (botão primário) |
| `<FilterBar value onValueChange filters sort>` | Toda tela com tabela ou lista filtrável |
| `<DetailSheet open onClose title subtitle footer>` | Painel lateral de detalhe/edição (push da direita, Escape fecha) |
| `<FormSection title description>` | Agrupa campos dentro de form ou Sheet, com `<h3>` e divisor |
| `<DangerZone title description>` | Ações destrutivas — borda/bg `astrum-red`, ícone `AlertTriangle` |
| `<StatCard>` | KPI individual — usa `font-mono` para o número |

### Regra de shadcn
Componentes `src/components/ui/{button,card,badge,...}` são a base. Não criar alternativa sem justificativa. Usar `cn()` para variantes adicionais.

---

## §5 — RECEITAS POR TIPO DE TELA

### Lista (tabelas, feeds)
```tsx
// Estrutura padrão
<div className="flex flex-col gap-4 p-6">
  <PageHeader title="Título" subtitle="N itens" action={<Button>Nova ação</Button>} />
  <FilterBar value={q} onValueChange={setQ} />
  {/* Tabela shadcn ou DataTablePro — NUNCA <table> HTML nativo */}
  <Table>...</Table>
</div>
```
- Loading: skeleton de N linhas fiéis à tabela real (não spinner centralizado)
- Empty: `<EmptyState icon action>` — sempre com call-to-action
- Error: toast + retry button (não alert nativo)

### Detalhe (sheet lateral)
```tsx
<DetailSheet open={open} onClose={onClose} title={item.name} subtitle={item.id}>
  <FormSection title="Dados">...</FormSection>
  <DangerZone>...</DangerZone>
</DetailSheet>
```
- Largura default 420px; expandir para 640px se tiver muitos campos
- Ação principal no `footer` prop (não inline no body)

### Dashboard (visão executiva)
```tsx
// Linha de KPIs no topo — SEMPRE
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
  <StatCard label="..." value="..." unit="..." trend="up" />
</div>
// Gráficos recharts — NUNCA Math.random() em useMemo
// contentStyle de tooltip: { backgroundColor: 'hsl(var(--card))' } — não hex
```
- Número herói: `font-mono text-2xl font-semibold`
- Cor do trend: `astrum-signal` (up) / `astrum-red` (down) / `astrum-amber` (neutro)

### Formulário (settings, config)
```tsx
<form className="flex flex-col gap-6 max-w-2xl">
  <PageHeader title="..." />
  <FormSection title="Seção 1">
    <Label>...</Label><Input />
  </FormSection>
  <DangerZone title="Zona de risco" description="...">
    <Button variant="destructive">Excluir</Button>
  </DangerZone>
</form>
```
- Validação inline abaixo do campo (`text-xs text-astrum-red mt-1`)
- Destructive: SEMPRE ConfirmDialog shadcn (nunca `window.confirm`)
- Progresso fake com `setInterval` é PROIBIDO

### Console / Observabilidade
```tsx
// Referência: AIObservabilityPage, SandboxPage, ReplayPage
// Tooltip de gráfico: contentStyle={{ backgroundColor: 'hsl(var(--card))' }}
// Tabela de logs: font-mono para IDs, timestamps e valores numéricos
// Dark: usar CSS vars SEMPRE — nunca #1f2937 hardcoded
```

---

## §6 — DARK MODE (armadilhas C3/C4)

- **C3:** `dark:bg-[#16171a]` hardcoded → usar `dark:bg-background` ou variável CSS
- **C4:** `--radius` muda no dark em shadcn default → usar `rounded-stable-*` (imune)
- **C4b:** até a fundação F1 do design-lab ser aplicada, `--primary` ainda é vermelho no
  dark → nunca usar `text-primary` para cor de acento; após F1, `--primary` vira branco
  (CTA invertido, D-003) e acento de marca é `text-astrum-lemon`
- Tooltip recharts: `contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}`
- Qualquer `window.location.href` ou `Math.random()` em componente de UI → flag e corrigir

---

## §7 — A11Y MÍNIMA

- `<button>` sempre com `aria-label` quando ícone sem texto
- Foco visível: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- Contraste: nunca `text-muted-foreground` em texto crítico de ação
- Modais/sheets: `role="dialog" aria-modal="true" aria-label={title}`; Escape fecha
- `prefers-reduced-motion`: `transition-none` nos elementos animados quando ativo

---

## §8 — CHECKLIST ANTES DE COMMITAR (RN21 expandido)

- [ ] Nenhum item da Lista Negra §2 presente
- [ ] Todos os números em `font-mono`
- [ ] Nenhum hex literal (`#...`) fora do `index.css`
- [ ] Nenhum `px` fixo de radius (usar `rounded-stable-*`)
- [ ] Tooltip recharts usa `hsl(var(--card))`
- [ ] Empty state tem ação (não mensagem morta)
- [ ] Loading tem skeleton (não spinner único)
- [ ] Destructive usa `ConfirmDialog` shadcn (não `window.confirm`)
- [ ] Nenhum `z-index` numérico literal
- [ ] Dark mode testado (Ctrl+Shift+D ou classe `.dark`)
- [ ] `prefers-reduced-motion` não quebra a tela

---

## §9 — PERSONAS E SUAS TELAS PRIORITÁRIAS (para decisões de redesign)

| Persona | Tela principal | Métrica de eficiência |
|---|---|---|
| Dono/gestor (admin) | DashboardPage, BIPage | 1 tela, zero clique para o resumo do dia |
| Atendente (operator) | ChatPage | Conversas/hora; ≤2 cliques até 1ª resposta |
| Financeiro | CobrAIPage, BillingPage | Ações em lote; R$/sessão |
| Técnico de campo | TechnicianAppPage | Touch com uma mão; funciona com sol + 3G |
| Super admin | SuperAdminPage, SandboxPage | Diagnosticar e configurar sem sair do produto |

**Home por papel:** o login do operador cai na ChatPage/Inbox, não num dashboard genérico.
`canAccess` em `useAppStore` já suporta; `SuperAdminPage` DEVE ter guarda RBAC
(vulnerabilidade #3 do ranking U0 — corrigir junto com qualquer redesign dela).
