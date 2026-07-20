# Elenco Astrum — briefing de geração (Nano Banana / Gemini Image)

> **Para que serve:** D-014 do `DESIGN_SYSTEM.md`. Personagens em arte cel-shaded
> (linguagem Spider-Verso / What If) usados em banners de novidade, cards de
> anúncio, onboarding, empty states especiais e material de marketing.
> **Nunca** em área de trabalho densa (tabela, formulário).
>
> **Fluxo:** Lucas gera as imagens no Nano Banana com os prompts abaixo → salva em
> `public/characters/` com o nome exato da tabela → avisa na sessão → eu ligo nos
> componentes (`UpdateCard`, `MediaHero`, `SpotlightCard`).

---

## 1. Regras técnicas (o que precisa bater com o código)

| Uso no produto | Componente | Proporção | Resolução a gerar | Fundo |
|---|---|---|---|---|
| Personagem recortado em banner | `<UpdateCard characterSrc>` | 3:4 retrato | **2K** (~1536×2048) | **transparente** |
| Arte de hero de catálogo | `<MediaHero image>` | 16:9 paisagem | **2K** (~2048×1152) | cena completa |
| Capa de card | `<MediaCard aspect="poster">` | 3:4 retrato | 1K–2K (~1024×1365) | cena completa |
| Mídia de card-herói branco | `<SpotlightCard image>` | 1:1 quadrado | 1K (~1024×1024) | cena completa |

**Regras que não podem ser quebradas:**

1. **Fundo transparente** nos personagens recortados. Peça no prompt; se o Nano
   Banana devolver com fundo, gere sobre **magenta chapado `#FF00FF`** (cor que
   não existe na nossa paleta, então não sobra franja colorida) e recorte depois.
2. **Composição do hero (16:9):** os 40% da ESQUERDA são cobertos por gradiente
   escuro + texto. O personagem/assunto tem que ficar na **metade direita**.
3. **Composição do pôster (3:4):** o terço INFERIOR é coberto por gradiente +
   título. Assunto no terço superior/central.
4. **Personagem recortado:** ele fica colado na borda direita do card, então deve
   estar **virado para a esquerda** (olhando para dentro do card, na direção do
   texto). Corpo inteiro ou 3/4, pés na base do enquadramento.
5. **Sem texto na imagem.** Nada de logo, letreiro ou marca d'água — a tipografia
   é do produto, não da arte.
6. **Exportar:** PNG-24 com alpha para recortados; WebP para cenas. Comprimir
   (Squoosh/TinyPNG) para **≤ 250 KB** por arquivo — são assets de produto, não
   de portfólio.

---

## 2. DNA de estilo (prefixo obrigatório em TODO prompt)

Cole este bloco no início de qualquer geração do elenco. Ele é o que garante que
os personagens pareçam da mesma família:

```
cel-shaded comic book illustration in the style of Spider-Verse and Marvel What If,
bold clean ink outlines with varying line weight, hard-edged flat shadow shapes
(no soft gradients), subtle Ben-Day halftone dots inside the shadow areas,
limited high-contrast palette, strong colored rim lighting from behind,
semi-realistic athletic proportions, cinematic low camera angle, confident posture,
dark navy-to-black environment tones, accent glow color: {ACCENT},
no text, no logos, no watermark, no signature
```

**Cores de accent por personagem** (usar o hex exato — são os tokens do produto):

| Personagem | Accent | Hex |
|---|---|---|
| Vega | teal sinal | `#00C2A8` |
| Rigel | amarelo-limão | `#F2E349` |
| Nova | violeta nebulosa | `#A855F7` |
| Atlas | azul fibra | `#3D5AFE` |

---

## 3. O elenco

Nomes de estrelas — coerente com "Astrum". Cada um representa um domínio do produto.

### 3.1 VEGA — técnica de campo (OS, instalação, rede)

**Papel:** a heroína do trabalho de campo. Aparece em novidades de OS, app do
técnico, mapa de rede, estoque.

```
{DNA DE ESTILO com ACCENT #00C2A8}

Full body character illustration of a confident Brazilian woman field technician
in her late 20s, medium brown skin, dark hair tied back under a modern safety
helmet with a small headlamp. She wears a dark technical work jacket with teal
reflective stripes, a climbing harness with fiber optic tools and a fusion splicer
pouch. She holds a coil of glowing teal fiber optic cable that emits soft light.
Standing three-quarter view, body angled to her right, looking to the LEFT of frame
with a calm determined expression. Teal rim light outlines her silhouette from behind.
Feet planted at the bottom edge of the frame. Transparent background.
```

Arquivos esperados:
- `public/characters/vega-full.png` — corpo inteiro, recortado (3:4, 2K)
- `public/characters/vega-bust.png` — busto/meio corpo, recortado (1:1, 1K)

### 3.2 RIGEL — o cobrador estrategista (CobrAI, financeiro)

