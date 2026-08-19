# HANDOFF — SEC-R5: gravação cifrada de `openaiApiKey`/`evolutionApiKey`

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. Cumpra à risca. Isto é segurança (SEC-R5, auditoria 2026-08-10) — o
desenho já foi decidido pelo Claude, você só implementa exatamente como descrito abaixo.
**Não invente variações "melhores".**

### 1. Objetivo (contexto, não decisão sua)

Hoje `tenants.integration_keys` (JSONB) é gravado **direto do browser** em texto puro
(`src/lib/db.ts saveIntegrationKeys` → `supabase.from('tenants').update(...)`). Dentro
desse blob, **só 2 campos são secretos de verdade**: `openaiApiKey` e `evolutionApiKey`
(confirmado pelo tipo `TenantKeys` em `apps/api/src/lib/tenant-keys.ts` — **não mexa em
nenhum outro campo do blob**, ex.: `whatsappInstances`, `evolutionUrl`,
`evolutionInstance`, ou os campos por-feature do AIConfigPage tipo `openaiGlobal`/
`geminiKb` — esses ficam exatamente como estão, fora de escopo).

**Já existe (não reinvente):**
- `apps/api/src/adapters/erp/credential-cipher.ts` já exporta `encryptString`/
  `decryptString`/`looksEncrypted` (comentário no código diz literalmente "SEC-R5") —
  AES-256-GCM, envelope `base64(iv):base64(tag):base64(cipher)`, chave `ERP_CRED_KEY`
  (32 bytes hex ou base64, env). **Use essas funções, não escreva cripto nova.**
- `apps/api/src/lib/tenant-keys.ts` **já lê** de forma tolerante (decifra se
  `looksEncrypted`, senão trata como texto puro legado) — é o lado LEITURA do SEC-R5, já
  pronto. **O que falta é só a ESCRITA cifrada** + os leitores do backend legado.
- Padrão de UI a copiar (JÁ SHIPPED no mesmo arquivo): `src/pages/SettingsPage.tsx`
  linhas ~614-736 — credenciais de ERP (Voalle/HubSoft/SGP/RBX/IXC) não pré-preenchem o
  segredo, mostram só "✓ Configurado" via `fetchErpStatus`/`configuredProviders` (Set) e
  o backend correspondente é `apps/api/src/domain/erp/erp-admin.routes.ts`. **Copie esse
  padrão para os 2 campos deste spec — mesma ideia, arquivos diferentes.**

**Por que a chave é `ERP_CRED_KEY` e não `CPF_ENCRYPTION_KEY`:** são dois módulos de
cifra DIFERENTES e não-intercambiáveis neste repo — `apps/api/.../credential-cipher.ts`
(ERP_CRED_KEY) e `src/lib/fieldCipher.ts` (CPF_ENCRYPTION_KEY, legado `/src`). O
`tenant-keys.ts` (já em produção) decifra com `ERP_CRED_KEY` — então a escrita TEM que
cifrar com a mesma chave, senão o que for salvo fica ilegível pro que já lê. **Não troque
essa escolha.**

### 2. Lista EXAUSTIVA de arquivos permitidos

**CRIAR:**
1. `apps/api/src/domain/provedor/integration-secrets.routes.ts`
2. `apps/api/src/domain/provedor/integration-secrets.service.ts` (lógica pura, testável)
3. `apps/api/src/domain/provedor/integration-secrets.service.test.ts`
4. `src/lib/erpCredentialCipher.ts` (porta READ-ONLY do algoritmo — só `decryptString` +
   `looksEncrypted`, sem `encryptString`: o legado nunca GRAVA cifrado, só LÊ)
5. `src/__tests__/lib/erpCredentialCipher.test.ts`

**EDITAR:**
6. `apps/api/src/server.ts` (só registrar a rota nova, 2 linhas, mesmo padrão de
   `erpAdminRoutes`/`departmentsRoutes` — ache o import+register de qualquer uma delas e
   copie o formato exato)
