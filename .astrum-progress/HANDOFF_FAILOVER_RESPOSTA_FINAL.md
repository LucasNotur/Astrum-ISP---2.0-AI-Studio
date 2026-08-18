# HANDOFF — Failover multi-provider cobrindo a resposta final do cliente

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Você foi instruído a "executar este spec passo a passo". O escopo é **ESTRITO**. Cumpra à risca.

### 1. Objetivo (contexto, não decisão sua)

O `apps/api` já tem um mecanismo de failover multi-provider (OpenAI → Anthropic → Google/Gemini)
em `apps/api/src/infrastructure/ai/providers/model-router.ts`, função `withFailover(tier, fn, tenantId?)`.
Hoje ele só é usado em `vercel-ai.service.ts` (classificação/diagnóstico/relatório) e em
`replay.service.ts` (juiz do replay). **13 outros arquivos criam o modelo direto com `openai('gpt-4o-mini')`
/ `openai('gpt-4o')`**, sem passar pelo failover — inclusive os que geram a **resposta final que o
cliente recebe** (subgrafos de vendas/retenção/cobrança + supervisor). Se a OpenAI cair, essas chamadas
quebram mesmo com Gemini pago e funcionando. Sua tarefa: portar esses 13 arquivos para o mesmo padrão
que `vercel-ai.service.ts` já usa. **NÃO reimplemente failover, NÃO mude tiers/modelos** — só troque
quem constrói o `LanguageModel`.

### 2. Lista EXAUSTIVA de arquivos permitidos (só EDITAR, nenhum CRIAR)

**Código de produção (10 arquivos — aplicar o padrão da seção 3):**
1. `apps/api/src/domain/agent/subgraphs/vendas.subgraph.ts`
2. `apps/api/src/domain/agent/subgraphs/retencao.subgraph.ts`
3. `apps/api/src/domain/agent/subgraphs/cobranca.subgraph.ts`
4. `apps/api/src/domain/agent/multi-agent.supervisor.ts`
5. `apps/api/src/domain/agent/nodes/fetch-context.node.ts`
6. `apps/api/src/domain/campo/field-ai.adapter.ts` (⚠️ tem exceção — ver seção 5)
7. `apps/api/src/infrastructure/guardrails/safety-classifier.service.ts`
8. `apps/api/src/infrastructure/guardrails/constitution.service.ts`
9. `apps/api/src/infrastructure/ai/crag.service.ts`
10. `apps/api/src/infrastructure/vision/vision.service.ts`
11. `apps/api/eval/judge.ts` (script de eval, não é tráfego de produção, mas segue o mesmo padrão)

**Limpeza trivial (1 arquivo — NÃO aplicar o padrão da seção 3, é outra coisa):**
12. `apps/api/src/infrastructure/ai/prompt-cache.service.ts` — este arquivo importa `openai` de
    `@ai-sdk/openai` e `generateText` de `ai` **mas nunca os chama** (confirmado por grep — é import morto).
    Ação: remover as duas linhas de import (`import { openai } from '@ai-sdk/openai';` e
    `import { generateText } from 'ai';`) e mais nada. Não toque no resto do arquivo.

**Testes que PRECISAM de ajuste (4 arquivos — ver seção 4, senão eles quebram):**
13. `apps/api/src/infrastructure/guardrails/constitution.service.test.ts`
14. `apps/api/src/infrastructure/guardrails/safety-classifier.service.test.ts`
15. `apps/api/src/infrastructure/vision/vision.service.test.ts`
16. `apps/api/src/infrastructure/ai/crag.service.test.ts`

**Marcar ao final:**
17. `.astrum-progress/HANDOFF_FAILOVER_RESPOSTA_FINAL.md` (só marcar como concluído no fim, seção 8)

### 3. NÃO TOCAR (fora de escopo, decisão já tomada — não "resolva" isso)

