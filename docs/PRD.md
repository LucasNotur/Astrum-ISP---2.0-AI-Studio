# Product Requirements Document (PRD) - Astrum AI (Plataforma Multi-Tenant para ISPs)

## 1. Visão Geral do Produto
O sistema é uma plataforma de atendimento ao cliente baseada em Inteligência Artificial multiplataforma (foco primário em WhatsApp via Evolution API), desenhada especificamente para Provedores de Internet (ISPs). O principal diferencial é a arquitetura **Multi-Tenant (White-label)**, permitindo que várias empresas (Tenants) utilizem o mesmo software núcleo com total isolamento de dados, configurações, personas e instâncias de mensageria.

A IA opera como uma agente Nível 1 completa, resolvendo questões financeiras (2ª via de boleto, Pix, verificação de pagamento), suporte técnico básico e avançado (diagnóstico de OLT/CTO, agendamento de OS preventivas), e triagem comercial.

## 2. Objetivos do Produto
- **Redução de Custo Operacional:** Reduzir o volume de atendimentos de Nível 1 repassados para a equipe técnica humana em até 70%.
- **Disponibilidade 24/7:** Garantir atendimento instantâneo independente de feriados ou madrugadas, resolvendo problemas de billing de forma automática.
- **Escalabilidade Multi-Tenant:** Arquitetura que suporte um crescimento de 3.000 a 10.000 clientes simultâneos em múltiplos provedores sem degradação do sistema.
- **Cobrança Ativa (CobrAI):** Reduzir a inadimplência com disparos inteligentes para clientes em atraso ou prestes a vencer.

## 3. Arquitetura do Sistema
O sistema opera utilizando uma stack robusta baseada em **Node.js (Express) e React (Vite)**, utilizando **Firebase Firestore** para o controle de banco de dados NoSQL e autenticação, **BullMQ + Redis** para gestão de alto volume de mensagens em fila, e os modelos da família **Gemini (Google)** para processamento de rotinas de IA.

```text
[ Cliente (WhatsApp) ] <--> [ Evolution API ] <--> [ Express Webhook ]
                                                          |
                                                    [ Buffer Redis ]
                                                          |
                                                 [ Filas BullMQ (Por Tenant) ]
                                                          |
                                                  [ Message Worker ]
                                                          |
               +------------------------------------------+------------------------------------------+
               |                                          |                                          |
        [ Firebase Firestore ]                    [ Gemini API (LLM) ]                 [ APIs Externas (Asaas, OLTs) ]
         - Tenants, Customers                     - System Prompts                     - Circuit Breakers
         - Tickets, Traces                        - Intent Routing                     - runDiagnosticsReal
         - Knowledge Base (RAG)                   - Tool Calling                       - billing APIs
         - CobrAI Schedules
```

## 4. Funcionalidades Principais (Core Features)

### 4.1. Triagem e Resolução por LLM (Routing)
A IA categoriza a intenção do cliente, utilizando "System Prompts" customizados por Tenant para lidar com:
- **Suporte Técnico:** Usa ferramentas (`run_diagnostics`) para ler sinal, diagnosticar massivas em CTOs, orientar reinício de roteador e, se necessário, abrir OS (`schedule_technical_visit`).
- **Financeiro:** Lê boletos em aberto via integração, fornece código Pix, checa desbloqueio em confiança.
- **Comercial:** Informa sobre planos e viabilidade, repassando para o humano caso o cliente queira fechar negócio.
- **RAG (Retrieval-Augmented Generation):** Base de conhecimento alimentada por provedor, utilizando busca semântica normalizada (com dicionário de gírias técnicas) para responder a peculiaridades da empresa.

### 4.2 Gestão Multi-Tenant (Isolamento)
- Cada Provedor possui seu `tenantId`. Consultas ao Firestore implementam "Guard Rails" (`assertTenantOwnership`) evitando vazamento inter-tenant.
- Chaves de integração, prompts do sistema, SLAs, e configurações financeiras são exclusivas por Tenant.

