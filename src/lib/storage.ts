import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { storage } from "./firebase";

function validateTenantPath(path: string) {
  if (!path.startsWith("tenants/")) {
    throw new Error(`INVALID_STORAGE_PATH: Path must start with 'tenants/'. Received: ${path}`);
  }
}

export const uploadTenantFile = async (
  tenantId: string,
  category: string,
  filename: string,
  fileOrBuffer: File | Blob | Uint8Array | ArrayBuffer
): Promise<string> => {
  if (!tenantId) throw new Error("TENANT_REQUIRED");
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath);
  
  const fileRef = ref(storage, fullPath);
  await uploadBytes(fileRef, fileOrBuffer as any);
  return await getDownloadURL(fileRef);
};

export const downloadTenantFile = async (tenantId: string, category: string, filename: string): Promise<string> => {
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath);
  const fileRef = ref(storage, fullPath);
  return await getDownloadURL(fileRef);
};

export const deleteTenantFile = async (tenantId: string, category: string, filename: string): Promise<void> => {
  const fullPath = `tenants/${tenantId}/${category}/${filename}`;
  validateTenantPath(fullPath);
  const fileRef = ref(storage, fullPath);
  await deleteObject(fileRef);
};

export const listTenantFiles = async (tenantId: string, category: string) => {
  const fullPath = `tenants/${tenantId}/${category}`;
  validateTenantPath(fullPath);
  const folderRef = ref(storage, fullPath);
  const res = await listAll(folderRef);
  
  const files = await Promise.all(
    res.items.map(async (itemRef) => {
      const url = await getDownloadURL(itemRef);
      return { name: itemRef.name, fullPath: itemRef.fullPath, url };
    })
  );
  
  return files;
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
  
  validateTenantPath(fullPath);
  const fileRef = ref(storage, fullPath);
  
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
};
