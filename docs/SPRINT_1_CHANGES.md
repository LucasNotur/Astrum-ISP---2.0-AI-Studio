# Sprint 0 — Blindagem
**Data de execução:** 10 de maio de 2026
**Objetivo:** Garantir que o sistema aguenta carga real antes de qualquer escala e adere rigorosamente à LGPD e melhores práticas de segurança de acesso.

## Alterações realizadas

### 1. Validação de Ownership em Chamadas de Ferramentas da IA
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** As ferramentas da IA (como `get_billing_status` ou `update_customer_data`) podiam potencialmente acessar e modificar dados de qualquer cliente caso o usuário fornecesse um CPF ou ID arbitrário na conversa.
**Solução implementada:** Inserimos uma validação de Ownership (cruzamento com Firestore) antes da execução de tools sensíveis, verificando se o CPF/ID fornecido como argumento pertence de fato ao usuário da sessão atual (telefone autenticado do WhatsApp/SMEE).
**Diff resumido:**
```diff
+          let ownershipValid = true;
+          const toolsRequiringOwnership = ['get_billing_status', 'update_customer_data', 'run_diagnostics', 'schedule_technical_visit'];
+          
+          if (toolsRequiringOwnership.includes(toolCall.function.name) && customerData?.phone) {
+              // validação se o numero de celular associado ao CPF bate com o logado ...
+              if (!customerPhone.endsWith(phoneToMatch) && !phoneToMatch.endsWith(customerPhone)) {
+                ownershipValid = false;
+              }
```

### 2. Criptografia de Dados Sensíveis (CPF) em Repouso no Firestore
**Arquivos alterados:** `src/lib/db.ts`, `server.ts`, `src/lib/gemini.ts`
**Problema:** O CPF dos clientes estava sendo gravado em banco em texto pleno, podendo causar violação de confidencialidade dos titulares em caso de incidentes de exposição.
**Solução implementada:** Utilizada a biblioteca `node-forge` para aplicar criptografia do tipo AES-256-GCM. Ao gravar novos CPFs ou atualizar registros, um utilitário cifra os mesmos com um IV salt. Na leitura para validações via código, outro utilitário decifra o registro gerando total transparência para o restante da aplicação.
**Diff resumido:**
```diff
+export const encryptCpf = (cpf: string): string => {
+  // inicializa AES-GCM com VITE_CPF_ENCRYPTION_KEY e encoda payload + IV em Base64
+};
+export const decryptCpf = (encryptedCpf: string): string => {
+  // decodifica Base64 e aplica AES-GCM decription no payload recuperado do Firestore
+};
```

### 3. Mascaramento Sistêmico de CPF em Logs
**Arquivos alterados:** `src/lib/db.ts`, `src/lib/gemini.ts`
**Problema:** Qualquer tipo de log do console contendo o payload e execuções do cliente estava repassando o documento PII direto para observabilidade do Cloud Run.
**Solução implementada:** Criada utilidade de mascaramento que impede vazamento, exibindo sempre na estrutura restrita os 3 primeiros e os 2 últimos dígitos no log de terminal.
**Diff resumido:**
```diff
+export const maskCpfForLog = (cpf?: string): string => {
+  if (!cpf) return '';
+  const cleanCpf = cpf.replace(/\D/g, '');
+  if (cleanCpf.length < 5) return '***';
+  return cleanCpf.slice(0, 3) + '***' + cleanCpf.slice(-2);
+};
```

### 4. Anonimização do Histórico de Conversas Enviadas ao LLM
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** O histórico de contexto da IA enviava dados abertos aos serviços de IA Generativa. Era possível injetar telefones ou e-mails acidentalmente e estes registros passarem nas pontes LLM de terceiros.
**Solução implementada:** Aplicação de fluxos RegEx para omitir rigorosamente o CPF, E-mails e formatações de Telefone (formato Brasil) antes de agregar a memória conversacional no contexto da AI (`historyContext` e `lastMessage`).
**Diff resumido:**
```diff
+    const anonymizeData = (text: string) => {
+      if (!text) return "";
+      let anonymized = text.replace(/\b\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?\d{2}\b/g, '[CPF_OMITIDO]');
+      anonymized = anonymized.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL_OMITIDO]');
+      anonymized = anonymized.replace(/(\+?55\s?)?(\(?\d{2}\)?\s?)(\d{4,5}[\-\s]?\d{4})/g, '[TELEFONE_OMITIDO]');
+      return anonymized;
+    };
```

### 5. Centralização de Logs de Auditoria para LGPD (Art. 37)
**Arquivos alterados:** `src/lib/audit.ts`, `src/lib/gemini.ts`
**Problema:** A plataforma não rastreava os acessos sistêmicos de dados por parte do agente LLM (ex: quem e quando os scripts checaram um status financeiro de um CPF).
**Solução implementada:** Criado o framework `logDataAccess` para gravar logs de auditoria imutáveis no Firestore (Collection: `data_access_logs`) a cada touch/execução de Tools restritas de clientes, prevendo TTL (5 anos, `expireAt`).
**Diff resumido:**
```diff
+export const logDataAccess = async (params: DataAccessLogParams) => {
+    const expireAt = new Date();
+    expireAt.setFullYear(expireAt.getFullYear() + 5);
+    await addDoc(collection(db, 'data_access_logs'), {
+      ...params,
+      expireAt: Timestamp.fromDate(expireAt)
+    });
+}
```

## Variáveis de ambiente adicionadas
- `VITE_CPF_ENCRYPTION_KEY`: Chave string de 32 bytes em formato hex para geração e validação da criptografia AES-256-GCM dos CPFs (Utilizada pelo `node-forge`). Encontra-se padronizada e documentada no arquivo `.env.example`.

## Dependências adicionadas
- `node-forge` (^1.3.0): Suporte standalone à API moderna de Criptografia Web em runtimes Node/Browser (AES-GCM e manuseio rápido de chaves).
- `@types/node-forge` (^1.3.11): Suporte à sintaxe estrita no TypeScript.

## Pontos de atenção para próximos sprints
- Configurar formalmente a política de TTL Index do Firebase na console (`expireAt` da Collection `data_access_logs`).
- Caso existam novos serviços integrados contendo CNPJ e endereços complexos, deve-se aplicar o mesmo framework de anonimização no histórico.
- Validar a performance e latência no Dashboard caso muito volume de clientes seja apresentado decifrando AES-GCM (pode pedir paginação estrita da query nas visualizações frontend).
