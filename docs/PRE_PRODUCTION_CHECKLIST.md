# Astrum Telecom — Checklist de Pré-Produção
> Itens obrigatórios antes de colocar qualquer ISP em produção real.
> Este documento foi gerado ao final do desenvolvimento do MVP.

---

## 🔴 Infraestrutura paga — requer contratação

### Google Cloud Storage — Backup diário
- **O que é:** Bucket de armazenamento onde o sistema exporta backup 
  do Firestore diariamente às 2h
- **Por que precisa:** Proteção contra perda de dados de clientes, 
  contratos e histórico de atendimentos
- **Custo estimado:** ~$0.02/GB/mês (para 10GB de dados: ~$2/mês)
- **Como ativar:**
  1. Criar bucket em console.cloud.google.com/storage
  2. Nome sugerido: astrum-backups-prod
  3. Região: southamerica-east1 (São Paulo)
  4. Dar role Storage Admin ao service account do Firebase
  5. Setar no .env: BACKUP_BUCKET_NAME e GCLOUD_PROJECT
- **Código:** Já implementado em functions/src/index.ts (função dailyBackup)
- **Status:** ⏳ Aguardando contratação

### Redis gerenciado — Para produção em VPS
- **O que é:** Banco de dados em memória para filas, cache e sessões
- **Por que precisa:** O Redis local funciona para MVP mas não tem 
  persistência garantida em reinicializações de servidor
- **Opções baratas:**
  - Redis Cloud free tier: 30MB gratuito (suficiente para até ~500 clientes)
  - Upstash: paga por request, começa gratuito
  - Redis na própria VPS Contabo: sem custo adicional
- **Como ativar:** Setar REDIS_URL no .env com a URL do provedor escolhido
- **Status:** ⏳ Avaliar opção gratuita antes do go-live

---

## 🟡 Configurações manuais — sem custo, requerem tempo

### Meta Business Manager — Templates HSM
- **O que é:** Aprovação obrigatória da Meta para enviar mensagens 
  proativas (CobrAI, confirmações D-1, pós-instalação)
- **Por que precisa:** Sem aprovação, CobrAI não funciona e número 
  pode ser banido por spam
- **Como fazer:** Acessar business.facebook.com → WhatsApp → 
  Message Templates → usar conteúdo de /docs/HSM_TEMPLATES.md
- **Prazo:** 3-7 dias úteis após submissão
- **Templates a submeter:** cobrai_aviso_vencimento, cobrai_dia_vencimento,
  d1_visit_confirmation, pos_instalacao_ok, noc_incident_proactive, csat_rating
- **Status:** ⏳ Submeter antes do go-live

### Firebase — TTL Index para logs de auditoria
- **O que é:** Configuração que faz o Firestore deletar automaticamente 
  documentos de auditoria após 5 anos
- **Por que precisa:** Sem isso, a collection data_access_logs cresce 
  indefinidamente gerando custo
- **Como fazer:** Firebase Console → Firestore → Indexes → 
  Single field → data_access_logs → campo expireAt → Enable TTL
- **Status:** ⏳ Fazer antes do go-live

### Evolution API — HMAC Secret
- **O que é:** Chave de segurança que valida que os webhooks são 
  realmente da Evolution API e não de atacantes
- **Como fazer:** Evolution API painel → sua instância → Webhooks → 
  Secret Key → colocar mesma string que está no .env como 
  EVOLUTION_WEBHOOK_SECRET
- **Status:** ⏳ Configurar antes do go-live

### Feriados municipais por ISP
- **O que é:** Lista de feriados locais da cidade da ISP para bloquear 
  agendamentos incorretos
- **Como fazer:** No Firestore → tenants/{tenantId} → 
  adicionar campo municipal_holidays: ['25/06', '08/09'] (exemplo)
- **Status:** ⏳ Configurar por ISP antes do go-live

### Migração de clientes existentes com cto_id
- **O que é:** Campo que vincula cada cliente à sua caixa óptica (CTO) 
  para detecção de incidentes em massa
- **Como fazer:** Pedir planilha cpf → cto_id para o ISP e importar
  via ETL (scripts/etl) — o script antigo migrate_cto_ids.ts era Firestore
  e foi removido no checkup 2026-07-12 (pós-FZ)
- **Status:** ⏳ Executar com dados reais do ISP

---

## 🟢 Testes obrigatórios antes do go-live

### Penetration test básico
- Testar com dois tenants de teste se dados de um vazam para o outro
- Testar prompt injection com frases conhecidas
- Testar varredura de CPFs (deve bloquear após 3 tentativas)

### Load test
- Simular 50 mensagens simultâneas com Artillery ou k6
- Verificar se Redis aguenta a carga
- Verificar se BullMQ processa sem perda

### Teste de Deploy Zero-Downtime
- Testar execução do script `scripts/deploy.sh`
- Garantir que o endpoint `/health` retorne status `healthy`

### Monitoramento e Logs (Cloud Run / Servidor)
- Os logs JSON gerados pelo Winston (`logger.ts`) são automaticamente parseados em ferramentas como Google Cloud Logging ou Datadog.
- **Para pesquisar logs por tenant:** filtrar por `jsonPayload.tenant_id="xxx"`.
- **Para investigar o log de uma mensagem específica:** filtrar por `jsonPayload.trace_id="xxx"`.
- CADASTRO: do "oi" até a OS criada
- SUPORTE: do relato até diagnóstico e OS
- FATURA: consulta com CPF válido
- RETENÇÃO: oferta de desconto e registro
- UPGRADE: verificação de fidelidade

### Teste do CobrAI (quando HSM aprovado)
- Enviar para número próprio em cada etapa da régua
- Confirmar que mensagem chega com template correto
- Testar botão de resposta rápida

---

## 🔵 Itens de escala futura — não bloqueantes para MVP

### Fase B — itens pendentes
- Substituir busca keyword do RAG por embeddings vetoriais reais
- Configurar worker_concurrency por tenant no painel
- Ativar backup GCP quando tiver orçamento

### Fase C — quando aparecer o problema
- Blue/green deployment (zero downtime)
- Prioridade de atendimento por plano
- Integração com sistema de despacho de técnicos
- Portabilidade de número
- Tracing distribuído completo

---

## 📋 Variáveis de ambiente — referência completa de produção

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| EVOLUTION_WEBHOOK_SECRET | ✅ Sim | HMAC do webhook |
| CPF_ENCRYPTION_KEY | ✅ Sim | Chave AES-256 para CPF |
| REDIS_URL | ✅ Sim | URL do Redis |
| OPENAI_API_KEY | ✅ Sim | API OpenAI/Gemini |
| COBRAI_HOURLY_LIMIT | ✅ Sim | Limite de disparos/hora |
| WORKER_CONCURRENCY | ✅ Sim | Threads do worker |
| BACKUP_BUCKET_NAME | ⏳ Produção | Nome do bucket GCP |
| GCLOUD_PROJECT | ⏳ Produção | ID do projeto GCP |
| EVOLUTION_WEBHOOK_SECRET | ✅ Sim | Secret do webhook |
| NOC_WEBHOOK_SECRET | ⏳ Produção | Secret do NOC |
| INCIDENT_THRESHOLD | ✅ Sim | Mínimo de tickets para incidente |

---

**Última atualização:** 2026-05-12
**Versão do sistema:** 2.1.0-production-ready
