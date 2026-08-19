import { useEffect, useState } from "react";
import { getSignedUrl } from "@/src/lib/storage";

/**
 * APPSEC-02/LGPD-01: valores persistidos de mídia (`messages.attachment.url`,
 * `service_order_media.url`) agora guardam um PATH do bucket privado `uploads`
 * (`tenants/{tenantId}/...`), não mais uma URL pública. Pra renderizar (`<img src>`,
 * `<a href>`), é preciso assinar uma URL nova a cada exibição (expira em 1h).
 *
 * Só assina valores que PARECEM path (`tenants/...`) — qualquer outra coisa (URL externa
 * já completa, ex.: mídia recebida de um provider e nunca reenviada ao nosso Storage)
 * passa direto, sem tentar assinar. Resolve em lote e memoiza pela lista de entrada.
 */
function looksLikeStoragePath(v: string): boolean {
  return v.startsWith("tenants/");
}

export function useSignedMediaUrls(values: Array<string | null | undefined>): Map<string, string> {
  const key = values.filter(Boolean).join("|");
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const paths = Array.from(new Set(values.filter((v): v is string => !!v && looksLikeStoragePath(v))));
    if (paths.length === 0) {
      setResolved(new Map());
      return;
    }

    Promise.all(
      paths.map(async (p) => [p, await getSignedUrl(p).catch(() => "")] as const),
    ).then((entries) => {
      if (!cancelled) setResolved(new Map(entries));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}

/** Resolve um único valor usando o Map do hook acima — passa direto se não for um path. */
export function resolveMediaUrl(value: string | null | undefined, resolved: Map<string, string>): string {
  if (!value) return "";
  if (!looksLikeStoragePath(value)) return value;
  return resolved.get(value) || "";
}
