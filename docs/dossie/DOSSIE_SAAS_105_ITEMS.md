# DOSSIÊ RATIO: ASTRUM (AS-IS) VS SAAS ALVO (TO-BE)

**Data de Resumo:** 2026-05-20
**Status:** Arquivado para Acompanhamento e Checkout

## O QUE A ASTRUM É HOJE
- Um produto enxuto, focado num escopo de automação de provedor de internet. 
- Ferramenta de interface estilo Helpdesk, dependente de muita configuração hardcoded (e.g. `tenant_id: 'default'`). 
- Tem forte capacidade com LLMs lidando com agendamento, cobertura, diagnósticos através da lógica interna do arquivo `gemini.server.ts` e de `dbAdmin.ts`.
- Parece um Saas completo porque tem uma UI polida, mas atua mais como software-sob-encomenda / Prestação de Serviço, devido à ausência das automações primárias de negócios de subscrições e gestão organizacional unificada pluri-tenant.

## O QUE DEFINITIVAMENTE A ASTRUM NÃO É (AINDA) E OS GAPS QUE PRECISA
Abaixo organizados sob 105 macro-requisitos (ou "pontos") para de fato habilitar a plataforma como um Produto **SaaS (Plataforma Multilocatário Autônoma).**

---

### A. Automação de Onboarding B2B & Core Multi-Tenant (1-15)
1. **Self-Service Sign Up:** Ausência de tela de cadastro autônomo. O Provedor não consegue chegar, colocar o cartão e iniciar o trial via checkout.
2. **Onboarding Guiado:** Faltam etapas ("Wizard") autômatas gerando tabelas ou escopos pós-signup para customização.
3. **Isolamento RLS/Database:** Regras de acesso não estão consolidadas rigorosamente; muita coisa vaza sem o `tenant_id` forçado globalmente no repositório.
4. **Isolamento de Credenciais Nativas (Vaults):** Chaves da API OpenAI, Gemini, Whatsapp Webhooks não podem ser guardadas no mesmo bucket.
5. **Seed Automático do Tenant:** Ao criar a conta o provedor não recebe as categorias, os templates, nem os agentes automaticamente; alguém precisa migrar o banco manualmente por eles.
6. **SuperAdmin Central:** Faltam interfaces onde a Empresa "Astrum-Mãe" observa a vida, a saúde e ativa os clientes Saas dela.
7. **Lifecycle Account Management:** Suspender um provedor bloqueando login; desativar se houver "churn" e reciclar tenant.
8. **Sub-domínios Dinâmicos:** Módulo DNS de wildcard (ex: `voxlt-astrum.com` ou `astrum.com.br/provedorxyz`).
9. **Gerenciador Multi-Filial:** Permitir que o Provedor A tenha filial no "Norte" (com whatsapp "A") e filial "Sul" (com whatsapp "B") no mesmo tenant.
10. **Automação Evolution API:** Requisições nativas de instanciamento do whatsapp, em vez de depender que a Astrum crie na interface mãe da Evolution e cole os webhooks.
11. **White Label Nativo:** Falta um CNAME mapping completo e theaming da Login Screen per tenant_id.
12. **Configuração Organizacional Hierarquizada:** Políticas globais do provedor (ex: Horários do bot na empresa inteira e override de feriados por estado).
13. **Plataforma de Billing Nativa:** Faltam gateways de mensalidades (ex: Strip e/ou Iugu).
14. **Billing via Pix Direto pro SaaS:** A Astrum cobrando a fatura dela no bot pra os donos da conta.
15. **Gestão Role e Mapeamento LDAP:** Faltam níveis customizáveis e integração à IAM. 

### B. Gestão Comercial (Modelo de Planos - Onde o dinheiro gira para Astrum) (16-30)
16. Controle rígido de Quotas de Mensagens. Ao atingir limitações, o plano trava webhooks.
17. Controle de Token Limit per Mensagem (Evita bots caros gerarem prejuízos infinitos e esgostarem tier de custo do openAI da astrum global).
18. Gestão por Seats (assentos/agentes) simultâneos no socket e bloqueio.
19. Módulo "Plano Trial de 14 Dias" que derruba a base caso não converta.
20. Módulo de Add-Ons ("Adicionar pack avançado de RAG de até 100 manuais", "Adicionar mais WhatsApps").
21. Prevenção de Fraude em Chargeback.
22. Relatórios de Gasto Individualizado B2B. A Astrum saber qual Provedor custou mais cara para a matriz na camada AWS/OpenAI.
23. Emissão de Notas Fiscais dos repasses de serviço B2B do Astrum para o provedor automaticamente pela prefeitura.
24. Gestões de Acordo "Sob Demanda": Ter planos anuais fechados que anulam a cota.
25. Módulo Afiliados: Provedor A indica Provedor B e ambos tem isenção de 2% nas faturas Astrum.
26. Tela de Consumo de Orçamento de Agentes ("Onde minha cota foi consumida no mês").
27. Bloqueador Global: Interrupção abrupta do sistema por inadimplência cortando conexão com as API e impedindo novos tickets de chat e avisos ao bot.
28. Cartão em arquivo: Adição direta de Gateway para guardar paymentMethod dos responsáveis na Astrum.
29. Bloqueio automático de "Feature Flags" baseadas no tier do plano do tenant. (ex: Plano Básico = não tem Base de conhecimento).
30. Previsibilidade financeira Dashboard para Admin.

