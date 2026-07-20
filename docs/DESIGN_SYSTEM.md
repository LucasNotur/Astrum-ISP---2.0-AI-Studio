# Astrum — Design System (registro de decisões do design-lab)

> **O que é isto:** registro oficial das decisões de design tomadas print a print no
> laboratório de design (branch `design-lab`, deploy em astrum-indol.vercel.app).
> Cada decisão aqui vira token em `src/index.css` e regra na skill
> `.claude/agents/astrum-design.md`. Este arquivo é a fonte da verdade sobre O QUE
> foi decidido e POR QUÊ; a skill é o manual de COMO aplicar.
>
> Workflow: inventário visual → Lucas envia print de referência → decisão registrada
> aqui → tokens/regras atualizados → aplicação tela a tela na `design-lab`.
>
> Inventário visual de referência (baseline pré-redesign): capturado em 2026-07-19,
> 100 screenshots (50 telas × desktop/mobile), tema claro.

---

## Decisões vigentes

### D-001 — Tema: dark-first
**Origem:** print de referência #1 (onboarding mobile estilo Creameet), 2026-07-19.
**Decisão:** o tema escuro é o padrão do produto e recebe todo o capricho de design.
O light passa a ser secundário (mantido funcional, sem paridade de polish).
**Regras derivadas:**
- Fundo base quase preto (não cinza-azulado claro): profundidade vem de camadas de
  superfície (`background` → `card` → `popover`), não de sombras grandes.
- Toda tela nova/redesenhada é desenhada e revisada primeiro no dark.

### D-002 — Accent: amarelo-limão vibrante
**Origem:** print #1. **Decisão:** a cor de marca na UI é um amarelo-limão vibrante
(`--color-astrum-lemon: #F2E349`), substituindo o âmbar atual como accent e
aposentando o vermelho como `--primary` do dark (vermelho volta a ser só
`destructive`/crítico).
**Regras derivadas:**
- O limão é tempero, não prato: badges, estados ativos, links de destaque, ícone da
  marca, focus ring. **Nunca** em áreas grandes (fundos, botões largos, headers).
- A paleta funcional de risco (signal/amber/orange/red) continua intocada para
  semântica de dados; o limão é identidade, não semântica.

### D-003 — CTA principal: branco invertido
**Origem:** print #1. **Decisão:** o botão de ação principal no dark é **branco com
texto quase-preto**, formato pill. O accent limão nunca é usado como fundo de CTA.
**Regras derivadas:**
- Hierarquia de botões (dark): primário = branco pill · secundário = superfície
  elevada com borda hairline · ghost = texto · destrutivo = vermelho.
- Chevron/ícone à direita no CTA quando a ação avança um fluxo.

### D-004 — Forma: super arredondado com hierarquia
**Origem:** print #1. **Decisão:** linguagem visual arredondada — botões pill
(raio total), inputs e cards ~16px — **com hierarquia** (tabelas/linhas internas com
raio menor; nunca o mesmo raio em tudo).
**Regras derivadas:**
- Botões e chips: `rounded-full` (pill).
- Inputs, cards e modais: `rounded-stable-xl` (1rem/16px).
- Elementos internos densos (linhas de tabela, itens de lista): `rounded-stable-sm`.
- O raio NÃO muda entre temas (mantém a correção da armadilha C4: `rounded-stable-*`).
- Inputs no dark: superfície elevada sem borda visível (borda só no focus, via ring).

### D-005 — Navegação: sidebar com identidade e boas-vindas
**Origem:** print de referência #2 (dashboard Quantix, replicação fiel), 2026-07-19.
**Decisão:** sidebar escura levemente destacada do conteúdo (hairline à direita), com:
- Topo: tile do logo + nome do produto + tagline pequena muted + chevron de colapso.
- Bloco de boas-vindas: "Bem-vindo de volta, {nome}" grande (font-display) +
  "Último acesso: {data}" pequeno muted; divisor hairline abaixo.
- Grupos de navegação com rótulo **sentence case** pequeno e muted (não uppercase).
- Item ativo: superfície elevada com gradiente sutil + borda hairline + indicador
  vertical fino à direita; texto branco. Inativo: muted, hover eleva.
- Ícones outline finos (18–20px, stroke leve) — nunca 24px cheios.
- Badges de nav: chips pequenos arredondados (contagem, "Beta"); destrutivo só se crítico.

### D-006 — Topbar: breadcrumb à esquerda, busca à direita
**Origem:** print #2. **Decisão:** o cabeçalho superior tem breadcrumb com ícone de
home à esquerda (Seção / Página) e busca em pill à direita (com atalho ⌘K), mais
ações de conta. Sem linha separada de breadcrumb abaixo do header.

