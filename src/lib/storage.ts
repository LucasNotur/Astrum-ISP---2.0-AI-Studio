import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase.ts";

export const uploadAttachment = async (file: File, pathFolder: string): Promise<string> => {
  if (!file) throw new Error("No file provided");
  const extension = file.name.split('.').pop() || '';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
  const fileRef = ref(storage, `${pathFolder}/${fileName}`);
  
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
};
