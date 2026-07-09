-- 048_churn_contributions.sql
-- IA-38 — Explicabilidade do churn (SHAP honesto linear).
-- Modelo real é linear (apps/api/src/domain/ml/churn-score.ts), então a
-- contribuição exata de cada feature é `weight × valor_normalizado`.
-- Armazenamos o vetor para a UI renderizar o waterfall sem precisar
-- recomputar — e para servir de insumo se/quando o modelo virar
-- não-linear (ADR da IA-24).

ALTER TABLE churn_scores
  ADD COLUMN IF NOT EXISTS contributions JSONB;

COMMENT ON COLUMN churn_scores.contributions IS
  'IA-38: vetor de contribuição por feature (feature, weight, value, contribution). '
  'Soma(contributions.contribution) ≈ score (±0.01 pelo arredondamento a 2 casas).';
