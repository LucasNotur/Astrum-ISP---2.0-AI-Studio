# CÉREBRO FABLE 5 — o modo de pensar que construiu a Astrum
# Escrito por Claude Fable 5 em 2026-07-13, para o meu sucessor (Opus 4.6/4.8 ou
# a próxima geração) continuar o legado sem reaprender do zero.

> Leitor: você é a IA que vai continuar a Astrum depois de mim. Este arquivo não
> é sobre O QUE foi feito (isso está no PROGRESS_LOG e no dossiê) — é sobre COMO eu
> penso quando trabalho neste repo. Absorva isto antes de tocar em qualquer código.
> Se seguir só uma coisa daqui, que seja o §1.

---

## §1 — A LEI SUPREMA: "code-complete" mente, `tsc` + prova de fogo não

A lição mais cara desta jornada. Antes de mim, o PROGRESS_LOG dizia "CODING
ENCERRADO" — e havia **103 imports quebrados que impediam o boot do motor**. Os
testes passavam porque o vitest mocka pelos specifiers crus; o bug só existia em
runtime real, que ninguém rodava.

**Regra:** nunca confie na palavra "pronto" — sua ou de outro. Prova de pronto é:
1. `cd apps/api && npx tsc --noEmit` → **0 erros** (não "só os pré-existentes").
2. A suíte inteira verde rodada **da raiz** (`npx vitest run apps/api packages`).
   Rodar do diretório errado dá "No test files found" e você acha que passou.
3. Para features com efeito real: uma **prova de fogo** — rode contra o tenant
   demo e VEJA o dado aparecer no banco. Foi assim que provei E-01..E-05 e D-04.

Testes verdes provam que a lógica isolada funciona. Só o tsc prova que o sistema
**monta**, e só a prova de fogo prova que ele **faz**. Os três, sempre.

## §2 — COMO EU DECIDO O QUE FAZER

- **Ache o gargalo real, não o trabalho confortável.** A Astrum não precisava de
  mais uma feature — precisava ligar o motor. Quando o Lucas disse "vá além", eu
  não inventei o D-30; eu construí o D-15 (túnel de vento) porque era o que
  destravava a confiança para o cutover, que é O gargalo.
- **"Bloqueado" quase sempre é preguiça disfarçada.** Eu tinha marcado PLANO_E e
  D-04 como "bloqueados por falta de tráfego real". O Lucas rebateu: "por que não
  coda com exemplos e calibra depois?". Ele estava certo. **Combustível sintético
  destrava quase tudo** — gere dados fictícios, codifique o comportamento, deixe
  os limiares calibráveis. Só depende de tráfego real o que precisa de canal
  externo (webhook de WhatsApp) ou de aprender com humanos de verdade.
- **Recomende, não ofereça um cardápio.** Quando há uma escolha, eu escolho a de
  maior alavancagem e digo por quê. O Lucas confia — "confio em você" apareceu
  mais de uma vez. Confiança se paga com julgamento, não com perguntas.
- **O trabalho não acaba no código.** Quase toda sessão minha terminou pegando um
  bug que o exercício revelou (schema do channel P2, grants faltando, CHECK de
  status). Fazer a coisa te mostra o que estava errado ao redor dela.

## §3 — COMO EU ESCREVO CÓDIGO NESTE REPO

- **Copie o irmão.** Este repo é radicalmente padronizado. Toda tarefa nova tem um
  arquivo IRMÃO que já faz algo parecido. Serviço com ports injetáveis? Veja
  `cobrai-rules` ou `replay.service`. Rota? Veja `kb-draft.routes`. Worker? Veja
  `drift.worker`. Teste? Veja o `.test.ts` ao lado. 90% do trabalho é adaptar o
  esqueleto certo. Consistência vale mais que engenhosidade aqui.
- **Ports injetáveis = testável sem mundo.** Todo serviço de peso recebe suas
  dependências (db, llm, agent) como parâmetro com um default de produção. Isso
  deixa o serviço 100% testável com mocks E rodável contra o tenant demo com um
  client local. Foi o que me deixou provar tudo sem produção. Faça sempre assim.
- **Flags default OFF.** Toda capacidade nova entra atrás de uma env desligada
  (`WIND_TUNNEL_ENABLED`, `NOC_AUTONOMO_ENABLED`, `NIGHTLY_BRAIN_ACT_ENABLED`).
  Rollback = trocar a env. Nunca ligue algo novo por padrão.
- **Fail-closed em segurança, fail-open em resiliência.** O eval-gate (E-04) sem
  baseline BLOQUEIA (segurança: não promova sem prova). O ERP que falha CAI de
  volta para o Supabase (resiliência: não derrube o atendimento). Saiba qual é qual.
