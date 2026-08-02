-- ============================================================
-- 091: Padronizar RLS para get_tenant_id() em todas as tabelas
-- ============================================================
-- Corrige 3 problemas:
--   1. current_setting('app.current_tenant_id') → get_tenant_id()
--   2. current_setting('app.tenant_id') → get_tenant_id()
--   3. tenant_id = auth.uid() (BUG: compara tenant com user_id)
--   4. trial_tenants: RLS habilitado sem policies

-- ── Grupo 1: current_setting('app.current_tenant_id') ──

DROP POLICY IF EXISTS tenant_isolation ON agent_tool_settings;
CREATE POLICY tenant_isolation ON agent_tool_settings USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON ai_decision_log;
CREATE POLICY tenant_isolation ON ai_decision_log FOR SELECT USING (tenant_id = get_tenant_id());
DROP POLICY IF EXISTS tenant_insert ON ai_decision_log;
CREATE POLICY tenant_insert ON ai_decision_log FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON ai_intent_daily;
DROP POLICY IF EXISTS tenant_insert ON ai_intent_daily;
DROP POLICY IF EXISTS tenant_update ON ai_intent_daily;
CREATE POLICY tenant_isolation ON ai_intent_daily FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON ai_intent_daily FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY tenant_update ON ai_intent_daily FOR UPDATE USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON campaign_variants;
DROP POLICY IF EXISTS tenant_insert ON campaign_variants;
DROP POLICY IF EXISTS tenant_update ON campaign_variants;
CREATE POLICY tenant_isolation ON campaign_variants FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON campaign_variants FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY tenant_update ON campaign_variants FOR UPDATE USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON churn_scores;
DROP POLICY IF EXISTS tenant_insert ON churn_scores;
CREATE POLICY tenant_isolation ON churn_scores FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON churn_scores FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON drift_reports;
DROP POLICY IF EXISTS tenant_insert ON drift_reports;
CREATE POLICY tenant_isolation ON drift_reports FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON drift_reports FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON feature_values;
DROP POLICY IF EXISTS tenant_insert ON feature_values;
CREATE POLICY tenant_isolation ON feature_values FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON feature_values FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON legacy_ticket_conversation_map;
CREATE POLICY tenant_isolation ON legacy_ticket_conversation_map USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON network_metrics;
DROP POLICY IF EXISTS tenant_insert ON network_metrics;
CREATE POLICY tenant_isolation ON network_metrics FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON network_metrics FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON replay_items;
CREATE POLICY tenant_isolation ON replay_items USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON replay_runs;
CREATE POLICY tenant_isolation ON replay_runs USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON safety_vetoes;
CREATE POLICY tenant_isolation ON safety_vetoes USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON sandbox_queries;
CREATE POLICY tenant_isolation ON sandbox_queries USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON shadow_results;
CREATE POLICY tenant_isolation ON shadow_results USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON tenant_erp_credentials;
CREATE POLICY tenant_isolation ON tenant_erp_credentials USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON tenant_evolution_instances;
CREATE POLICY tenant_isolation ON tenant_evolution_instances USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON tenant_feature_flags;
CREATE POLICY tenant_isolation ON tenant_feature_flags USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON tool_usage_daily;
CREATE POLICY tenant_isolation ON tool_usage_daily USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON variant_sends;
DROP POLICY IF EXISTS tenant_insert ON variant_sends;
DROP POLICY IF EXISTS tenant_update ON variant_sends;
CREATE POLICY tenant_isolation ON variant_sends FOR SELECT USING (tenant_id = get_tenant_id());
CREATE POLICY tenant_insert ON variant_sends FOR INSERT WITH CHECK (tenant_id = get_tenant_id());
CREATE POLICY tenant_update ON variant_sends FOR UPDATE USING (tenant_id = get_tenant_id());

-- ── Grupo 2: current_setting('app.tenant_id') ──