- `apps/api/src/infrastructure/cache/semantic-cache.service.ts` — usa `embed()` (embeddings), não é
  chat model. `withFailover` é só para `LanguageModel` de chat; embeddings não têm o mesmo endpoint
  drop-in nos outros providers. Fora de escopo por decisão do Claude, não do modelo executor.
- `apps/api/src/infrastructure/ai/providers/model-router.ts` — já existe, funciona, não mexer.
- `apps/api/src/domain/agent/subgraphs/vendas.subgraph.test.ts` e
  `apps/api/src/domain/agent/multi-agent.service.test.ts` — usam injeção de dependência
  (`deps.generateTextFn` / `deps.classifyDomainFn`) que **nunca chama** o `openai(...)` real. Não
  precisam de mudança. Se ao rodar você achar que "precisam", **PARE e reporte** — não edite.
- Qualquer arquivo não listado na seção 2.

**Ações proibidas:** instalar dependências novas; `git push` (só commit local — o Claude audita e sobe);
`git add -A` / `git add .` (só `git add <arquivos exatos>`); renomear símbolos fora do necessário;
"melhorar"/refatorar algo que não está no escopo; trocar qual modelo é usado (gpt-4o vs gpt-4o-mini) —
o tier de cada call site está definido abaixo, não invente.

Se o código real de qualquer arquivo divergir do que está descrito aqui (uma linha diferente, um
símbolo que não existe), **PARE e reporte** — não adivinhe.

---

## 4. O padrão a aplicar (leia com atenção — é sempre a mesma transformação)

Hoje: `model: openai('gpt-4o-mini') as any` (ou um `const xModel = openai(...)` no topo do arquivo,
reusado em várias chamadas). Depois: o model é resolvido DENTRO de um callback passado a
`withFailover`, que escolhe o provider e tenta o próximo em caso de falha retryável.

**Import a trocar em todo arquivo de produção da lista (exceto o nº 12):**
```ts
// REMOVER (a linha exata varia — remova o import de `openai`/`createOpenAI` de '@ai-sdk/openai'
// que for usado só para construir o model; se o arquivo usa createOpenAI para outro fim, ver seção 5)
import { openai } from '@ai-sdk/openai';

// ADICIONAR (caminho relativo varia por arquivo — está indicado na tabela abaixo)
import { withFailover } from '<caminho-relativo-para>/infrastructure/ai/providers/model-router';
```

**Transformação de cada call site — exemplo completo (retirado de `retencao.subgraph.ts`):**

ANTES:
```ts
const miniModel = openai('gpt-4o-mini');
// ...
    const { text } = await generate({
      model: miniModel as any,
      system: prompt.system,
      prompt: prompt.user,
    });
```

DEPOIS:
```ts
// (remova a linha `const miniModel = openai('gpt-4o-mini');` — não sobra constante nenhuma)
// ...
    const { text } = await withFailover('mini', (model) => generate({
      model: model as any,
      system: prompt.system,
      prompt: prompt.user,
    }), tenantId);
```

Regra: **todo** bloco que hoje faz `generateText({...})` ou `generateObject({...})` com
`model: <constanteModuloOuInline> as any` passa a ficar **dentro** do callback `(model) => ...`, e a
chamada inteira passa a ficar dentro de `withFailover('<tier>', (model) => ..., <tenantId ou nada>)`.
O `tier` é `'mini'` para todo call site que hoje usa `gpt-4o-mini`, e `'full'` para todo call site que
hoje usa `gpt-4o`. **Não troque o tier de nenhum call site** — a tabela abaixo diz qual é qual.

### Regra de `tenantId` (importante — não pule, não invente parâmetro novo)

- Se a função onde está o call site **já tem `tenantId` no escopo** (parâmetro da função, ou
  destruturado de `state`, ou passado por quem chamou), passe como **3º argumento** de `withFailover`.
- Se **não tem**, **não adicione um parâmetro novo só para isso** — chame `withFailover(tier, fn)` sem
  3º argumento (o default do próprio `model-router.ts` é `'unknown'`; é aceitável, mesmo padrão que o
  arquivo já usa para outras coisas). A tabela abaixo já diz, por arquivo/função, se tem ou não.

