# Master Implementation Log - Astrum

Este documento serve como guia de sincronização entre o ambiente de desenvolvimento AI Studio e o código local.

## 1. Estrutura do Banco de Dados (Firestore)

### Coleções Principais
- `customers`: Dados dos clientes (nome, plano, status, mrr, endereço, coordenadas).
- `tickets`: Chamados de atendimento.
  - Subcoleção `messages`: Histórico de conversas de cada ticket.
- `billing_invoices`: Faturas e status financeiro.
- `network_ctos`: Geolocalização e ocupação das caixas de terminação óptica.
- `inventory`: Controle de estoque de equipamentos.
- `audit_logs`: Registros de performance e sentimento da IA.
- `knowledge_base`: Artigos para o sistema RAG.
- `settings`: Configurações globais (prompts e chaves de API).

## 2. Lógica de IA (Astrum Engine)

### Orquestração
O sistema utiliza um modelo "Orquestrador" que classifica a intenção do usuário em categorias:
- `CADASTRO`, `FATURA`, `SUPORTE_TECNICO`, `RETENCAO`, `UPGRADE`, `SAC_GERAL`, `ESCALAMENTO_HUMANO`.

### Ferramentas (Function Calling)
A IA tem acesso a funções reais via `gemini.ts`:
- `check_coverage`: Consulta `network_ctos`.
- `get_billing_status`: Consulta `billing_invoices`.
- `run_diagnostics`: Simula teste de sinal e latência.
- `search_knowledge_base`: Consulta `knowledge_base`.

## 3. Melhorias Recentes (MVP de Atendimento)

### Dashboard de Suporte
- Gráficos de Sentimento (Positivo/Neutro/Negativo) com tratamento de estados vazios.
- Widget de Tickets Críticos.
- Métricas de SLA e Resolução IA.

### Sistema e Auditoria
- **Unificação de Logs**: Sistema de auditoria padronizado para todas as ações do sistema.
- **Ferramentas de Desenvolvedor**: Seção em Configurações para popular o sistema com dados de teste (Clientes, Tickets, Logs, KB).
- **Correção de Permissões**: Regras do Firestore otimizadas para o novo esquema de auditoria.

### Detalhes do Cliente
- **Resumo IA**: Botão que gera um resumo executivo do histórico do cliente.
- **Diagnóstico**: Aba técnica para testes de conexão em tempo real.

### Mapa de Cobertura
- **Zoom e Pan Interativo**: Implementação de sistema de zoom (scroll/botões) e arrasto (drag) para navegação fluida no mapa SVG.
- **Tooltips Informativos**: Visualização detalhada de CTOs (Nome, Ocupação, Status) ao passar o mouse.
- **Heatmap**: Camada visual de densidade de ocupação da rede.
- **Otimização de Renderização**: Escalonamento dinâmico de marcadores para manter a visibilidade em diferentes níveis de zoom.

## 4. Próximos Passos Concluídos (Fase 3 Finalizada)
- [x] Integração real com API de WhatsApp/Telegram (Sistema Evolution API configurado em `server.ts`).
- [x] Sistema de agendamento técnico automático (Tool `schedule_technical_visit` incorporada na IA via `gemini.ts`).
- [x] Dashboard de churn preditivo baseado no sentimento (Adicionado à tela de Painel em `DashboardPage.tsx`).

## 5. Passos Futuros
- App/PWA para Técnicos de Rua (atualização de status via foto e GPS).
- Expansão de ferramentas RAG e Machine Learning nativo.
