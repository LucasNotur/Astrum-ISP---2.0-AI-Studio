/**
 * FZ-4 — Storage 100% Supabase (bucket "uploads", migration 032).
 * Assinaturas preservadas do módulo antigo (Firebase Storage).
 * Paths continuam tenant-scoped: tenants/{tenantId}/{category}/{filename}.
 *
 * APPSEC-02/LGPD-01 (migration 102 + este módulo): bucket agora PRIVADO. Escrita
 * (insert/update/delete) isolada por tenant via RLS desde a 093; LEITURA agora por
 * `createSignedUrl` (RLS SELECT own-tenant, migration 102) em vez de `getPublicUrl` — as
 * funções abaixo devolvem uma URL assinada de curto prazo (1h), suficiente pra uso
 * imediato (ex.: enviar o anexo pro WhatsApp logo após o upload).
 *
 * ⚠️ Quem PERSISTE o valor de retorno pra re-render depois (ex.: `messages.attachment`,
 * `service_order_media.url`) NÃO pode guardar essa URL assinada — ela expira. Guarde o
 * PATH (`tenants/{tenantId}/{category}/{filename}`, a mesma fórmula usada aqui dentro) e
 * resolva uma URL nova com `getSignedUrl(path)` no momento da renderização. Ver
 * `ChatPage.tsx`/`FieldOpsPage.tsx` (helper `useSignedMediaUrls`) para o padrão.
 */
import { supabase } from "./supabase";

const BUCKET = "uploads";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — cobre uso imediato (envio/preview); render posterior deve re-assinar.

function validateTenantPath(path: string, expectedTenantId?: string) {
  if (!path.startsWith("tenants/")) {
    throw new Error(`INVALID_STORAGE_PATH: Path must start with 'tenants/'. Received: ${path}`);
  }
  if (expectedTenantId && !path.startsWith(`tenants/${expectedTenantId}/`)) {
    throw new Error(`TENANT_MISMATCH`);
  }
  if (path.includes("..")) {
    throw new Error(`TENANT_MISMATCH`);
  }
}

async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Falha ao assinar URL: ${error?.message ?? "desconhecido"}`);
  return data.signedUrl;
}

/**
 * Resolve uma URL assinada nova a partir de um PATH já persistido (ex.: lido de
 * `messages.attachment.path`/`service_order_media.url`). Use no momento da renderização,
 * nunca guarde o resultado — ele expira em 1h.
 */
export const getSignedUrl = signedUrl;

export interface UploadResult {
  /** Path bruto no bucket — é isso que deve ser PERSISTIDO (ex.: numa coluna de anexo). */
  path: string;
  /** URL assinada, válida por SIGNED_URL_TTL_SECONDS — só pra uso IMEDIATO, nunca persista. */
  url: string;
}

export const uploadTenantFile = async (
  tenantId: string,
  category: string,
  filename: string,
  fileOrBuffer: File | Blob | Uint8Array | ArrayBuffer
): Promise<UploadResult> => {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath, tenantId);

  const { error } = await supabase.storage.from(BUCKET).upload(fullPath, fileOrBuffer as any, { upsert: true });
  if (error) throw new Error(`Upload falhou: ${error.message}`);
  return { path: fullPath, url: await signedUrl(fullPath) };
};

export const downloadTenantFile = async (tenantId: string, category: string, filename: string): Promise<string> => {
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath, tenantId);
  return signedUrl(fullPath);
};

export const deleteTenantFile = async (tenantId: string, category: string, filename: string): Promise<void> => {
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath, tenantId);
  const { error } = await supabase.storage.from(BUCKET).remove([fullPath]);
  if (error) throw new Error(`Delete falhou: ${error.message}`);
};

export const listTenantFiles = async (tenantId: string, category: string) => {
  const fullPath = `tenants/${tenantId}/${category}`;
  validateTenantPath(fullPath, tenantId);
  const { data, error } = await supabase.storage.from(BUCKET).list(fullPath);
  if (error) throw new Error(`List falhou: ${error.message}`);
  return Promise.all((data ?? []).map(async (item) => ({
    name: item.name,
    fullPath: `${fullPath}/${item.name}`,
    url: await signedUrl(`${fullPath}/${item.name}`),
  })));
};

// Legacy adapter for gradual migration
export const uploadAttachment = async (file: File, pathFolder: string, tenantId?: string): Promise<UploadResult> => {
  if (!file) throw new Error("No file provided");
  const extension = file.name.split('.').pop() || '';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;

  let fullPath = `${pathFolder}/${fileName}`;
  // Enforce tenant path
  if (!fullPath.startsWith("tenants/")) {
    if (!tenantId) throw new Error("INVALID_STORAGE_PATH: Uploads must specify a tenantId or be manually prefixed with 'tenants/tenantId/'");
    fullPath = `tenants/${tenantId}/${pathFolder}/${fileName}`;
  }

  validateTenantPath(fullPath, tenantId);
  const { error } = await supabase.storage.from(BUCKET).upload(fullPath, file);
  if (error) throw new Error(`Upload falhou: ${error.message}`);
  return { path: fullPath, url: await signedUrl(fullPath) };
};