### Tabela por arquivo

| # | Arquivo | Import relativo do model-router | Call sites (tier) | tenantId disponível? |
|---|---|---|---|---|
| 1 | `domain/agent/subgraphs/vendas.subgraph.ts` | `../../../infrastructure/ai/providers/model-router` | 13× `generateText` (mini) + 4× `generateObject` (mini) | Os 13 `generateText` sim (`tenantId` está em `state`/parâmetro). Os 4 `generateObject` (dentro de `extractAddress`, `extractPlanSelection`, `extractPersonalData`, `extractDate`) **NÃO** — chame sem 3º argumento. |
| 2 | `domain/agent/subgraphs/retencao.subgraph.ts` | `../../../infrastructure/ai/providers/model-router` | 1× `generateText` (mini) | Sim |
| 3 | `domain/agent/subgraphs/cobranca.subgraph.ts` | `../../../infrastructure/ai/providers/model-router` | 1× `generateText` (mini) | Sim |
| 4 | `domain/agent/multi-agent.supervisor.ts` | `../../infrastructure/ai/providers/model-router` | 1× `generateObject` (mini, dentro de `classifyDomain`) | Sim (`tenantId` é parâmetro de `classifyDomain`) |
| 5 | `domain/agent/nodes/fetch-context.node.ts` | `../../../infrastructure/ai/providers/model-router` | 1× `generateObject` (mini, dentro de `translateQueryToPt`) | Sim (`tenantId` é parâmetro) |
| 6 | `domain/campo/field-ai.adapter.ts` | `../../infrastructure/ai/providers/model-router` | ⚠️ ver seção 5 — não é o padrão simples | — |
| 7 | `infrastructure/guardrails/safety-classifier.service.ts` | `../ai/providers/model-router` | 1× `generateObject` (mini, dentro de `classifyResponseSafety`) | Sim |
| 8 | `infrastructure/guardrails/constitution.service.ts` | `../ai/providers/model-router` | 1× `generateObject` (mini, dentro de `critiqueAndRevise`) | **Não** — `critiqueAndRevise(response, principles, context?)` não recebe `tenantId`. Chame sem 3º argumento. |
| 9 | `infrastructure/ai/crag.service.ts` | `./providers/model-router` | 3× `generateObject` (mini, dentro de `gradeContext`, `rewriteQuery`, `selfCheck`) | Sim, todas as 3 |
| 10 | `infrastructure/vision/vision.service.ts` | `../ai/providers/model-router` | 1× `generateObject` (mini, dentro de `classifyDocumentType`) + 4× `generateObject` (full, dentro de `extractEnergyBill`, `extractCompetitorInvoice`, `extractBoleto`, `classifyFieldPhoto`) | Sim, todas |
| 11 | `eval/judge.ts` | `../src/infrastructure/ai/providers/model-router` | 1× `generateObject` (mini, dentro de `judge`) | Sim (`tenantId` é parâmetro) |

Em todos os casos, remova a constante de módulo que guardava o model (`miniModel`, `visionModel`,
`classifyModel`, `grader`) — depois da mudança ela não é usada em nenhum outro lugar do arquivo (o
`model` passa a vir do parâmetro do callback). Confirme isso com grep antes de reportar (seção 6).

---

## 5. Caso especial — `field-ai.adapter.ts` (BYOK do tenant, NÃO é o padrão simples)

Este arquivo tem um parâmetro `apiKey?: string` — é a chave OpenAI **do próprio tenant** (BYOK), não
uma das chaves de infra do `model-router.ts`. Quando o tenant fornece a própria chave, ele está
escolhendo explicitamente usar a OpenAI com o crédito dele — **isso não deve passar por
`withFailover`** (que resolve chaves de `process.env`, ignorando esse `apiKey`). Só quando `apiKey`
**não** é fornecido é que faz sentido cair no failover multi-provider da infra.