### 4.3 Sistema de Filamentos e Background Jobs
- **BullMQ:** Isolamento de processamento criando filas nomeadas por tenant (`messages:{tenantId}`). Evita que o tráfego em pico de uma provedora afogue as demais. Worker Concurrency dinâmico.
- **Agregação de Janela Dactilar:** O sistema entende quando clientes mandam palavras picadas (buffer de ~2.1s no Redis) e compila tudo num prompt único economizando tokens e captando o contexto real.

### 4.4 Módulos Ativos (CobrAI)
- IA Proativa que lê faturas próximas do vencimento ou vencidas, iniciando a conversa no WhatsApp para enviar boleto e negociar pagamento. Limits de disparos por hora e janela de operação configuráveis.

### 4.5 Painel de Controle e Monitoramento
- **Dashboard de Operações:** Visão em tempo real de filas, uso de memória Redis, tickets pendentes de humanos, SLAs violados.
- **Painel de Configurações:** Gestão de Prompts, RAG, integrações (Evolution, ERPs) e limites financeiros da API do LLM.

## 5. Requisitos de Segurança, Resiliência e Compliance

- **LGPD e Dados Sensíveis (Audit Logs):** Todo acesso do LLM a dados sensivel de clientes (como CPFs, endereços, logs de conexão) é cacheado em `audit_logs`.
- **Proteção de Custos Limite de Token:** Controle rígido no Redis e Firestore para não extrapolar cota diária/mensal da OpenAI/Gemini, prevenindo falência por bot.
- **Disaster Recovery & Fallbacks:** Backups automáticos via Pub/Sub. No caso da base relacional cair, o fluxo adota _Degraded Mode_ enviando uma mensagem passiva ao invés de quebrar ("Nosso sistema está com estabilidade e logo retornaremos").
- **Proteção contra Abusos ("OS Bombing"):** Controle estrito para não permitir que clientes ou agentes desonestos agendem mais de uma OS simultaneamente via robô.
- **Circuit Breakers:** Caso o gateway de ERP (ex. Asaas) caia, a aplicação bloqueia conexões repetitivas por períodos de resfriamento.

## 6. Modelos de Entidade (Data Dictionary)

- **Tenants:** Configurações globais por ISP, instâncias de Zap, limites de tokens.
- **Customers:** Dados do comprador (nome, CPF, `cto_id`, log de interação PII).
- **Tickets:** Conversa em progresso ou finalizada, possui log de tags geradas, tempo de SLA.
- **Knowledge_Base:** RAG, embeddings e artigos da empresa.
- **Service_Orders:** Representação de visitas geradas pela IA.
- **Agent_Metrics:** Agregação diária otimizada em Background Functions para evitar consumo alto de read quota no dashboard.

## 7. Roadmap e Estratégias de Escala (Futuro)

1. **Vetorização Real (Embeddings):** Transacionar a busca RAG por "Keywords Normalizadas" no Firebase para Vector Search Real (Pinecone, GCP Vertex Search) assim que a base de conhecimento granular exigir.
2. **Transferência Transparente para Omni-Channels:** Ligar o sistema do chat web e instagram, além do WhatsApp no Evolution.
3. **Múltiplos Níveis Automáticos de OLT:** Expandir `run_diagnostics` e RAG para interagir em roteadores Huawei e ZTE diretamente trocando PPPOE via bot.
4. **Relatórios Preditivos com IA:** Relatório mensal automatizado que lê todo o chat de suporte para propor correções sistêmicas (ex. "A CTO 12 na Rua X sofreu mt queixa quarta, revisar ferragem").
5. **Worker Scaling Automatizado:** Subir/descer pods no GKE / Cloud Run escutando o queue depth do Redis via KEDA.

## 8. Considerações para Onboarding Interno

Este documento deve guiar o entendimento das equipes técnicas (Engenharia e Suporte Interno) e de produto (PMs) em:
- Entender que tudo construído **precisa validar a prop `tenantId`**.
- Interações complexas da LLM são caras. Utilize o Redis (`run_diagnostics` por CTO-cache, limites de requests) antes de despachar calls.
- Funções como o `messageWorker` não estão expostas para chamadas REST cruas; elas dependem estruturamente da fluidez e agendamentos do BullMQ.
