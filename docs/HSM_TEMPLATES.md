# Templates HSM para Submissão - Meta Business Platform

Este documento contém os templates de HSM (Highly Structured Message) que precisam ser cadastrados e aprovados manualmente no painel da Meta Business (WhatsApp Manager) para disparo ativo de mensagens (como avisos, lembretes e NPS). 

## 1. cobrai_aviso_vencimento
- **Nome exato do template:** `cobrai_aviso_vencimento`
- **Categoria:** UTILITY
- **Idioma:** pt_BR
- **Corpo da Mensagem:**
  > Olá, {{1}}! Sua fatura de {{2}} no valor de R$ {{3}} vence em {{4}} dias. Evite a interrupção do serviço pagando em dia. Dúvidas? Responda esta mensagem.
- **Variáveis:**
  - `{{1}}` = Nome do cliente (customer_name)
  - `{{2}}` = Mês de referência ou descrição (reference_month)
  - `{{3}}` = Valor da fatura (invoice_amount)
  - `{{4}}` = Dias restantes para o vencimento (days_to_due)
- **Botões:** N/A
- **Observação de aprovação:** Template transacional de aviso prévio de vencimento.

---

## 2. cobrai_dia_vencimento
- **Nome exato do template:** `cobrai_dia_vencimento`
- **Categoria:** UTILITY
- **Idioma:** pt_BR
- **Corpo da Mensagem:**
  > Olá, {{1}}! Hoje é o dia de vencimento da sua fatura {{2}} no valor de R$ {{3}}. Já efetuou o pagamento? Se sim, pode ignorar esta mensagem.
- **Variáveis:**
  - `{{1}}` = Nome do cliente (customer_name)
  - `{{2}}` = Descrição ou código da fatura (invoice_description)
  - `{{3}}` = Valor da fatura (invoice_amount)
- **Botões:** N/A
- **Observação de aprovação:** Template transacional de alerta de vencimento no dia.

---

## 3. d1_visit_confirmation
- **Nome exato do template:** `d1_visit_confirmation`
- **Categoria:** UTILITY
- **Idioma:** pt_BR
- **Corpo da Mensagem:**
  > Olá, {{1}}! Amanhã {{2}} entre {{3}} nossa equipe técnica visita seu endereço. Protocolo: {{4}}.
- **Variáveis:**
  - `{{1}}` = Nome do cliente (customer_name)
  - `{{2}}` = Data da visita (visit_date)
  - `{{3}}` = Período ou horário da visita (visit_time)
  - `{{4}}` = Número do protocolo/OS (protocol_number)
- **Botões (Quick Reply):** 
  - `✅ Confirmar presença`
  - `🔄 Preciso reagendar`
- **Observação de aprovação:** Template de agendamento transacional, aguardando confirmação do cliente para visita técnica.

---

## 4. pos_instalacao_ok
- **Nome exato do template:** `pos_instalacao_ok`
- **Categoria:** UTILITY
- **Idioma:** pt_BR
- **Corpo da Mensagem:**
  > Olá, {{1}}! Sua internet {{2}} foi instalada. Está tudo funcionando? Faça um teste em fast.com e nos conta! 🚀
- **Variáveis:**
  - `{{1}}` = Nome do cliente (customer_name)
  - `{{2}}` = Informação sobre o plano ou serviço (plan_name)
- **Botões (Quick Reply):** 
  - `👍 Está ótimo!`
  - `⚠️ Tenho um problema`
- **Observação de aprovação:** Acompanhamento pós-venda/instalação para garantia de qualidade técnica.

---

## 5. noc_incident_proactive
- **Nome exato do template:** `noc_incident_proactive`
- **Categoria:** UTILITY
- **Idioma:** pt_BR
- **Corpo da Mensagem:**
  > Olá, {{1}}! Identificamos uma instabilidade técnica na sua região. Nossa equipe já está atuando. Protocolo: {{2}}. Você receberá uma atualização assim que normalizar.
- **Variáveis:**
  - `{{1}}` = Nome do cliente (customer_name)
  - `{{2}}` = Número do protocolo de incidente (incident_protocol)
- **Botões:** N/A
- **Observação de aprovação:** Notificação proativa de falhas técnicas ou rompimentos afim de evitar superlotação de chamadas no suporte.

---

## 6. csat_rating
- **Nome exato do template:** `csat_rating`
- **Categoria:** UTILITY
- **Idioma:** pt_BR
- **Corpo da Mensagem:**
  > Olá, {{1}}! Como foi seu atendimento hoje? Sua opinião nos ajuda a melhorar. 😊
- **Variáveis:**
  - `{{1}}` = Nome do cliente (customer_name)
- **Botões (Quick Reply):** 
  - `⭐ 1 - Ruim`
  - `⭐⭐⭐ 3 - Regular`
  - `⭐⭐⭐⭐⭐ 5 - Ótimo`
- **Observação de aprovação:** Pesquisa de satisfação transacional pós-atendimento (CSAT / NPS).