### D-007 — Cards de métrica (hero cards)
**Origem:** print #2. **Decisão:** card de métrica padrão:
- Tile de ícone em rounded-square elevado + label pequeno muted + nome forte.
- Menu kebab em botão quadrado arredondado no canto.
- Rótulo "de dado" pequeno (ex.: "Preço") + **número grande em font-mono**.
- Delta em chip pill com fundo translúcido da cor semântica (signal/red) + ícone.
- Sparkline/área discreta na base do card com gradiente sutil.
- Barra de accent fina na borda esquerda quando o card está em destaque/ativo.

### D-008 — Tabela densa (padrão "Market Overview")
**Origem:** print #2. **Decisão:** tabelas densas com:
- Cabeçalho de seção fora da tabela: eyebrow pequeno muted + título forte + filtro chip à direita.
- Header row escura discreta, colunas ordenáveis com ícone de sort.
- Linhas com hairline entre elas, hover eleva; número de rank muted;
  entidade = ícone/avatar + nome forte + código muted na mesma célula.
- Valores numéricos em font-mono; deltas em chips translúcidos (mesma gramática do D-007).
- Tipografia de título de seção: display grande com peso leve/medium (não bold pesado).

### D-009 — Central de notificações: categorias em cards gradientes
**Origem:** print de referência #3 (painel de notificações com canais coloridos), 2026-07-19.
**Decisão:** o dropdown do sino vira uma central com **categorias em cards
arredondados com gradiente vívido** (ícone em tile branco translúcido + título forte +
resumo pequeno + chevron de expansão), badge circular vermelho de contagem sobreposto
ao canto do card quando há não-lidas.
**Mapeamento de cores (print → tokens Astrum):** teal → `astrum-signal` (Todas),
roxo → `astrum-fiber` (SLA/avisos), vermelho-rosa → `astrum-red` (Críticas).
**Escopo:** gradientes vívidos são EXCLUSIVOS de cards de categoria de
inbox/notificação. Fora desse contexto vale a sobriedade do D-002 (limão só em detalhe).

### D-010 — Tela de login em duas colunas
**Origem:** print de referência #4 (login estilo Aceternity), 2026-07-19. Replicado 1:1.
**Decisão:** login com **duas colunas**: esquerda = glifo da marca + "Bem-vindo de
volta!" + pitch curto muted + formulário com **labels acima dos campos** + botão
"Entrar" em superfície elevada (exceção consciente ao CTA branco do D-003, restrita
ao login) + divisor "ou" + 3 botões sociais (Google/Facebook/Apple, brand icons
inline) + rodapé "Cadastre-se" em limão. Direita (só ≥lg) = painel de arte com
gradiente quente (`@utility login-art` no index.css), chips de contexto e card de
depoimento com backdrop-blur.
**Componente:** `src/components/LoginScreen.tsx`. Login social ainda não configurado
no Supabase → botões mostram toast "em breve" (trocar por `signInWithOAuth` quando
os providers forem habilitados).

### D-011 — CTA de destaque com glow neon
**Origem:** print #5 (botão "Create" de Alex K), 2026-07-19.
**Decisão:** a **ação de criação principal** de cada tela pode usar o botão glow:
pill com gradiente vertical da cor, brilho externo em duas camadas + highlight
interno no topo, ícone em círculo translúcido à esquerda, chevron em seção
separada por hairline quando houver menu. Cor padrão: `astrum-fiber` (azul do
print). **Limite: no máximo UM glow por tela** ("sem ser exagerado" — Lucas).
**Componente:** `src/components/ui/glow-button.tsx` + utilities `glow-fiber`/`glow-lemon`.

### D-012 — Contraste cinematográfico: superfície spotlight P&B
**Origem:** print #6 (app de ski — card branco sobre preto), 2026-07-19.
**Decisão:** o momento-herói de uma tela escura usa **card branco puro**
(`bg-primary text-primary-foreground`) — o contraste preto↔branco é a linguagem,
não sombra.
**Componentes (padrão global, `src/components/ui/spotlight.tsx`):**
`<SpotlightCard>` (mídia + título + avatares + faixa de stats),
`<KeyValueList>` (label muted / valor forte com hairline),
`<NumberedTimeline>` (círculos numerados + conector vertical + cards escuros),
`<ThumbStrip>` (miniaturas arredondadas com item ativo maior),
`<TipCallout>` (barra vertical + texto com destaque),
`<FloatingPill>` (CTA flutuante branco, sticky no rodapé).
Todos com motion de entrada (D-013) e `prefers-reduced-motion` respeitado.

