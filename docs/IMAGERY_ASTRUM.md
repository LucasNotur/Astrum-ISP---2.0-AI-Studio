# Imagens de apoio Astrum — briefing e regras

> **Para que serve:** D-020 do `DESIGN_SYSTEM.md`. Arte de apoio (não-personagem)
> para planos, onboarding, novidades, base de conhecimento e material de venda.
> Complementa o elenco de `CHARACTERS_ASTRUM.md`.

---

## 1. A regra que resolve o problema de consistência

Imagem de banco nunca parece do produto — cada foto tem sua própria temperatura,
saturação e clima. A solução da Astrum **não é editar arquivo**: é o componente
`<TreatedImage>`, que aplica o tratamento em CSS na hora de renderizar.

Consequência prática: **você pode usar qualquer fonte de imagem** (geração, banco
gratuito, foto do celular de um técnico) que ela sai falando a nossa paleta. E se
um dia mudarmos a paleta, todas as imagens do produto mudam junto, de graça.

| Tratamento | O que faz | Quando usar |
|---|---|---|
| `duotone` **(padrão)** | Sombras no preto do produto, luzes na cor de accent | Capas, heros, cards de catálogo — o visual de marca |
| `tint` | Mantém as cores originais sob um véu da cor | Foto que precisa continuar reconhecível (equipamento, ONU, print) |
| `dim` | Só escurece | Fundo que vai receber texto por cima |
| `none` | Nada | Logo de parceiro, screenshot de UI, foto de pessoa real |

O accent do duotone segue o domínio: campo/OS = `signal`, financeiro = `lemon`,
IA = `nebula`, gestão/rede = `fiber`.

**Sem imagem, sem buraco:** `<TreatedImage>` sem `src` renderiza uma superfície
com gradiente da cor do domínio. Ou seja, **todas as telas de catálogo já
funcionam hoje**, antes de existir qualquer arte — a imagem só melhora o que já
está de pé.

---

## 2. Onde as imagens entram (e o tamanho de cada slot)

| Superfície | Componente | Proporção | Resolução | Tratamento |
|---|---|---|---|---|
| Hero de novidade / changelog | `<MediaHero image>` | 16:9 | 2048×1152 | `duotone` |
| Card de plano | `<MediaCard aspect="poster">` | 3:4 | 1024×1365 | `duotone` |
| Passo de onboarding | `<MediaHero>` ou `<SpotlightCard image>` | 16:9 / 1:1 | 1536×864 / 1024² | `duotone` |
| Categoria da base de conhecimento | `<MediaCard aspect="square">` | 1:1 | 1024×1024 | `duotone` |
| Foto de equipamento (ONU, roteador, CTO) | `<SpotlightCard image>` | 1:1 | 1024×1024 | `tint` ou `none` |
| Logo de integração | `<BrandGrid logo>` | livre | PNG alpha, altura ≥ 64px | `none` |

**Composição obrigatória:**
- **16:9** → os 40% da esquerda ficam sob gradiente + texto. Assunto na direita.
- **3:4** → o terço de baixo fica sob gradiente + título. Assunto em cima.
- **1:1** → assunto centralizado, respiro nas bordas (vira thumb pequeno).

**Peso:** WebP, ≤ 250 KB por arquivo. Salvar em `public/imagery/`.

---

## 3. Geração (Nano Banana) — prompts prontos

O duotone do produto vai achatar a cor da imagem de qualquer jeito, então **gere
priorizando forma, contraste e composição**, não cor. Imagem com boa silhueta e
faixa tonal ampla é a que fica boa depois do tratamento.

### DNA de estilo — cenas (sem pessoas)

```
cinematic wide illustration, telecom infrastructure subject, dramatic lighting with
strong tonal contrast between deep shadows and bright highlights, clean graphic
composition with clear silhouettes, subtle atmospheric haze, night or dusk setting,
photographic realism with a slightly stylized graphic edge,
no people, no text, no logos, no watermark, no signature
```