DROP POLICY IF EXISTS browse_allowlist_tenant ON browse_allowlist;
CREATE POLICY browse_allowlist_tenant ON browse_allowlist USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS edge_shadow_tenant ON edge_shadow_results;
CREATE POLICY edge_shadow_tenant ON edge_shadow_results USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS elo_contenders_tenant ON elo_contenders;
CREATE POLICY elo_contenders_tenant ON elo_contenders USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS elo_matches_tenant ON elo_matches;
CREATE POLICY elo_matches_tenant ON elo_matches USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS labeled_examples_tenant ON labeled_examples;
CREATE POLICY labeled_examples_tenant ON labeled_examples USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS mcp_api_keys_tenant ON mcp_api_keys;
CREATE POLICY mcp_api_keys_tenant ON mcp_api_keys USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS negotiation_policies_tenant ON negotiation_policies;
CREATE POLICY negotiation_policies_tenant ON negotiation_policies USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS network_anomalies_tenant ON network_anomalies;
CREATE POLICY network_anomalies_tenant ON network_anomalies USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS ocr_extractions_tenant ON ocr_extractions;
CREATE POLICY ocr_extractions_tenant ON ocr_extractions USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS outage_notifications_tenant ON outage_notifications;
CREATE POLICY outage_notifications_tenant ON outage_notifications USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS sales_leads_tenant ON sales_leads;
DROP POLICY IF EXISTS tenant_isolation_sales_leads ON sales_leads;
CREATE POLICY tenant_isolation_sales_leads ON sales_leads USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_constitutions_tenant ON tenant_constitutions;
CREATE POLICY tenant_constitutions_tenant ON tenant_constitutions USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_email_inboxes_tenant ON tenant_email_inboxes;
CREATE POLICY tenant_email_inboxes_tenant ON tenant_email_inboxes USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_meta_pages_tenant ON tenant_meta_pages;
CREATE POLICY tenant_meta_pages_tenant ON tenant_meta_pages USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS trust_unlock_policies_tenant ON trust_unlock_policies;
CREATE POLICY trust_unlock_policies_tenant ON trust_unlock_policies USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS trust_unlocks_tenant ON trust_unlocks;
CREATE POLICY trust_unlocks_tenant ON trust_unlocks USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "tenant isolation" ON valor_cases;
CREATE POLICY tenant_isolation ON valor_cases USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS voice_biometry_consents_tenant ON voice_biometry_consents;
CREATE POLICY voice_biometry_consents_tenant ON voice_biometry_consents USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS voice_calls_tenant ON voice_calls;
CREATE POLICY voice_calls_tenant ON voice_calls USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS voice_prints_tenant ON voice_prints;
CREATE POLICY voice_prints_tenant ON voice_prints USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS voice_scorecards_tenant ON voice_scorecards;
CREATE POLICY voice_scorecards_tenant ON voice_scorecards USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS voice_transcripts_tenant ON voice_transcripts;
CREATE POLICY voice_transcripts_tenant ON voice_transcripts USING (tenant_id = get_tenant_id());

-- ── Grupo 3: tenant_id = auth.uid() (BUG) ──

DROP POLICY IF EXISTS tenant_own_jobs ON dead_letter_queue;
CREATE POLICY tenant_own_jobs ON dead_letter_queue USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON idempotency_keys;
CREATE POLICY tenant_isolation ON idempotency_keys USING (tenant_id = get_tenant_id());

-- ── Grupo 4: subquery equivalente a get_tenant_id() ──

DROP POLICY IF EXISTS batch_jobs_tenant ON ai_batch_jobs;
CREATE POLICY batch_jobs_tenant ON ai_batch_jobs USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS churn_predictions_tenant ON churn_predictions;
CREATE POLICY churn_predictions_tenant ON churn_predictions USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS webhook_deliveries_tenant ON webhook_deliveries;
CREATE POLICY webhook_deliveries_tenant ON webhook_deliveries USING (tenant_id = get_tenant_id());

-- ── Grupo 5: trial_tenants sem policies ──

CREATE POLICY trial_tenants_read ON trial_tenants FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
);
CREATE POLICY trial_tenants_insert ON trial_tenants FOR INSERT WITH CHECK (true);
