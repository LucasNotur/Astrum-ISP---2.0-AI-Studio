/**
 * FZ-4 — Storage 100% Supabase (bucket "uploads", migration 032).
 * Assinaturas preservadas do módulo antigo (Firebase Storage).
 * Paths continuam tenant-scoped: tenants/{tenantId}/{category}/{filename}.
 */
import { supabase } from "./supabase";

const BUCKET = "uploads";

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

function publicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export const uploadTenantFile = async (
  tenantId: string,
  category: string,
  filename: string,
  fileOrBuffer: File | Blob | Uint8Array | ArrayBuffer
): Promise<string> => {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath, tenantId);

  const { error } = await supabase.storage.from(BUCKET).upload(fullPath, fileOrBuffer as any, { upsert: true });
  if (error) throw new Error(`Upload falhou: ${error.message}`);
  return publicUrl(fullPath);
};

export const downloadTenantFile = async (tenantId: string, category: string, filename: string): Promise<string> => {
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath, tenantId);
  return publicUrl(fullPath);
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
  return (data ?? []).map((item) => ({
    name: item.name,
    fullPath: `${fullPath}/${item.name}`,
    url: publicUrl(`${fullPath}/${item.name}`),
  }));
};

// Legacy adapter for gradual migration
export const uploadAttachment = async (file: File, pathFolder: string, tenantId?: string): Promise<string> => {
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
  return publicUrl(fullPath);
};