### D-013 — Motion de itens (referência Pinterest)
**Origem:** post Pinterest enviado pelo Lucas (landing pages com animação de itens).
**Decisão:** entradas de listas/cards podem usar animação de item (stagger, slide+fade
via framer-motion; componentes Magic UI adaptados aos tokens). Regras vigentes do §1
continuam: <200ms funcional dentro do produto, `prefers-reduced-motion` respeitado;
animação mais expressiva é permitida em landing/login/onboarding.

### D-014 — Personagens Astrum (estilo cel-shading "Spider-Verso/What If")
**Origem:** direção do Lucas, 2026-07-19 — "misturar" o ecossistema estilo
Netflix/Prime (imagens + personagens + software) com a sobriedade do produto.
**Decisão:** a Astrum terá um **sistema de personagens** em arte cel-shaded
(traço comic, sombras chapadas) usados em: banners de atualização/novidade,
cards de anúncio, empty states especiais, onboarding e marketing. Nunca em
áreas de trabalho denso (tabelas, formulários).
**Infra:** arte em `public/characters/` (PNG com alpha);
componente `src/components/ui/update-card.tsx` com slot de personagem.
**Elenco definido** (nomes de estrelas, um por domínio do produto):
**Vega** (campo/OS, teal) · **Rigel** (CobrAI/financeiro, limão) ·
**Nova** (IA/atendimento, nebula) · **Atlas** (gestão/BI, fiber).
**Briefing de geração:** `docs/CHARACTERS_ASTRUM.md` — DNA de estilo, prompts
prontos, specs de proporção/resolução por slot e fluxo de consistência.
**Pendente:** gerar as artes no Nano Banana e salvar em `public/characters/`.

### D-015 — Anel analítico com ícones nas fatias (PADRÃO GLOBAL de composição)
**Origem:** print #7 (Subscriptions ring), 2026-07-19. Replicado 1:1.
**Decisão:** **todo** gráfico de composição no Astrum é o `<RingChart>` —
`PieChart`/`Pie` do recharts está **proibido** para esse fim.
- Cada fatia carrega um **badge circular com o ícone da fonte** sobre o arco —
  nunca só cor+porcentagem.
- Arco em **espectro contínuo**: o gradiente de cada fatia termina na cor da
  fatia seguinte, criando a transição do print. Pontas arredondadas + glow.
- Centro = total agregado (font-mono) + label pequeno uppercase muted.
- **Motion (D-013):** arcos desenham por `pathLength` (0.75s, stagger 90ms),
  badges entram com spring, centro em fade-up, legenda com stagger lateral.
**Paletas globais** (exportadas do mesmo módulo):
- `ASTRUM_SPECTRUM` — ordem padrão: signal → lemon → fiber → **nebula** → orange → red.
- `ASTRUM_SEMANTIC` — `{ ok, warn, bad, neutral, info }` para composições de status.
- Token novo `--color-astrum-nebula: #A855F7` (violeta cósmico) — **só em dataviz**,
  nunca como accent de UI (o accent de marca continua sendo o limão, D-002).
**Componente:** `src/components/ui/ring-chart.tsx` + `<RingLegend>` (SVG puro,
sem recharts). Testado em `ring-chart.test.tsx` (inclui fatia de 100%, que como
arco 0°→360° não seria desenhada pelo SVG e por isso vira `<circle>`).
**Aplicado em:** Dashboard (sentimento), BI (status de faturas), Núcleo IA
(sentimento), Custos IA (custo por modelo).

### D-016 — Tile de ícone (átomo visual das listas)
**Origem:** conjunto de referências de 2026-07-19 (!Camera, Apple Fitness,
dashboards mobile, grade de streaming). O elemento que aparece em **todas** elas.
**Decisão:** ícone nunca fica solto numa lista — vive num **tile**: quadrado
arredondado (ou círculo) com fundo tintado na cor semântica + **gloss** (brilho
no topo) que dá o ar tridimensional sem precisar de arte 3D.
**Componente:** `src/components/ui/icon-tile.tsx` — `<IconTile icon tone size
shape solid>` e `<TileRow icon tone title subtitle value onClick>` (linha de lista
padrão). Tons = paleta astrum (`signal|lemon|fiber|nebula|amber|orange|red|slate|neutral`).
**Regra:** cor do ícone vem do `tone`, **nunca** de classe hardcoded
(`text-purple-600` e afins estão proibidos). `<StatCard>` já usa o tile.

### D-017 — Brilho ambiente cósmico do shell
**Origem:** print do launcher (fundo roxo com brilho ambiente) + identidade
Astrum (espaço/constelação).
**Decisão:** o shell da aplicação tem uma **nebulosa discreta** nos cantos
superiores (nebula à esquerda, fiber à direita), fixa no scroll, atrás de todo o
conteúdo. É atmosfera, não decoração: opacidade baixa o bastante para não
competir com tabela nenhuma.
**Utility:** `astrum-ambient` no `index.css`, aplicada no `AppLayout`.

