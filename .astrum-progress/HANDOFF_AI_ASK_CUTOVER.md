# HANDOFF — Cutover do `/api/ai/ask` pro `/api/v2/chat/stream` + limpeza de código morto

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. Cumpra à risca.

### 1. Objetivo (contexto, não decisão sua)

`src/lib/gemini.ts` tem `getAIResponse()`, que faz `fetch('/api/ai/ask', ...)` — essa rota **não
existe em lugar nenhum do backend** (nem Express legado, nem Fastify). Todo caminho que chama isso
cai no `catch` e devolve uma mensagem de erro genérica.

**Investigação do Claude (não refaça — já mapeado todo o `grep -rn getAIResponse src/`):**
- **`src/pages/AIConfigPage.tsx`, função `handleTestAgent` (linha ~250): é o ÚNICO call site VIVO**
  de `getAIResponse` em todo o frontend — o botão "Testar Agente" (dialog `isTestAgentOpen`, linhas
  ~2092-2119). É uma ferramenta de teste interna (envia 1 mensagem, mostra a resposta), não afeta
  cliente final.
- **`src/App.tsx`: os outros 2 call sites são CÓDIGO MORTO**, confirmado (nenhum dos dois é
  referenciado por nenhuma JSX nem chamado por nada):
  - `handleTestAgent` (linha ~1561) + estado `testAgentMessage`/`testAgentResponse`/`isTestingAgent`
    (linhas ~636-638): declarados, a função nunca é chamada, o estado nunca aparece em JSX.
  - `simulateAiChat` (linha ~2192): função inteira nunca é chamada em lugar nenhum do arquivo.
- **`src/pages/ChatPage.tsx`, linha ~48: import morto** — `getAIResponse as askAiAgent` é importado
  mas `askAiAgent` nunca é usado no arquivo.
- O substituto real (`/api/v2/chat/stream`, `apps/api/src/domain/ia/chat-stream.routes.ts`) é
  **streaming SSE** (`Content-Type: text/event-stream`), body `{message, conversationId?,
  customerId?}`, eventos `data: {type:'token',content}` repetidos, terminando em
  `data:{type:'done',ragUsed,botName}` ou `data:{type:'error',message}`. **Não retorna** `category`/
  `session_state_update`/`shouldEscalate`/`sentiment`/`isCritical` (esses eram sinais só do backend
  legado — não existe equivalente hoje). **Decisão do Claude: aceitar essa perda de sinal** para o
  Testar Agente (é só uma prévia de texto, nunca dependeu desses campos pra nada crítico) — não
  invente um jeito de recriar esses campos, não é seu escopo.

### 2. Lista EXAUSTIVA de arquivos permitidos (só EDITAR, nenhum CRIAR)

1. `src/pages/AIConfigPage.tsx` — adaptar `handleTestAgent` pro streaming SSE (seção 3).
2. `src/App.tsx` — remover código morto (seção 4).
3. `src/pages/ChatPage.tsx` — remover import morto (seção 4).
4. `src/lib/gemini.ts` — remover `getAIResponse` (só depois de confirmar, por grep, que ninguém mais
   importa — seção 5).

**NÃO TOCAR:** `apps/api/src/domain/ia/chat-stream.routes.ts` (backend já pronto, não mexer),
`src/lib/gemini.server.ts` (é OUTRO `getAIResponse`, do lado servidor/worker legado — nome igual,
arquivo diferente, **não é o mesmo símbolo, não toque**), `src/workers/messageWorker.ts` (idem).

**Ações proibidas:** instalar dependências novas; `git push` (só commit local); `git add -A`/`.`;
"restaurar" ou tentar consertar `simulateAiChat`/o `handleTestAgent` de `App.tsx` — são código morto,
a decisão é REMOVER, não fazer funcionar; inventar novos campos de resposta que o v2 não manda.

Se o código real divergir do descrito aqui (uma função que na verdade tem caller, um import que não
bate), **PARE e reporte** — não adivinhe, e principalmente **não delete nada até confirmar de novo
com grep que é mesmo código morto** (o Claude já confirmou, mas confira de novo antes de apagar —
é uma operação destrutiva).