### C. Integrações Nativas "ISPs", ERPs e Add-on Ecosystem (31-50)
31. IXC Provider Integradão Direta (API Padrão nativo do SaaS).
32. MK-Auth Integração.
33. SGP (Sistema Gerenciador de Provedor).
34. Voalle.
35. HubSoft.
36. ReceitaBox.
37. TopSapp.
38. Gestão Autônoma de Webhooks ERP: O SaaS gerar URLs de Webhook unicas para avisar a plataforma de tickets faturados.
39. Sincronização em Massa de Cadastros (Batch Job de ETL do ERP pra Astrum CRM).
40. Integração Bidirecional: Novo provedor na Astrum reflete no ERP ou versa.
41. Marketplace "One Click App" pra adicionar sistemas via keys.
42. Roteamento PPOE Automático (Bater diretamente no MK/IXC para restartar uma ONU com botões diretos pro agente).
43. Consulta de Radius Ativo (Tráfico live).
44. Painel Mapas: Monitoria do CTO live na integração NOC.
45. Abertura do Chamado direto pela API no ERP na nuvem.
46. Zapier / n8n / Make apps.
47. Exportador de banco nativo JSON/CSV de contatos pro Marketing ERPs.
48. Disparo via SMTP de notas do SAAS para diretores dos provedores.
49. Importe de dados retroativos (Um provedor chegando do Zenvia ou Digisac e querendo trazer todo historico de chats antigos de SQL pra base Firebase deles).
50. Rotação Dinamica de IPs de servidores nas integrações externas de firewall.

### D. Omnichannel & CRM de Chats (51-65)
51. Motor e Fila "Round Robin Inteligente" do Ticket para Atendentes no painel com pesos (Skill based routing).
52. Enfileiramento em cascata (Acabou a capacidade, cai em fila de espera notificada: "Você é o 5 da sua lista..").
53. Disparo ativo 100% formal da API Whatsapp Oficial (HSM, Templates pre-aprovadas da ZUC / META).
54. Suporte a Facebook Messenger na UI.
55. Suporte a IG Direct na UI.
56. Suporte Web Widget Customizável pro site do Provedor ("Talk to Us").
57. Integração E-mail to Ticket.
58. Multiplas "Conexões" na mesma interface para o provedor (ZAP1 do comercial, ZAP2 do Juridico, ZAP 3 Oficial do ISP).
59. Agrupamento de Conversas Cross-Line: Uma pessoa que chama pelo Zap A e zap B é linkada a mesma Entity/CPF unificada para ver o histórico de ambos.
60. Editor Visual de Kanban de Pipelines (Vendas / Viabilidade / Suporte) de forma Custom.
61. Chat Interno NATIVO P2P (Equipamento técnico conversa com equipe atendimento sem o cliente).
62. Módulo de tags Hierárquicas e Macro (Motivos de Contato em pastas, Ex: Cancelamento -> Motivo Financeiro -> Perda de Salario).
63. Módulo "Observadores/Espionagem" Onde os diretores dos ISP conseguem ler o chat em andamento silenciosamente.
64. Pesquisa Full-Text Robusta da linha do chat de vários de meses.
65. Filtros Atuais: Ex: Ver APENAS tickets encerrados por X na data Y e que tem a tag Z.

