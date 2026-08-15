import { supabaseAdmin } from "./supabaseAdmin.ts";
import { logger } from "./logger.ts";

/**
 * LGPD-01 (auditoria 2026-08-10): retenção dos ZIPs de exportação de dados.
 *
 * `processDataExport` sobe um ZIP com PII (clientes, tickets, mensagens) no bucket
 * `uploads` e entrega por signed URL de 72h — mas o OBJETO nunca era removido, então
 * PII se acumulava indefinidamente num bucket de LEITURA pública (o fechamento da
 * leitura é o follow-up do APPSEC-02). Aqui limitamos a retenção: removemos os ZIPs
 * de export do tenant já vencidos (mais velhos que a janela do signed URL), pelos
 * quais o link já morreu — objeto = pura responsabilidade.
 *
 * ⚠️ Cobre o caso "tenant exporta de novo" (limpeza oportunista no próximo export).
 * O caso "exporta UMA vez e nunca mais" ainda precisa de um job agendado/TTL de bucket
 * (documentado em SEGURANCA_PENDENTE) — Supabase Storage não tem TTL nativo.
 */
export const EXPORT_RETENTION_HOURS = 72;
const EXPORT_PREFIX = "exports";
const EXPORT_NAME_RE = /^data_export_(\d+)\.zip$/;

export async function purgeExpiredExports(
  tenantId: string,
  retentionHours: number = EXPORT_RETENTION_HOURS,
): Promise<number> {
  const prefix = `${EXPORT_PREFIX}/${tenantId}`;
  try {
    const { data: files, error } = await supabaseAdmin.storage.from("uploads").list(prefix);
    if (error || !files) return 0;

    const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
    const toRemove: string[] = [];
    for (const f of files as Array<{ name: string }>) {
      const m = EXPORT_NAME_RE.exec(f.name);
      if (m && Number(m[1]) < cutoff) toRemove.push(`${prefix}/${f.name}`);
    }

    if (toRemove.length === 0) return 0;

    const { error: rmError } = await supabaseAdmin.storage.from("uploads").remove(toRemove);
    if (rmError) {
      logger.error("export_retention_purge_failed", { tenant_id: tenantId, error: rmError.message });
      return 0;
    }
    logger.info("export_retention_purged", { tenant_id: tenantId, removed: toRemove.length });
    return toRemove.length;
  } catch (e: any) {
    logger.error("export_retention_error", { tenant_id: tenantId, error: e?.message });
    return 0;
  }
}
