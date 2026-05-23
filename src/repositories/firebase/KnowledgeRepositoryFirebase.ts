import { KnowledgeRepository, KnowledgeArticle } from '../interfaces';
import { db } from '../../lib/firebase';
import { doc, getDocs, updateDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { wrapFirestoreCollection } from '../../lib/tenantGuard';

export class KnowledgeRepositoryFirebase implements KnowledgeRepository {
  async search(queryStr: string, tenantId: string): Promise<KnowledgeArticle[]> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    // Note: Full-text search or vector search implementation may vary in Firebase.
    // For now, this is a basic stub that would typically integrate with Algolia, Elastic, or vector embeddings directly.
    // This is replacing direct calls in db.ts or gemini.ts
    throw new Error('Search requires vector store or external index in Firebase.');
  }

  async findAll(tenantId: string): Promise<KnowledgeArticle[]> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const q = wrapFirestoreCollection(db, 'knowledge_base', tenantId).query();
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeArticle));
  }

  async create(data: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> {
    if (!data.tenant_id) throw new Error('TENANT_REQUIRED');
    const docRef = await addDoc(wrapFirestoreCollection(db, 'knowledge_base', data.tenant_id as string).ref, data);
    return { id: docRef.id, ...data } as KnowledgeArticle;
  }

  async update(id: string, data: Partial<KnowledgeArticle>): Promise<void> {
    await updateDoc(doc(db, 'knowledge_base', id), data);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'knowledge_base', id));
  }
}