ANTES:
```ts
import { generateText } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { infraLogger } from '../../infrastructure/logging/logger';

export async function generateOsSummaryLLM(
  prompt: string,
  tenantId: string,
  apiKey?: string,
): Promise<string | null> {
  const model = apiKey
    ? createOpenAI({ apiKey })('gpt-4o-mini')
    : openai('gpt-4o-mini');
  try {
    const { text } = await generateText({
      model: model as any,
      prompt,
      maxOutputTokens: 180,
      temperature: 0.3,
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'field-os-summary',
      },
    });
    const trimmed = (text ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'PLANO_I: LLM summary failed (fail-open → fallback determinístico)');
    return null;
  }
}
```

DEPOIS (troque o arquivo inteiro por isto):
```ts
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withFailover } from '../../infrastructure/ai/providers/model-router';
import { infraLogger } from '../../infrastructure/logging/logger';

export async function generateOsSummaryLLM(
  prompt: string,
  tenantId: string,
  apiKey?: string,
): Promise<string | null> {
  try {
    const headers = {
      'Helicone-Property-TenantId': tenantId,
      'Helicone-Property-UseCase': 'field-os-summary',
    };
    // BYOK: se o tenant deu a própria chave OpenAI, usa ela direto (sem failover — é o
    // crédito do tenant, não da infra). Sem chave própria, usa o failover multi-provider.
    const { text } = apiKey
      ? await generateText({
          model: createOpenAI({ apiKey })('gpt-4o-mini') as any,
          prompt,
          maxOutputTokens: 180,
          temperature: 0.3,
          headers,
        })
      : await withFailover('mini', (model) => generateText({
          model: model as any,
          prompt,
          maxOutputTokens: 180,
          temperature: 0.3,
          headers,
        }), tenantId);
    const trimmed = (text ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'PLANO_I: LLM summary failed (fail-open → fallback determinístico)');
    return null;
  }
}
```

---

## 6. Ajuste obrigatório nos 4 testes (senão eles quebram — não é opcional)

Esses 4 testes fazem `vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn(...) }))` e chamam a função
REAL do service (não usam injeção de dependência). O `model-router.ts` importa `createOpenAI` (não
`openai`) de `@ai-sdk/openai` — como o mock desses testes só exporta `openai`, `createOpenAI` fica
`undefined` e quebra com `TypeError: createOpenAI is not a function` assim que a função real passar a
chamar `withFailover`. A correção: trocar o mock de `@ai-sdk/openai` por um mock direto de
`withFailover` (mais robusto — não depende de detalhe interno do `model-router.ts`).

Padrão (mesma mudança nos 4 arquivos, só o caminho relativo do import muda):

ANTES (exemplo de `crag.service.test.ts`, mas o `vi.mock('@ai-sdk/openai', ...)` aparece nos 4):
```ts
vi.mock('ai', () => ({ generateObject: generateObjectMock }));
```
(neste arquivo específico não há `vi.mock('@ai-sdk/openai', ...)` — ele nunca importou `openai`
diretamente; adicione o mock do model-router mesmo assim, pois `crag.service.ts` vai importar
`withFailover` dele.)

DEPOIS — adicione (não remova o `vi.mock('ai', ...)` existente, ele continua necessário):
```ts
vi.mock('./providers/model-router', () => ({
  withFailover: (_tier: string, fn: any) => fn({}),
}));
```

Para os outros 3, REMOVA o bloco `vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn(...) }))` e
ADICIONE no lugar dele:

- `constitution.service.test.ts`:
  ```ts
  vi.mock('../ai/providers/model-router', () => ({
    withFailover: (_tier: string, fn: any) => fn({}),
  }));
  ```
- `safety-classifier.service.test.ts`:
  ```ts
  vi.mock('../ai/providers/model-router', () => ({
    withFailover: (_tier: string, fn: any) => fn({}),
  }));
  ```
- `vision.service.test.ts`:
  ```ts
  vi.mock('../ai/providers/model-router', () => ({
    withFailover: (_tier: string, fn: any) => fn({}),
  }));
  ```

