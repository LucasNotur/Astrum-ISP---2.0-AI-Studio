import fs from "fs";

let content = fs.readFileSync("src/lib/gemini.ts", "utf8");

if (!content.includes('import { logger }')) {
  content = content.replace(
    'import OpenAI from "openai";',
    'import OpenAI from "openai";\nimport { logger } from "./logger";'
  );
}

// Helper to replace matching patterns
function replaceRegex(regex, replacement) {
  content = content.replace(regex, replacement);
}

replaceRegex(/console\.error\(\s*"Erro ao countRecentNegativeSentiments:",\s*e\s*\);/g, 'logger.error("error_recent_negative_sentiment", { error: e?.message || String(e) });');
replaceRegex(/console\.warn\(\`\[LLM\] Rate limit hit\..*?\`\);/g, 'logger.warn("llm_rate_limit_hit", { data: { attempt: attempt + 1, delay } });');
replaceRegex(/console\.error\(\s*"Erro ao buscar prompts do tenant:",\s*error\s*\);/g, 'logger.error("error_fetch_prompts", { error: error?.message || String(error) });');
replaceRegex(/console\.error\(\s*"Erro ao injetar planos no prompt",\s*err\s*\);/g, 'logger.error("error_inject_plans", { error: err?.message || String(err) });');
replaceRegex(/console\.error\(\s*"Smart Replies Error:",\s*error\s*\);/g, 'logger.error("error_smart_replies", { error: error?.message || String(error) });');
replaceRegex(/console\.error\(\s*"AI Summarize Error:",\s*error\s*\);/g, 'logger.error("error_ai_summarize", { error: error?.message || String(error) });');
replaceRegex(/console\.error\(\s*"AI KB Generation Error:",\s*error\s*\);/g, 'logger.error("error_kb_generation", { error: error?.message || String(error) });');
replaceRegex(/\}\)\.catch\(console\.error\);/g, '}).catch((e: any) => logger.error("unhandled_promise_rejection", { error: e?.message || String(e) }));');
replaceRegex(/console\.log\(\`\[Notification\] \$\{type\}: \$\{message\}\`\);/g, 'logger.info("notification", { event: type, data: { message } });');
replaceRegex(/console\.error\(\s*"Erro ao buscar preferências",\s*e\s*\);/g, 'logger.error("error_fetch_preferences", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro ao buscar cliente:",\s*err\s*\);/g, 'logger.error("error_fetch_customer", { error: err?.message || String(err) });');
replaceRegex(/console\.error\(\s*"Erro ao buscar preferências do customerData:",\s*e\s*\);/g, 'logger.error("error_fetch_customer_preferences", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro ao computar frequência:",\s*e\s*\);/g, 'logger.error("error_compute_frequency", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro ao gerar resumo de histórico",\s*err\s*\);/g, 'logger.error("error_generate_history_summary", { error: err?.message || String(err) });');
replaceRegex(/console\.error\(\s*"Erro ao verificar churn risk",\s*e\s*\);/g, 'logger.error("error_churn_risk", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro ao verificar retenção proativa",\s*e\s*\);/g, 'logger.error("error_proactive_retention", { error: e?.message || String(e) });');
replaceRegex(/console\.log\(\s*'\[CACHE\] SAC hit:',\s*sacCacheKey\s*\);/g, 'logger.info("cache_hit_sac", { data: { key: sacCacheKey } });');
replaceRegex(/console\.error\(\s*"Cache Read Error",\s*e\s*\);/g, 'logger.error("error_cache_read", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Ownership validation error:",\s*e\s*\);/g, 'logger.error("error_ownership_validation", { error: e?.message || String(e) });');
replaceRegex(/console\.log\('diagnostic_cache_hit',\s*\{\s*ctoId:\s*targetCtoId,\s*age_seconds:\s*age\s*\}\);/g, 'logger.info("diagnostic_cache_hit", { data: { ctoId: targetCtoId, age_seconds: age } });');
replaceRegex(/console\.error\(\s*"Erro verificando customer no gemini",\s*e\s*\);/g, 'logger.error("error_verify_customer", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Error checking OS bombing:",\s*bombingErr\s*\);/g, 'logger.error("error_check_os_bombing", { error: bombingErr?.message || String(bombingErr) });');
replaceRegex(/console\.error\(\s*"Erro ou mismatch no cto_incidents",\s*e\s*\);/g, 'logger.error("error_cto_incidents", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro na validação de agenda",\s*err\s*\);/g, 'logger.error("error_schedule_validation", { error: err?.message || String(err) });');
replaceRegex(/console\.error\(\s*"Erro em save_customer_preference:",\s*e\s*\);/g, 'logger.error("error_save_preference", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro em get_customer_history:",\s*e\s*\);/g, 'logger.error("error_get_customer_history", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Erro em collect_portability_data:",\s*e\s*\);/g, 'logger.error("error_collect_portability", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"AI Error:",\s*error\s*\);/g, 'logger.error("error_ai", { error: error?.message || String(error) });');
replaceRegex(/console\.error\(\s*"Cache Write Error",\s*e\s*\);/g, 'logger.error("error_cache_write", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Failed to write to logs collection:",\s*logErr\s*\);/g, 'logger.error("error_write_logs", { error: logErr?.message || String(logErr) });');
replaceRegex(/console\.error\(\s*"Erro ao gerar artigo KB Automático",\s*e\s*\);/g, 'logger.error("error_generate_automatic_kb", { error: e?.message || String(e) });');
replaceRegex(/console\.error\(\s*"Mismatch tenant no ticket",\s*e\s*\);/g, 'logger.error("error_tenant_mismatch", { error: e?.message || String(e) });');
replaceRegex(/\}\)\.catch\(\(e\) => console\.error\(\s*"Falha ao chamar API SLA:",\s*e\s*\)\);/g, '}).catch((e: any) => logger.error("error_call_sla_api", { error: e?.message || String(e) }));');
replaceRegex(/console\.error\(\s*"Erro ao agendar SLA de Escalation:",\s*err\s*\);/g, 'logger.error("error_schedule_escalation_sla", { error: err?.message || String(err) });');
replaceRegex(/console\.error\([^)]*"Erro ao atualizar lastMessageAt e session_state no gemini\.ts:"[^)]*\);/gs, 'logger.error("error_update_ticket", { error: "Failed to update ticket state" });');
replaceRegex(/console\.error\(\s*"Erro ao rastrear tokens no Redis:",\s*e\.message\s*\);/g, 'logger.error("error_track_tokens_redis", { error: e.message });');

fs.writeFileSync("src/lib/gemini.ts", content);