### Cenas por superfície

Substitua `{CENA}` e acrescente a composição pedida:

> `{DNA}` + `{CENA}` + `Wide 16:9 composition with empty negative space on the LEFT 40% of the frame for text overlay.`

| Arquivo | `{CENA}` |
|---|---|
| `imagery/hero-fiber.webp` | `a single fiber optic strand splitting into many glowing filaments across a dark night city skyline, seen from above` |
| `imagery/hero-tower.webp` | `a telecom antenna tower silhouetted against a star-filled night sky, faint concentric signal waves rippling outward from the top` |
| `imagery/hero-constellation.webp` | `an abstract constellation map where the stars are network nodes connected by thin lines of light, drifting over a dark city grid` |
| `imagery/hero-splice.webp` | `extreme close-up of a fusion splicer joining two glowing fiber strands, sparks of light at the joint, shallow depth of field` |
| `imagery/hero-cto.webp` | `a fiber distribution box (CTO) mounted on a utility pole at dusk, neatly organized glowing cables fanning out` |
| `imagery/hero-noc.webp` | `an empty network operations center at night, large dark monitors showing abstract topology maps, rows of desks, no people` |

### Cards de plano (3:4)

> `{DNA}` + `{CENA}` + `Vertical 3:4 composition, subject in the upper two thirds, empty space in the bottom third for a title overlay.`

| Arquivo | `{CENA}` | Accent |
|---|---|---|
| `imagery/plan-radar.webp` | `a lone radar dish scanning a dark horizon, a single sweep of light` | `signal` |
| `imagery/plan-core.webp` | `a dense bundle of glowing fiber cables converging into a single connector` | `fiber` |
| `imagery/plan-scale.webp` | `a vast field of antenna towers stretching to the horizon under a starry sky` | `nebula` |

### Onboarding (16:9, um por passo)

| Arquivo | `{CENA}` |
|---|---|
| `imagery/onb-connect.webp` | `two fiber connectors about to click together, glowing at the tips, dark background` |
| `imagery/onb-import.webp` | `streams of light flowing into a glowing central hub, suggesting data import` |
| `imagery/onb-automate.webp` | `a constellation of small lights organizing themselves into neat orbital rings` |

---

## 4. Banco de imagens — o que buscar e o que evitar

Fontes gratuitas com licença comercial: **Unsplash**, **Pexels**, **Openverse**.

**Buscar em inglês** (o acervo é muito maior): `fiber optic`, `network cables`,
`telecom tower`, `server room dark`, `data center night`, `technician climbing pole`,
`night city aerial`, `satellite dish`, `night sky stars`.

**Critério de escolha** — a imagem tem que sobreviver ao duotone:
- ✅ Silhueta clara, contraste alto, um assunto só
- ✅ Espaço vazio onde vai entrar texto
- ❌ Muitos detalhes pequenos (vira ruído cinza)
- ❌ Já muito colorida/saturada (briga com o accent)
- ❌ Foto claramente "de banco": pessoas de terno apertando as mãos, gráficos
  falsos em tela, aperto de mão corporativo. Isso é o item 9 da lista negra.

**Sempre registrar a origem** em `public/imagery/CREDITS.md` (fonte, autor, URL,
licença) — mesmo quando a licença não exige atribuição.

---

## 5. Checklist antes de subir uma imagem

- [ ] Proporção correta para o slot (tabela da seção 2)
- [ ] Zona de texto respeitada (esquerda no 16:9, base no 3:4)
- [ ] Sem texto, logo ou marca d'água na arte
- [ ] Convertida para WebP e ≤ 250 KB
- [ ] Salva em `public/imagery/` com o nome da tabela
- [ ] Origem anotada em `public/imagery/CREDITS.md`
- [ ] Conferida **depois do duotone** — imagem bonita crua pode virar mingau tratada