**Papel:** representa cobrança inteligente e recuperação de receita. Aparece em
novidades do CobrAI, faturamento, régua de cobrança.

```
{DNA DE ESTILO com ACCENT #F2E349}

Full body character illustration of a sharp Brazilian man in his 30s, light brown
skin, short beard, wearing a fitted dark blazer over a black turtleneck, sleeves
slightly pushed up. Around him float translucent holographic panels showing
abstract charts and payment receipts glowing in lemon yellow. One hand is open,
gesturing as if conducting the floating panels. Confident half-smile,
three-quarter view, looking to the LEFT of frame. Lemon yellow rim light from behind.
Feet planted at the bottom edge of the frame. Transparent background.
```

Arquivos esperados:
- `public/characters/rigel-full.png` (3:4, 2K)
- `public/characters/rigel-bust.png` (1:1, 1K)

### 3.3 NOVA — a inteligência de atendimento (IA, chat, WhatsApp)

**Papel:** a IA que atende. Aparece em novidades do Núcleo IA, chat, WhatsApp,
observabilidade.

```
{DNA DE ESTILO com ACCENT #A855F7}

Full body character illustration of an elegant androgynous humanoid AI presence,
translucent skin with faint constellation-like circuit patterns glowing violet
beneath the surface, calm serene face, no visible mouth seam, hair made of soft
flowing light strands that dissolve into small stars at the tips. Wears a minimal
draped dark garment with violet inner glow. Small orbiting light particles around
the hands. Serene expression, three-quarter view, looking to the LEFT of frame.
Violet nebula rim light from behind. Lower body dissolving softly into light
particles at the bottom edge of the frame. Transparent background.
```

Arquivos esperados:
- `public/characters/nova-full.png` (3:4, 2K)
- `public/characters/nova-bust.png` (1:1, 1K)

### 3.4 ATLAS — o dono do provedor (gestão, BI, dashboard)

**Papel:** a persona do cliente — quem comanda o ISP. Aparece em dashboard, BI,
relatórios, material de venda.

```
{DNA DE ESTILO com ACCENT #3D5AFE}

Full body character illustration of a Brazilian man in his 40s, dark skin, short
greying hair and trimmed beard, wearing a dark quarter-zip sweater and simple
smart trousers, arms crossed, standing tall and calm. Behind him, a large
translucent holographic map of a city network with glowing blue nodes and
connection lines. Steady confident expression, three-quarter view, looking to the
LEFT of frame. Blue rim light from behind. Feet planted at the bottom edge of the
frame. Transparent background.
```

Arquivos esperados:
- `public/characters/atlas-full.png` (3:4, 2K)
- `public/characters/atlas-bust.png` (1:1, 1K)

---

## 4. Consistência entre gerações (o pulo do gato do Nano Banana)

A força do Nano Banana é manter o mesmo personagem em imagens diferentes. Fluxo:

1. Gere a **primeira imagem** de cada personagem até ficar boa. Essa vira o
   **canônico** — guarde o arquivo original em alta.
2. Para qualquer pose/cena nova, **anexe a imagem canônica** e peça a variação:
   ```
   Using the attached character as the exact reference (same face, same hair,
   same outfit, same art style), generate: {nova pose ou cena}.
   Keep the cel-shaded Spider-Verse style, the {ACCENT} rim light and the
   transparent background.
   ```
3. Só mude UMA coisa por vez (pose OU cenário OU enquadramento). Mudar várias
   de uma vez é o que faz o personagem "escorregar".
4. Se o rosto mudar, volte para a imagem canônica — nunca use uma variação como
   referência de outra variação (o erro acumula).

---

## 5. Cenas (sem personagem) — para os componentes de catálogo

Quando precisar de arte de fundo para `<MediaHero>` / `<MediaCard>`, sem gente:

```
{DNA DE ESTILO com ACCENT #3D5AFE}

Wide cinematic illustration, 16:9. {CENA}. Empty negative space on the LEFT 40%
of the frame for text overlay. Dark navy-to-black tones, glowing accent details.
No people, no text, no logos.
```

Cenas úteis para a Astrum (substituir `{CENA}`):
- `a fiber optic cable splitting into glowing strands across a night city skyline`
- `a rooftop antenna tower under a starry sky, signal waves rippling outward`
- `an abstract constellation map where the stars are network nodes connected by light`
- `a satellite dish farm at dusk seen from a low angle`
- `close-up of a fusion splicer joining two glowing fiber strands`

Arquivos: `public/characters/scene-{nome}.webp`

---

## 6. Checklist antes de me mandar os arquivos

- [ ] Fundo realmente transparente (abrir sobre fundo escuro e conferir a franja)
- [ ] Personagem olhando para a ESQUERDA nos recortados
- [ ] Sem texto/logo/assinatura na arte
- [ ] Nome do arquivo exatamente como na tabela
- [ ] Comprimido para ≤ 250 KB
- [ ] Salvo em `public/characters/`