---

## 3. `AIConfigPage.tsx` — adaptar `handleTestAgent` (o único caminho vivo)

Import no topo do arquivo já tem `apiGet, apiPost, apiPut, apiDelete` de `@/src/lib/apiClient`
(linha ~17) — adicione `api` (é a função de baixo nível que devolve o `Response` cru, necessária pra
ler o stream SSE manualmente; `apiPost` normal não serve aqui porque já tenta parsear JSON):
```ts
import { api, apiGet, apiPost, apiPut, apiDelete } from '@/src/lib/apiClient';
```

Remova `getAIResponse` do import de `'@/src/lib/gemini'` (linha ~19 hoje:
`import { getAIResponse, generateKBArticleFromTickets, SYSTEM_PROMPTS } from '@/src/lib/gemini';`)
— vira:
```ts
import { generateKBArticleFromTickets, SYSTEM_PROMPTS } from '@/src/lib/gemini';
```

Troque `handleTestAgent` (hoje, linhas ~250-259):
```ts
const handleTestAgent = async () => {
  if (!testAgentMessage.trim()) return;
  setIsTestingAgent(true); setTestAgentResponse(null);
  try {
    const res = await getAIResponse([{ role: 'user', parts: [{ text: testAgentMessage }] }], testAgentCategory);
    setTestAgentResponse(res);
  } catch (err: any) {
    setTestAgentResponse({ error: err.message || 'Erro ao testar agente' });
  } finally { setIsTestingAgent(false); }
};
```
por:
```ts
const handleTestAgent = async () => {
  if (!testAgentMessage.trim()) return;
  setIsTestingAgent(true); setTestAgentResponse(null);
  try {
    const response = await api<Response>('/api/v2/chat/stream', {
      method: 'POST',
      body: { message: testAgentMessage },
      raw: true,
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'token') fullText += event.content;
        if (event.type === 'error') throw new Error(event.message);
      }
    }

    setTestAgentResponse({ message: fullText || 'Sem resposta.' });
  } catch (err: any) {
    setTestAgentResponse({ error: err.message || 'Erro ao testar agente' });
  } finally { setIsTestingAgent(false); }
};
```

**Não mude o JSX do dialog (linhas ~2092-2119)** — ele já lê `testAgentResponse.message ||
testAgentResponse.error` e já esconde o bloco de `category`/`shouldEscalate` quando esses campos não
existem (`{testAgentResponse.category && (...)}`), então continua renderizando certo sem eles.

