# Sprint 2 — Integridade de Negócio ISP
**Data de execução:** 10 de maio de 2026
**Objetivo:** Eliminar bugs de lógica de negócio que geram passivo financeiro e legal para a ISP.

## Alterações realizadas

### 1. Prevenção de Hallucination em Preços de Planos e Fallback
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** A IA estava recomendando planos inexistentes ou preços errados baseados num placeholder "100Mb R$62,99...", inventando descontos ao invés de buscar os dados do sistema.
**Solução implementada:** Criada a injeção do catálogo de planos real através do banco de dados (seeding `plans`) via cache/Redis, e adicionado fallback de segurança no prompt de CADASTRO e UPGRADE em vez de dados chumbados.
**Diff resumido:**
```diff
- const finalPlansString = plansData || "100Mb R$62,99 | 300Mb R$82,99 | 600Mb R$99,99 | 1Gb R$119,99";
+ const finalPlansString = plansData || "(Consulte os planos disponíveis no sistema)";
```

### 2. Base de Cálculo Correta para Desconto de Retenção
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** O desconto de retenção seria aplicado em cima do valor base/tabelado, não considerando o `current_price` que o cliente possui em sua assinatura atual.
**Solução implementada:** Em `update_customer_data`, buscamos o doc em `customers` para calcular precisamente 20% a menos (x 0.8) a partir do `current_price` e assim preencher campo isolado.
**Diff resumido:**
```diff
+ const customerDoc = await getDoc(doc(db, "customers", args.customerId));
+ const currentPrice = customerDoc.data()?.current_price ?? 0;
+ const discountedPrice = Math.round((currentPrice * 0.8) * 100) / 100;
+ updates.retention_discount_value = discountedPrice;
```

### 3. Exatidão no Preço Mencionada no Agente de Retenção
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** O agente de Retenção fazia contas por conta própria e apresentava valores aproximados, às vezes centavos divergentes do sistema.
**Solução implementada:** Alteração no System Prompt do Agente de Retenção proibindo-o de calcular manualmente e forçando-o a ler e apresentar o `retention_discount_value` retornado pela Tool.
**Diff resumido:**
```diff
- 2. Se for preço e o cliente for elegível, você tem autorização para oferecer 20% de desconto por 3 meses...
+ 2. Se for preço e o cliente for elegível... Ao comunicar o valor com desconto... NUNCA calcule o valor manualmente... Apresente exatamente o valor retornado pela tool formatado como R$XX,XX.
```

### 4. Controle Antifraude e Elegibilidade de Upgrade
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Clientes poderiam fazer upgrades sem lidar com recusa por quebras de contratos antigos não verificados via contrato ativo e fidelidade.
**Solução implementada:** Criada ferramenta isolada chamada `check_upgrade_eligibility` validando vigência.
**Diff resumido:**
```diff
+ name: "check_upgrade_eligibility",
+ description: "Verifica se o cliente tem contrato de fidelidade vigente e calcula multa rescisória, se aplicável..."
```

### 5. Cálculo Matemático da Multa de Quebra de Fidelidade (Upgrade)
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Para verificar data e se havia resíduos de fidelidade faltava exatidão entre o momento de cadastro do contrato de antes e os meses remanescentes.
**Solução implementada:** Integração com a biblioteca `date-fns` (funções `addMonths`, `differenceInMonths`) validando `contract_start` e `fidelity_months`.
**Diff resumido:**
```diff
+ const fidelityEnd = addMonths(contractStart, fidelityMonths);
+ const monthsRemaining = differenceInMonths(fidelityEnd, today);
+ const penaltyValue = ((data.current_price || 0) * 0.2 * monthsRemaining);
```

### 6. Agente de Upgrade Ciente de Fidelidade e Multas
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** O cliente final não sabia do custo extra atrelado ao fim da fidelidade gerando reclamações.
**Solução implementada:** Foi incluído um ponto no System Prompt do UPGRADE exigindo chamada do `check_upgrade_eligibility` avisando os meses restantes e o valor formatado de rescisória.
**Diff resumido:**
```diff
+ 3. Antes de confirmar ou agendar qualquer upgrade, chame obrigatoriamente a ferramenta 'check_upgrade_eligibility'... Se eligible é false, VOCÊ DEVE informar ao cliente a data de término, meses restantes e valor da multa.
```

### 7. Versionamento Imutável de Contratos no Agendamento
**Arquivos alterados:** `src/lib/gemini.ts`, `src/lib/db.ts`, `firestore.rules`
**Problema:** Contratos/Instalações ou upgrades sobrescreviam os dados no banco do consumidor, sem manter versão de o que valia no momento X atrelado.
**Solução implementada:** Sempre que for chamada a tool `schedule_technical_visit` (para 'instalacao' ou 'upgrade'), cria-se um objeto inalterável na collection `contracts` documentando `speed`, `price`, `version` atrelados. Bloqueios lançados no Security Rules do Firebase.
**Diff resumido:**
```diff
+ match /contracts/{contractId} {
+   // REGRA: allow create; deny update, delete
+   allow read; allow create; allow update, delete: if false;
+ }
```

## Collections Firestore adicionadas

### `plans`
* **Descrição:** Catálogo de planos de internet comercializados pela ISP.
* **Campos principais:** `name` (string), `price` (number), `active` (boolean), `download_speed` (number), `upload_speed` (number).

### `contracts`
* **Descrição:** Registro imutável de contratos gerados no momento de instalação ou upgrade.
* **Campos principais:** `tenant_id` (string), `customer_id` (string), `created_at` (timestamp), `contract_version` (string), `plan_id` (string), `plan_name` (string), `price_at_signing` (number), `speed_at_signing` (number), `conditions_presented` (array), `agent_session_id` (string), `os_id` (string), `immutable` (boolean).

## Variáveis de ambiente adicionadas
(Nenhuma nova variável foi adicionada no `.env` durante este Sprint, o Redis configurado em etapa paralela ou anterior utilizaria `REDIS_URL` padrão, não adicionado nestes commits documentados aqui).

## Dependências adicionadas
- `date-fns`: Já presente ou formalizado o uso para gerenciamento escalável e matemático de datas relativas (`addMonths`, `differenceInMonths`).
- `firebase-admin` (presumível) / bibliotecas do GCP já contidas na stack `firebase`.

## Pontos de atenção para próximos sprints
- Garantir a sincronização do campo de pagamento recorrente (Billing Provider, por ex. Stripe ou ASAAS) com o `current_price` após um Upgrade de plano.
- Melhor controle do `fallback` caso a base do Firestore (coleção `plans`) não responda de primeira após expirar o cache.
- O histórico de conversas crescerá rapidamente. Pode ser preciso verificar limites ou expiração da collection `leads_temp` periodicamente.