### E. AI Ops, IA Copilot e Configurações Cognitivas (66-80)
66. Model Training Dashboard "Feedback Loop". Aquele joinha/polegar nos agentes de chat de avaliação da IA ser retro-alimentada nas Bases de Conhecimento RAG.
67. Tela de "Simulação" (Testador interativo "Chatie" no admin, antes de plugar as IAs live pro cliente da empresa).
68. Módulo RAG Multimodal: Além do texto do Manual, interpretar fotos dos PDFs de Roteador dos ISP na base.
69. Classificador Churn Preditivo AI. Observar chat e mandar alerta slack "Risco de churn iminente: 94%" p/ supervisor local.
70. AI Suggestion ao Vivo "Copilot" escrevendo respostas draft ou completando digitação pro humano.
71. Transcript de Áudio no chat via Deepgram/Whisper para humano agilizar leitura, nativo do SaaS.
72. AI Summaries do Agent Hand-off: Um card pequeno ressaltando pq a IA achou que devia passar pro Humano ("Passei pq não consegui acessar a fatura" + "Sentimento agressivo do cliente").
73. Mapeador Gráfico de Workflow de Agentes de Prompt (Um Node-Based Drag-n-drop para a rota dos Bots e não um gemini.server hardcoded por baixo).
74. Fallback Dinâmico Automativo de Provider. SLA openAi cair The Astrum pula dinamicamente a route para Claude 3 Sonnet live garantindo a ISP n ficar fora usando keys de resgate.
75. Regresso automático IA-Agent. (Quando agente joga dnv para a IA se auto ressolver, um botão "Turn Back on Copilot").
76. Definição do Personality Type (Formal, Amigavel, Tecnico) ajustavel e customizado pelo dono provedor no painel por drag sliders.
77. Agendamento Multi-Parametro e cruzamento de técnicos. ("Match-making técnico na região geohash para propor agendamento nas conversas").
78. Análise Fotográfica IA (Mandar luz laranja ONU para IA ela entender se está "LOS" ou Power e ler LEDs).
79. Automação IA de "Auditoria Noturna" de todos os chamados humanos apontando "Humanos esqueceram de cadastrar nome, etc".
80. Controle Rígido do Hallucination Parameters na IA Custom baseada do tenant.

### F. Analytics, Broadcast e Retenção (81-90)
81. Disparador Massivo Broadcast CRM WhatsApp. Fazer campanhas proativo "Manutença programada".
82. Régua de Cobrança Integrada - Automatizador de disparos "Boleto vence hj / Boleto em atraso".
83. NPS e CSAT Reporting Avançado nativo do SAAS per-Attendant e Per-IA.
84. SLAs Customizáveis: "Se cliente PJ esperar 5mins, ticket grita vermelho e dispara SMS pro Admin".
85. Painel de Analytics Global customizável KPI, MAU, TMA.
86. Conversões Dashboard funil. "Tantos orçaram R$ 100 reais, 5 fechou na viabilidade".
87. Follow-Up Lead Management Automático via IA.
88. Campanha Broadcast Retencional: Filtrar ISP na tag cancelamento nosultimos 12m e mandar promo.
89. API de Relatórios Analíticos DataLake para que provedor extraía em BI deles as perfomances de SaaS.
90. Exportação programável "Toda sexta manda CSV de faturas para o chefe@".

### G. Operações Externas Field Service / Técnico NOC (91-95)
91. Mapeamento Geo-Location App Field Técnicos nativo da Astrum SaaS.
92. Função Uber/Rastreio - Mandar Link Dinamico da Rota do Carro até o Endereço do Cliente com a placa.
93. Bater Foto de Roteador do app tecnico de campo e sync em tempo live nas ordens OS.
94. Mapeamento de Macro Crise e Massivo: Bot "derrubar" tickets em massa pra OSs já pre estabelecidas e fechar 90 calls como "Problema Região Leste".
95. Gerenciamento de Kits / Almoxarifado Integrado Básico Atrelado a OS de instalação (Ex: "Drop" diminuiu 10m).

### H. Governança, Monitoramento SLA, Segurança e LGPD (96-105)
96. Compliance Termo Adesão de LGPD da IA nas configurações.
97. Máscara RegEX Rigida de Criptografia At Rest para chats gravados contendo CPF, Contas bancárias nativo da base.
98. Retenção Politica Data-Flush Custom (Provedor pode setar "Exclui chamados após 5 anos automaticamente").
99. Right to be Forgotten UI Workflow (Cliente pede, apaga até da openAI memoria e DB).
100. Auditoria de Log Level Avançada Pessoal ("User 'João' mudou a senha de 'Maria' às 22:30").
101. 2FA (AuthToken) ou Biometria Nativo para Operadores de Interface (Requisito legal B2B em Enterprise).
102. IP Whitelisting de painel Admin para operadores Logarem o Chat apenas das Operações das centrais ISP.
103. Múltiplos Tokens Sessão App Nativo Android/IOS Notification Push Background.
104. Single Sing ON SAML OICD / Google Auth na Empresa p/ Atendentes não compartilharem logins.
105. Layer Avançada Shield/Firewall WAF AntiDDoS para webhook evolution (Atack Surface) bloqueando loops se celular mandar flood a bot IA.

---
**CONCLUSÃO:**
Esses são os 105 macro-requisitos que transformam um "Projeto Isolado Avançado" naquilo que é considerado de fato uma **"Startup B2B SaaS de Nicho Pronta para Series A / Escala Escalabilidade Multi-Org."** Em breve iteraremos nesses pontos.