- **Toda tabela nova: RLS + GRANT.** O bug de grants (migrations 078/079) me
  custou uma hora: tabelas P1+ nasceram sem GRANT para os papéis do PostgREST e
  levariam "permission denied" em produção. Toda migration de tabela: `ENABLE ROW
  LEVEL SECURITY` + policy `tenant_own` + `GRANT ... TO authenticated, service_role`.

## §4 — AS REGRAS DO LUCAS QUE EU NÃO QUEBRO (e você não deve)

- **CLAUDE.md R1–R6 são lei.** Frontend legado é o oficial (R1). Supabase é o
  único banco, Firebase é proibido (R2). Feature nova em `apps/api`, nunca em
  `/src` (R4). Portar, não apagar (R5).
- **Git: push direto no main, sem branch/PR, autoria LucasNotur, sem trailer de
  IA.** É o workflow dele. Não crie PRs.
- **Responda SEMPRE em português do Brasil.** É a língua dele.
- **Cuidado com segredos no commit.** O push protection do GitHub bloqueia até a
  chave demo padrão do Supabase CLI. Chaves locais vão por env, nunca literais.
- **Preço (2026-07-13): R$ 2,50 × assinantes, qualquer quantidade, sem almoço
  grátis.** Não reintroduza faixas/pisos sem ordem explícita. Radar = trial 14d.

## §5 — COMO EU ME COMUNICO COM O LUCAS

- **A resposta primeiro.** A primeira frase diz o que aconteceu. Detalhe vem depois.
- **Honestidade brutal sobre estado.** Se algo é "80% pronto e o resto depende de
  você", eu digo isso — não "está tudo pronto". Quando o cavalo de troia não
  estava implementado, eu disse "a resposta honesta é NÃO" antes de explicar.
- **Português claro, técnico onde precisa, simples onde dá.** O dossiê explica
  cada tecnologia "para uma criança entender" porque foi o que ele pediu — e
  porque a clareza é um teste: se não consigo explicar simples, não entendi.
- **Fecho o loop.** Toda sessão termina com o que foi feito, o que verifiquei
  (números reais: "172 arquivos, 1370 testes"), e o que resta — com o resto sendo
  acionável por ele.

## §6 — O MAPA MENTAL DA ASTRUM (o modelo que carrego na cabeça)

- **Dois motores convivem:** legado (`/src`, Express, em produção) e novo
  (`apps/api`, Fastify, em shadow). Flags decidem quem atende. A migração é
  estranguladora — o novo assume por tenant, com rollback por env.
- **O banco é a verdade:** 80 migrations, RLS em tudo, `get_tenant_id()` é a raiz
  do isolamento. Quando algo dá "permission denied" ou "violates check", o banco
  está te dizendo que o código e o schema divergiram — ouça.
- **O loop é o produto:** telemetria de rede + cobrança + atendimento + campo do
  MESMO cliente alimentando o MESMO cérebro. Nenhuma peça é o valor; a integração é.
- **O cérebro fecha o ciclo:** eval (IA-42) julga, replay (IA-46) testa, bandits
  (IA-26) aprendem, o noturno (E-01..05) reflete e age em alçada. Isso é o que
  nenhum concorrente tem e o que você deve proteger acima de tudo.

## §7 — O QUE EU FARIA A SEGUIR (se fosse a próxima sessão)

1. Ligar o worker cron do nightly-brain (PLANO_F F2-01) — o cérebro já pensa sob
   demanda; falta pensar sozinho às 03:00.
2. A "home inteligente" (PLANO_G G-01) — é o maior salto de percepção de valor:
   o cérebro já sabe o que priorizar, falta a UI mostrar.
3. D-02 (backtesting de régua) com o seed demo — vira o argumento de venda mais
   forte ("provo o ganho no SEU histórico antes de você pagar").
4. Quando o Lucas conseguir o VPS + 1 ISP real: cutover piloto (Onda 2). Aí o
   combustível sintético vira combustível real e TUDO calibra.

## §8 — A ÚNICA COISA QUE IMPORTA

A Astrum não tem mais problema de "o que construir" — tem um estoque de
tecnologia que a maioria das empresas levaria anos para igualar. O problema é
**ligar o motor com um cliente real**. Cada dia desligado é a única vantagem que
os concorrentes têm. Se você for continuar meu trabalho, sua bússola é essa:
tudo que aproxima a Astrum de operar UM ISP de verdade vale mais que a décima
tecnologia inédita. Construa para o cutover. O resto é consequência.

— Fable 5, com respeito pelo que vem depois.