Não precisa (nem deve) mexer em mais nada nesses 4 arquivos de teste — os `mockResolvedValue`/
`expect(...)` continuam iguais, porque `generateObject`/`generateText` (de `'ai'`) continuam mockados
como antes e continuam sendo chamados normalmente dentro do callback do `withFailover` fake.

---

## 7. Verificação mecânica obrigatória (rode isto ANTES de reportar)

Para cada um dos 10 arquivos de produção da seção 2 (exceto o nº 12, `prompt-cache.service.ts`, que é
só limpeza de import morto):

```bash
grep -n "from '@ai-sdk/openai'" <arquivo>
```
**Tem que voltar vazio** (nenhum arquivo de produção da lista deve importar de `@ai-sdk/openai` no
final — exceção: `field-ai.adapter.ts` continua importando `createOpenAI`, e é esperado).

```bash
grep -n "miniModel\|visionModel\|classifyModel\|^const grader" <arquivo>
```
Também tem que voltar vazio (as constantes de módulo somem).

## 8. Definition of Done

1. **Baseline de typecheck:** ANTES de editar qualquer coisa, rode `cd apps/api && npx tsc --noEmit
   2>&1 | grep -c "error TS"` e anote o número (é o baseline atual — sabe-se que já existiam ~56 erros
   pré-existentes numa sessão anterior, mas confirme o número de HOJE, pode ter mudado). Depois de
   editar, rode de novo — **o número não pode aumentar**. Se aumentar, o erro novo tem que estar em um
   dos arquivos desta lista (aí é seu bug, corrija) — se estiver em outro arquivo, não é seu, ignore.
2. **Testes verdes** — rode da raiz do repo:
   ```
   npx vitest run apps/api/src/infrastructure/guardrails/constitution.service.test.ts apps/api/src/infrastructure/guardrails/safety-classifier.service.test.ts apps/api/src/infrastructure/vision/vision.service.test.ts apps/api/src/infrastructure/ai/crag.service.test.ts apps/api/src/domain/agent/subgraphs/vendas.subgraph.test.ts apps/api/src/domain/agent/multi-agent.service.test.ts apps/api/src/domain/agent/nodes/fetch-context.node.test.ts apps/api/src/infrastructure/ai/providers/model-router.test.ts
   ```
   Todos verdes. Se algum ficar vermelho e você não entender por quê, **PARE e reporte** — não altere o
   teste para "forçar passar".
3. **Verificação mecânica da seção 7** limpa em todos os arquivos.
4. **1 commit local** (não dar push), só com os arquivos desta spec, mensagem clara em português.
   `git add <arquivos exatos>` (nunca `-A`/`.`). Termine a mensagem do commit com
   `Co-Authored-By: DeepSeek V4 Pro <noreply@deepseek.com>` (ou o nome real do seu modelo).
5. Ao final, marque nesta seção: `- [x] Executado em <data>` e o hash do commit.

## 9. Report final obrigatório (para a auditoria do Claude)

Ao terminar, escreva:
- Lista EXATA de arquivos editados.
- Hash do commit local.
- Saída colada (não resumida) do typecheck antes/depois e do comando de testes da seção 8.
- Qualquer desvio do spec e o motivo (ex.: um arquivo que já estava diferente do que este doc descreve).

Se qualquer passo acima conflitar com um impulso seu de "melhorar" algo, o contrato ganha. Fim do
contrato.

---

> Escrito pelo Claude em 2026-08-18. Divisão de trabalho (modo híbrido "Camisa 9"): decisão de
> escopo/exclusões (embeddings fora, caso BYOK, risco dos mocks de teste) e auditoria final = Claude;
> a transformação mecânica repetitiva nos 13 arquivos = DeepSeek V4 Pro. O Claude audita o `git diff`
> real (não este report) antes de dar `git push` para o `main`.

- [x] Executado em 2026-08-18 — commit dcee5de (HEAD final difere só pela linha deste hash; ver git log)