7. `src/lib/db.ts` (só a função `saveIntegrationKeys`, linhas ~239-253 hoje — trocar o
   corpo pra chamar o endpoint novo; **assinatura da função NÃO muda**, então
   `AIConfigPage.tsx`/`WhatsAppPage.tsx` continuam funcionando sem tocar neles)
8. `src/lib/dbAdmin.ts` (a função `getIntegrationKeys`, decifrar os 2 campos na leitura)
9. `src/pages/SettingsPage.tsx` (só os 2 blocos dos inputs de `evolutionApiKey` e
   `openaiApiKey` — hoje nas linhas ~1258-1259 e ~1369-1370 — mais o `fetchErpStatus`
   existente vira também status destes 2 campos, OU um `fetchIntegrationSecretsStatus`
   irmão; detalhe na seção 5)

**NÃO TOCAR:** qualquer outro campo de `integration_keys` (`whatsappInstances`,
`evolutionUrl`, `evolutionInstance`, `whatsappAlias`, `${provider}Global`/
`${provider}${Feature}` do AIConfigPage), `AIConfigPage.tsx`, `WhatsAppPage.tsx`,
`ChatPage.tsx`, `ServiceOrdersPage.tsx`, `App.tsx` (todos só fazem `if
(!integrationKeys.evolutionApiKey)` — checagem de truthy, ciphertext continua truthy,
**não precisam mudar** — confirme isso e PARE se achar algum desses enviando o valor cru
pra algum lugar em vez de só checar truthy).

**Ações proibidas:** instalar dependências novas; `git push` (só commit local); `git add
-A`/`.`; inventar uma 3ª chave de cifra; decifrar no browser (o `ERP_CRED_KEY` NUNCA pode
chegar num bundle Vite — se você sentir vontade de fazer isso, pare, é exatamente o bug
que o CPF/ERP já tiveram antes); tocar em `fieldCipher.ts`/`CPF_ENCRYPTION_KEY`.

Se o código real divergir do que está descrito aqui (ex.: os campos já mudaram de nome,
os call-sites são outros), **PARE e reporte** — não adivinhe.

---

## 3. Backend — endpoint novo

`apps/api/src/domain/provedor/integration-secrets.service.ts` — funções puras:

```ts
import { encryptString, looksEncrypted } from '../../adapters/erp/credential-cipher';

const SECRET_FIELDS = ['openaiApiKey', 'evolutionApiKey'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

/**
 * Mescla `incoming` no `existing` (mesma semântica do saveIntegrationKeys atual:
 * spread por cima). Para os 2 campos secretos, cifra o valor recebido (se não-vazio e
 * ainda não cifrado — idempotente, evita cifrar 2x um valor que já veio cifrado por
 * engano). Todo o resto passa direto, sem tocar.
 */
export function mergeAndEncryptIntegrationKeys(
  existing: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged = { ...existing, ...incoming };
  for (const field of SECRET_FIELDS) {
    const value = incoming[field];
    if (value && !looksEncrypted(value)) {
      merged[field] = encryptString(value);
    }
  }
  return merged;
}

/** Status sem vazar segredo: só diz se cada campo está configurado. */
export function computeSecretsStatus(stored: Record<string, string>): Record<SecretField, boolean> {
  return {
    openaiApiKey: !!stored.openaiApiKey,
    evolutionApiKey: !!stored.evolutionApiKey,
  };
}
```

`apps/api/src/domain/provedor/integration-secrets.routes.ts` — siga o estilo de
`erp-admin.routes.ts` (auth simples, tenant do JWT, nunca do body):