### D-018 — Catálogo: a arte conduz a navegação (Netflix/Prime)
**Origem:** launcher de jogos + grade de apps de streaming, 2026-07-19.
**Decisão:** superfícies de descoberta usam **arte de capa** como elemento
primário, com gradiente de leitura sobre a imagem e título por cima.
**Componentes:** `src/components/ui/media-rail.tsx` — `<MediaHero>` (banner com
arte, eyebrow, título display, chips de meta e CTA pill), `<MediaRail>` (trilho
horizontal com cabeçalho de seção e stagger), `<MediaCard>` (pôster/wide/quadrado,
hover scale, fallback com `tint` quando não há arte) e `<BrandGrid>` (grade de
tiles de marca/integração).
**Onde usar:** novidades/changelog, base de conhecimento, planos, integrações,
onboarding. **Nunca** em área de trabalho densa (tabela, formulário).

### D-019 — Gauge: arco aberto para progresso
**Origem:** cartão "Perfect Day" (Apple Fitness), 2026-07-19.
**Decisão:** progresso de **uma** métrica usa arco aberto de 270° com gradiente
ao longo do arco, badge no ponto atual e valor grande no centro — irmão do
`RingChart` (composição), mesma gramática e mesmo motion.
**Componente:** `<GaugeChart value max from to badge centerValue centerLabel>`
no mesmo módulo `ring-chart.tsx`. Testado (inclui `max=0` e valor acima do máximo).

### D-020 — Tratamento de imagem (qualquer fonte vira Astrum)
**Origem:** necessidade prática ao destravar as imagens de apoio, 2026-07-19.
**Problema:** imagem de banco nunca parece do produto — cada foto tem sua própria
temperatura, saturação e clima.
**Decisão:** o tratamento é feito em **CSS na renderização**, não no arquivo.
`<TreatedImage src treatment accent strength fallbackTint>`
(`src/components/ui/treated-image.tsx`):
- `duotone` **(padrão de marca)** — sombras no preto do produto, luzes no accent;
- `tint` — mantém as cores originais sob um véu (equipamento, print de tela);
- `dim` — só escurece, para texto por cima;
- `none` — logo de parceiro, screenshot, foto de pessoa real.
**Consequências:** qualquer fonte de imagem serve (geração, banco, foto de campo);
trocar a paleta troca todas as imagens de uma vez; e **sem `src` não há buraco na
UI** — renderiza superfície com gradiente do domínio, então as telas de catálogo
já funcionam antes de existir arte.
**Ligado em:** `<MediaCard>`, `<MediaHero>` (prop `treatment`, duotone por padrão).
**Briefing de produção:** `docs/IMAGERY_ASTRUM.md` — prompts de cena, specs por
slot, critérios de escolha em banco de imagens e checklist. Créditos em
`public/imagery/CREDITS.md`.

---

## Tokens-alvo (a aplicar na fundação do design-lab)

Valores propostos para `src/index.css` quando a fundação for aplicada
(F1 — troca global de variáveis no dark):

```css
.dark {
  --background: 240 4% 4%;        /* quase preto (#0A0A0B) */
  --card: 240 4% 10%;             /* superfície elevada (#18181B) */
  --popover: 240 4% 12%;
  --primary: 0 0% 98%;            /* CTA branco invertido (D-003) */
  --primary-foreground: 240 4% 6%;
  --accent: 55 87% 62%;           /* amarelo-limão #F2E349 (D-002) */
  --accent-foreground: 240 4% 6%;
  --ring: 55 87% 62%;
  --destructive: 350 89% 50%;     /* vermelho volta a ser SÓ destrutivo */
  --radius: 1rem;                 /* igual ao light — C4 resolvida na raiz */
}
@theme {
  --color-astrum-lemon: #F2E349;  /* accent de marca (aditivo, como os demais astrum-*) */
}
```

Status: **ainda não aplicado** — aguardando mais prints de referência para fechar a
fundação (F1) de uma vez.

---

## Fila de decisão (próximos prints)

Aspectos ainda sem decisão — bons alvos para os próximos prints de referência:
- [ ] Navegação (sidebar atual vs outra estrutura; comportamento mobile/bottom nav)
- [ ] Tipografia de título (manter Space Grotesk?) e escala tipográfica
- [ ] Tabelas e listas densas (o coração do ERP)
- [ ] Gráficos/dashboards (paleta de charts no dark)
- [ ] Empty states, skeletons e feedback (toasts/dialogs)
- [ ] Tela de login do produto
