-- IA-35: Node latency daily aggregates (global infra, no RLS).

CREATE TABLE IF NOT EXISTS node_latency_daily (
  node text NOT NULL,
  day date NOT NULL,
  p50 numeric,
  p95 numeric,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (node, day)
);