```ts
import type { FastifyInstance } from 'fastify';
import supabase from '../../infrastructure/database/supabase.client';
import { mergeAndEncryptIntegrationKeys, computeSecretsStatus } from './integration-secrets.service';

export async function integrationSecretsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/settings/integration-keys/status', { onRequest: auth }, async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const { data } = await supabase
      .from('tenants').select('integration_keys').eq('id', tenantId).maybeSingle();
    return computeSecretsStatus((data?.integration_keys as Record<string, string>) ?? {});
  });

  app.put<{ Body: { keys: Record<string, string> } }>(
    '/api/v2/settings/integration-keys',
    { onRequest: auth },
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

      const { keys } = req.body;
      if (!keys || typeof keys !== 'object') {
        return reply.code(400).send({ error: 'keys obrigatório (objeto)' });
      }

      const { data } = await supabase
        .from('tenants').select('integration_keys').eq('id', tenantId).maybeSingle();
      const existing = (data?.integration_keys as Record<string, string>) ?? {};

      let merged: Record<string, string>;
      try {
        merged = mergeAndEncryptIntegrationKeys(existing, keys);
      } catch (err) {
        return reply.code(500).send({ error: 'Falha ao cifrar. Verifique ERP_CRED_KEY.' });
      }

      const { error } = await supabase
        .from('tenants').update({ integration_keys: merged }).eq('id', tenantId);
      if (error) return reply.code(500).send({ error: 'Erro ao salvar' });
      return { ok: true };
    },
  );
}
```

Confirme os imports relativos reais (`supabase.client`, etc.) abrindo
`erp-admin.routes.ts` e copiando os paths de lá — não copie cego os deste spec se o
arquivo real tiver import diferente.

**Registro em `server.ts`** — mesmo padrão do `erpAdminRoutes`:
```ts
const { integrationSecretsRoutes } = await import('./domain/provedor/integration-secrets.routes');
await app.register(integrationSecretsRoutes);
```

**Teste (`integration-secrets.service.test.ts`)** — sem mock de rede, só as funções
puras. Cobrir: (a) campo secreto novo em texto puro → sai cifrado (`looksEncrypted` no
resultado); (b) campo secreto que já chega cifrado (`incoming[field]` já no formato
`iv:tag:cipher`) → **não cifra de novo** (resultado === valor recebido, sem duplo
envelope); (c) campo secreto vazio/ausente no `incoming` → mantém o `existing` como
estava (merge normal, sem apagar); (d) campo não-secreto (`whatsappInstances`,
`evolutionUrl`, qualquer outro) → passa direto, nunca cifrado; (e)
`computeSecretsStatus` → `true` quando o campo tem qualquer valor (cifrado ou não),
`false` quando ausente/vazio.

---

## 4. Frontend — `src/lib/db.ts` (trocar a implementação, manter a assinatura)

Import do `apiClient` no topo do arquivo (confirme se já existe; se não, adicione):
```ts
import { apiPut } from '@/src/lib/apiClient';
```

Trocar o corpo de `saveIntegrationKeys` (linhas ~239-253 hoje):
```ts
export const saveIntegrationKeys = async (keys: Record<string, string>) => {
  try {
    await apiPut('/api/v2/settings/integration-keys', { keys });
  } catch (err) {
    logDbError(err, OperationType.WRITE, "tenants.integration_keys");
    throw err;
  }
};
```
Note que `getIntegrationKeys` (a função de LEITURA logo acima, linhas ~222-237) **não
muda** — continua lendo direto do Supabase como hoje. O que muda é só quem grava.

---

## 5. Frontend — `src/pages/SettingsPage.tsx`

Copie o padrão já usado no MESMO arquivo para status de credencial ERP
(`fetchErpStatus`/`configuredProviders`, linhas ~614-736) — mas para estes 2 campos.

**Novo estado + fetch**, perto de onde `configuredProviders` é declarado:
```ts
const [secretsConfigured, setSecretsConfigured] = useState<{ openaiApiKey: boolean; evolutionApiKey: boolean }>({
  openaiApiKey: false,
  evolutionApiKey: false,
});

const fetchIntegrationSecretsStatus = async () => {
  try {
    const data = await apiGet<{ openaiApiKey: boolean; evolutionApiKey: boolean }>(
      '/api/v2/settings/integration-keys/status',
    );
    setSecretsConfigured(data);
  } catch { /* sem permissão ou erro — deixa os dois false */ }
};

useEffect(() => {
  fetchIntegrationSecretsStatus();
}, [tenantId]);
```

**Nos 2 inputs** (ache pelo `value={integrationKeys.evolutionApiKey || ''}` e
`value={integrationKeys.openaiApiKey || ''}` — linhas ~1258 e ~1369 hoje): pare de
prefilar com o valor guardado (que agora pode ser ciphertext) e mostre o status ao lado,
mesmo estilo visual do "✓ Configurado" das credenciais ERP no mesmo arquivo:

```tsx
{/* evolutionApiKey — antes: value={integrationKeys.evolutionApiKey || ''} */}
<Input
  type="password"
  placeholder={secretsConfigured.evolutionApiKey ? '••••••••  (configurado — digite para trocar)' : 'Cole a Global API Key da Evolution'}
  value={integrationKeys.evolutionApiKey || ''}
  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
/>
{secretsConfigured.evolutionApiKey && (
  <span className="text-xs text-emerald-500">✓ Configurado</span>
)}
```
(mesma estrutura para `openaiApiKey`, texto do placeholder trocando pra "Cole sua OpenAI
API Key"). **Mantenha o `onChange` como está** — o usuário ainda digita um valor NOVO
normalmente; a diferença é só que o campo não vem mais PRÉ-preenchido com o valor salvo.
Depois de salvar (`onClick` do botão de salvar que já existe, que hoje chama
`saveIntegrationKeys`/o equivalente na página), chame `fetchIntegrationSecretsStatus()`
de novo (mesmo padrão do `fetchErpStatus()` pós-save nos outros botões desta página) e
**limpe o campo do state local** (`setIntegrationKeys(prev => ({...prev, evolutionApiKey: ''}))`)
pra não deixar o valor novo digitado boiando no input depois de salvo.

Ache o botão real de salvar que cobre esses 2 campos hoje (procure por onde
`saveIntegrationKeys`/`saveIntegrationKeysDb`/similar é chamado NESTA página — pode ser
um botão específico de "Salvar Integrações" ou parte de um salvamento maior) — se não
achar um botão dedicado e esses 2 campos forem salvos junto com um blob maior de
configurações desta página, **pare e reporte a estrutura real antes de inventar um fluxo
novo de salvamento**.

---

## 6. Backend legado (`/src`) — decrifra pros workers em produção

**Por quê:** `src/lib/dbAdmin.ts getIntegrationKeys` é lido por
`src/workers/messageWorker.ts`, `src/workers/cobraiWorker.ts`, `src/lib/whatsappSender.ts`
e `src/lib/integrations/erpAdapter.ts` — todos rodando em produção HOJE (backend legado,
R4 permite correção de bug crítico). Se esses continuarem lendo o campo cru depois que a
escrita passar a cifrar, o WhatsApp/cobrança param de funcionar (o worker tentaria usar
`iv:tag:cipher` como se fosse a API key de verdade).

`src/lib/erpCredentialCipher.ts` (porta READ-ONLY, mesma chave `ERP_CRED_KEY`, MESMO
algoritmo de `apps/api/src/adapters/erp/credential-cipher.ts` — copie fielmente, não
"melhore"):

```ts
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.ERP_CRED_KEY;
  if (!raw) throw new Error('ERP_CRED_KEY não configurada');
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ERP_CRED_KEY deve ter 32 bytes (256 bits)');
  return key;
}

export function decryptString(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload de credencial malformado');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return out.toString('utf8');
}

export function looksEncrypted(v: string | undefined | null): boolean {
  if (!v || typeof v !== 'string') return false;
  const parts = v.split(':');
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/=]+$/.test(p));
}
```

Em `src/lib/dbAdmin.ts`, dentro de `getIntegrationKeys` (por volta da linha 8-40 hoje —
confirme o número real), depois de buscar `keys` do Supabase e ANTES do `return`, decifre
tolerante (mesma filosofia do `tenant-keys.ts`, mas sem fallback de env — se decifrar
falhar, loga e devolve string vazia, nunca lança e nunca devolve o ciphertext cru pro
worker tentar usar como se fosse a chave):

```ts
import { decryptString, looksEncrypted } from './erpCredentialCipher';

// ... dentro de getIntegrationKeys, antes do return:
for (const field of ['openaiApiKey', 'evolutionApiKey'] as const) {
  const value = keys[field];
  if (value && looksEncrypted(value)) {
    try {
      keys[field] = decryptString(value);
    } catch (err) {
      console.error(`[erpCredentialCipher] falha ao decifrar ${field}:`, err);
      keys[field] = '';
    }
  }
}
```

Confira a estrutura exata de `getIntegrationKeys` em `dbAdmin.ts` (pode ter mais de uma
função/overload por tenantId) — aplique a MESMA lógica em qualquer variante que devolva
`integration_keys` do Supabase.

**Teste (`erpCredentialCipher.test.ts`)** — cobrir: round-trip contra um valor cifrado
com `encryptString` do módulo irmão de `apps/api` (importe cross-package só NO TESTE, pra
provar compatibilidade — algo como
`import { encryptString } from '../../../apps/api/src/adapters/erp/credential-cipher'`;
se o resolvedor de módulos do vitest reclamar desse caminho, gere o ciphertext de teste
cifrando manualmente com `node:crypto` inline no teste, mesmo algoritmo, e documente por
quê); `looksEncrypted` true/false nos mesmos casos do módulo original;
`decryptString` lança em payload malformado (não mascara o erro).

---

## 7. Verificação mecânica obrigatória

```bash
grep -rn "integrationKeys.evolutionApiKey\|integrationKeys.openaiApiKey" src/pages/*.tsx src/App.tsx
```
Cada ocorrência tem que ser um **truthy check** (`if (!integrationKeys.X)` ou similar) ou
o `onChange`/`value` dos 2 inputs editados nesta spec — nenhuma outra deve **enviar** o
valor cru pra fora do browser (fetch, apiPost, etc.). Se achar uma, PARE e reporte antes
de prosseguir — não é um caso coberto por este spec.

```bash
grep -n "ERP_CRED_KEY" src/lib/erpCredentialCipher.ts apps/api/src/adapters/erp/credential-cipher.ts
```
As duas devem usar a MESMA env var.

## 8. Definition of Done

1. Baseline de typecheck ANTES/DEPOIS em `apps/api` (`npx tsc --noEmit 2>&1 | grep -c "error TS"`
   — baseline conhecido 56, confirme o número de hoje antes de começar) e
   `npm run typecheck:legacy` (raiz) — 0 antes e depois.
2. `npx vitest run apps/api/src/domain/provedor/integration-secrets.service.test.ts` verde.
3. `npx vitest run src/__tests__/lib/erpCredentialCipher.test.ts` verde.
4. Suítes vizinhas que tocam `dbAdmin.ts`/`db.ts` continuam verdes (rode
   `npx vitest run src/lib` pra conferir não-regressão — se algo quebrar por causa da
   mudança em `getIntegrationKeys`, corrija o teste OU pare e reporte se o teste esperava
   o comportamento antigo de propósito).
5. Verificação mecânica da seção 7 limpa.
6. 1 commit local (arquivos desta lista, nunca `-A`/`.`), sem `git push`.

## 9. Report final obrigatório

Lista exata de arquivos criados/editados, hash do commit, saída colada do typecheck
(antes/depois) e dos testes, qualquer desvio do spec e o motivo — em especial se o botão
de "salvar" da seção 5 não existia do jeito esperado, ou se algum consumidor de
`evolutionApiKey`/`openaiApiKey` fizer algo além de truthy-check (seção 7).

Se algo aqui conflitar com um impulso seu de "melhorar", o contrato ganha. Fim do contrato.

---

> Escrito pelo Claude em 2026-08-18. Investigação prévia (não refaça): mapeei todos os
> consumidores de `openaiApiKey`/`evolutionApiKey` no repo (só 2 pontos de escrita real —
> AIConfigPage grava outros campos, não estes 2; SettingsPage grava estes 2 — e ~9 pontos
> de leitura, todos truthy-check exceto os workers legados que usam o valor de verdade),
> confirmei que `credential-cipher.ts` já tem `encryptString`/`decryptString` prontos
> (comentário cita SEC-R5 explicitamente), e decidi a chave (`ERP_CRED_KEY`, não
> `CPF_ENCRYPTION_KEY`) porque o lado LEITURA (`tenant-keys.ts`) já está em produção
> esperando essa chave — mudar agora quebraria o que já funciona.
