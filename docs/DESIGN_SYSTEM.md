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