**Sobre `testAgentCategory`:** não é mais enviado ao backend (o v2 não tem esse conceito de "forçar
categoria de prompt"). O estado/dropdown de `testAgentCategory` na UI **pode continuar existindo**
(é só um rótulo no título do dialog, `Teste Rápido: Agente {testAgentCategory || 'Orquestrador'}`) —
**não remova o dropdown nem o estado `testAgentCategory`**, só pare de mandá-lo pro backend.

---

## 4. Remoção de código morto

**`src/App.tsx`:**
1. Remover o bloco de estado (~linha 636-638):
   ```ts
   const [testAgentMessage, setTestAgentMessage] = useState("");
   const [testAgentResponse, setTestAgentResponse] = useState<any>(null);
   const [isTestingAgent, setIsTestingAgent] = useState(false);
   ```
2. Remover a função `handleTestAgent` inteira (~linha 1561-1576).
3. Remover a função `simulateAiChat` inteira (~linha 2192-2329) — **antes de remover, confirme por
   grep dentro do PRÓPRIO `App.tsx`** que nada mais chama `simulateAiChat(` (o Claude confirmou 0
   call sites, mas confira de novo — é destrutivo).
4. Remover `getAIResponse` do import de `'./lib/gemini'` (~linha 207-215) — as outras chaves desse
   import (`AGENT_CATEGORIES, SYSTEM_PROMPTS, summarizeTicketHistory, summarizeCustomerHistory,
   getSmartReplies, generateKBArticleFromTickets`) **continuam** (confirme por grep dentro do
   arquivo se cada uma ainda é usada antes de decidir remover mais alguma — só `getAIResponse` está
   confirmado morto, as outras não foram investigadas, não mexa nelas).

**`src/pages/ChatPage.tsx`:**
5. No import (~linha 46-49):
   ```ts
   import {
     summarizeTicketHistory as summarizeTicket,
     getAIResponse as askAiAgent,
   } from "@/src/lib/gemini";
   ```
   vira:
   ```ts
   import {
     summarizeTicketHistory as summarizeTicket,
   } from "@/src/lib/gemini";
   ```
   (`summarizeTicket` continua — é usado de verdade, linha ~532. Só a linha do `askAiAgent` some.)

---

## 5. `src/lib/gemini.ts` — remover `getAIResponse`

**Só faça isto DEPOIS dos passos 3 e 4 acima.** Rode:
```bash
grep -rn "getAIResponse" src/ --include="*.tsx" --include="*.ts"
```
O resultado esperado, depois dos passos acima: **só a definição** em `src/lib/gemini.ts` (a função
em si) — nenhum import/call site em mais nenhum arquivo `.tsx`/`.ts` sob `src/` (⚠️ `gemini.server.ts`
tem sua PRÓPRIA função de mesmo nome — é um arquivo diferente, aparece no grep, **não é um caller do
`gemini.ts`**, ignore-o; confirme lendo a linha — se for `export async function getAIResponse` DENTRO
de `gemini.server.ts`, é a outra função, não mexa). Se sobrar QUALQUER outro caller real, **PARE e
reporte** — não remova a função com um caller vivo ainda apontando pra ela.

Confirmado que está só a definição sobrando, remova a função `getAIResponse` inteira (linhas
~567-602 do arquivo hoje, incluindo o comentário `// Placeholder for client-side usage...` logo
acima dela).

---

## 6. Verificação mecânica obrigatória

```bash
grep -rn "getAIResponse\|api/ai/ask" src/ --include="*.tsx" --include="*.ts"
```
Depois de tudo: só deve aparecer, no máximo, a ocorrência dentro de `gemini.server.ts` (função
diferente, mesmo nome — ver seção 5). **Zero** ocorrências de `/api/ai/ask` (string) em qualquer
lugar do `src/`.

## 7. Definition of Done

1. `npm run typecheck:legacy` (raiz) — **0 erros**, sem exceção (é frontend, não tem baseline de
   dívida pré-existente pra esse comando).
2. Não crie teste novo pra isso (é edição de UI existente, sem lógica pura nova extraída) — mas
   rode a suíte de testes que já existe pra esses 2 arquivos, se houver
   (`src/__tests__/pages/AIConfigPage.test.tsx` — existe, ache e rode:
   `npx vitest run src/__tests__/pages/AIConfigPage.test.tsx`) e confirme que não quebrou.
3. Verificação mecânica da seção 6 limpa.
4. 1 commit local (`git add` só os 4 arquivos da seção 2, nunca `-A`/`.`), sem `git push`.

## 8. Report final obrigatório

Lista exata de arquivos editados, hash do commit, saída colada do typecheck e do teste, resultado
do grep da seção 6, e qualquer desvio do spec com o motivo (principalmente se algo que o Claude
marcou como "código morto" na verdade tinha um caller vivo — isso é o tipo de coisa que TEM que ser
reportada, não corrigida por conta própria).

Se algo aqui conflitar com um impulso seu de "melhorar", o contrato ganha. Fim do contrato.

---

> Escrito pelo Claude em 2026-08-18. Investigação prévia (não refaça): rastreei TODOS os call sites
> de `getAIResponse` no repo (5 arquivos) e confirmei quais são vivos vs mortos lendo o uso real de
> cada estado/função nos arquivos — 2 dos 3 "usos" no frontend eram código morto que nunca foi
> percebido. Decisão do dono: adaptar o único caminho vivo pro contrato v2 (não construir shim).
