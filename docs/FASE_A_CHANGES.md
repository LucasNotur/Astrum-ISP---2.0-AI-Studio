# Fase A — Melhorias para 1.000–3.000 clientes
**Data de execução:** 11/05/2026
**Objetivo:** Resolver problemas que surgem com volume real de clientes — áudio, mudança de intenção, CNPJ, horários de agendamento e rastreabilidade de vendas.

## Alterações realizadas

### 1. Suporte a Mensagens de Áudio (Whisper)
**Arquivos alterados:** `server.ts`, `src/workers/messageWorker.ts`, `src/lib/transcription.ts`
**Problema:** Clientes enviam arquivos de áudio que os Agentes IA não compreendem de forma nativa.
**Solução implementada:** Integração com a API da OpenAI (Whisper-1) para transcrever áudios automaticamente antes de passá-los para o agente. Os buffers/arquivos são convertidos e a transcrição é colocada como prefixo `[Áudio transcrito]:`.
**Diff resumido:**
```diff
+ const transcription = await transcribeAudio(audioUrl);
+ textMessage = `[Áudio transcrito]: ${transcription}`;
```

### 2. Tratamento de Mudança de Intenção e Manutenção de Contexto
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Envio de dados isolados (como um CPF ou CEP) fazia o Orquestrador repassar o atendimento erroneamente para o SAC GERAL ao invés de manter na triagem/cadastro.
**Solução implementada:** Atualização no prompt do Orquestrador definindo regra vital de contexto, de modo que responder a perguntas anteriores não altere a categoria da sessão.
**Diff resumido:**
```diff
+ REGRA VITAL DE CONTEXTO E ROTEAMENTO:
+ Se o cliente estiver respondendo a uma pergunta anterior feita pelo agente, VOCÊ DEVE MANTER A MESMA CATEGORIA do agente atual.
```

### 3. Suporte a CNPJ (Clientes PJ)
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** A ferramenta de atualização de dados identificou lacuna ao lidar com clientes do tipo pessoa jurídica.
**Solução implementada:** Inclusão do processamento e de novos campos na chamada de atualização de cadastro (`update_customer_data`) como Razão Social, detecção robusta separando Pessoa Física (11 dígitos) e Pessoa Jurídica (14 dígitos).
**Diff resumido:**
```diff
+ isPJ = cleanDoc.length === 14;
+ isCPF = cleanDoc.length === 11;
```

### 4. Validação de Horários de Agendamento
**Arquivos alterados:** `src/lib/gemini.ts`, `src/lib/scheduleValidator.ts` (novo)
**Problema:** Visitas técnicas sendo agendadas em finais de semana sem operação, feriados nacionais, ou fora de horários de funcionamento.
**Solução implementada:** Criação do validador `scheduleValidator.ts` conferindo feriados nacionais, horários permitidos e rejeitando automaticamente marcações irregulares via validação da própria tool `schedule_technical_visit`.
**Diff resumido:**
```diff
+ const validation = validateScheduleSlot(args.date, args.period as any, municipalHolidays);
+ if (!validation.valid) { validationError = ... }
```

### 5. Rastreabilidade de Vendas
**Arquivos alterados:** `src/lib/gemini.ts`, `server.ts`
**Problema:** Histórico do que foi ofertado versus contratado ficava opaco.
**Solução implementada:** Extração dos últimos diálogos para compilação como "sales promises", somado aos parâmetros específicos do acordo (dias de prazo e velocidade). Isso é inserido via a modificação de `schedule_technical_visit` num endpoint focado.
**Diff resumido:**
```diff
+ const agentMessages = history.filter((h) => h.role === "model").slice(-10).map(...);
+ sales_promises: agentMessages,
```

### 6. Retomar Fluxo Pausado
**Arquivos alterados:** `src/lib/gemini.ts`
**Problema:** Conversas retrucada tempos depois perdiam a posição na árvore de fluxos da intenção ou refaziam questões antigas.
**Solução implementada:** Utilização da propriedade para não iniciar o atendimento sem conferir sua continuação.
**Diff resumido:**
```diff
+ session_state.paused_flow
```

## Novos arquivos criados
- `src/lib/scheduleValidator.ts`
- `src/lib/transcription.ts`

## Variáveis de ambiente adicionadas
- `OPENAI_API_KEY` (utilizada internamente pelo Whisper SDK, configurada corretamente no seu contêiner).

## Dependências adicionadas
- `openai` (O SDK utilizado importando os buffers em formato legível via `.toFile()` da biblioteca. Já existia para os LLMs da openai).

## Collections Firestore alteradas
- `contracts` — novos campos `sales_promises`, `sales_summary`, `installation_deadline_days`, `speed_promised_mbps`
- `customers` — novos campos `document_type`, `cnpj`, `razao_social`

## Pontos de atenção
- Custo do Whisper: ~$0.006 por minuto de áudio. Monitorar se clientes abusarem de áudios longos.
- Feriados municipais precisam ser configurados manualmente por ISP no campo municipal_holidays do tenant.
- Validação de CNPJ implementa apenas dígito verificador — não valida se CNPJ existe na Receita Federal (API paga).
- `session_state.paused_flow` permite retomar fluxo pausado, mas o agente precisa ser instruído a verificar esse campo ao iniciar atendimento.
