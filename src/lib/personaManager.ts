import { adminDb as db } from "./firebaseAdmin";
import admin from "./firebaseAdmin";

export interface AIPersona {
  id?: string;
  tenant_id: string;
  name: string;
  avatar_url?: string;
  tone: "formal" | "friendly" | "playful";
  language_level: "simple" | "technical" | "advanced";
  custom_instructions: string;
  active_tools: string[];
  temperature: number;
  is_default: boolean;
  created_at?: Date | any;
  updated_at?: Date | any;
}

export const createPersona = async (persona: Omit<AIPersona, "id" | "created_at" | "updated_at">): Promise<string> => {
  if (persona.custom_instructions && persona.custom_instructions.length > 2000) {
    throw new Error("Custom instructions cannot exceed 2000 characters.");
  }

  // If this is set to default, we must unset other defaults for this tenant
  if (persona.is_default) {
    await unsetDefaultsForTenant(persona.tenant_id);
  }

  const docRef = await db.collection("ai_personas").add({
    ...persona,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return docRef.id;
};

export const getPersona = async (id: string): Promise<AIPersona | null> => {
  const docSnap = await db.collection("ai_personas").doc(id).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() } as AIPersona;
};

export const getPersonasByTenant = async (tenantId: string): Promise<AIPersona[]> => {
  const snapshot = await db.collection("ai_personas").where("tenant_id", "==", tenantId).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as AIPersona));
};

export const updatePersona = async (id: string, updates: Partial<Omit<AIPersona, "id" | "created_at">>): Promise<void> => {
  if (updates.custom_instructions && updates.custom_instructions.length > 2000) {
    throw new Error("Custom instructions cannot exceed 2000 characters.");
  }

  if (updates.is_default && updates.tenant_id) {
     await unsetDefaultsForTenant(updates.tenant_id, id);
  } else if (updates.is_default) {
     const p = await getPersona(id);
     if (p) await unsetDefaultsForTenant(p.tenant_id, id);
  }

  await db.collection("ai_personas").doc(id).update({
    ...updates,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
};

export const deletePersona = async (id: string): Promise<void> => {
  await db.collection("ai_personas").doc(id).delete();
};

export const getDefaultPersona = async (tenantId: string): Promise<AIPersona | null> => {
  const snapshot = await db.collection("ai_personas")
    .where("tenant_id", "==", tenantId)
    .where("is_default", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AIPersona;
};

const unsetDefaultsForTenant = async (tenantId: string, excludeId?: string) => {
  const defaults = await db.collection("ai_personas")
    .where("tenant_id", "==", tenantId)
    .where("is_default", "==", true)
    .get();
  
  const batch = db.batch();
  defaults.docs.forEach((doc) => {
    if (doc.id !== excludeId) {
      batch.update(doc.ref, { is_default: false });
    }
  });

  if (defaults.docs.length > 0) {
    await batch.commit();
  }
};
