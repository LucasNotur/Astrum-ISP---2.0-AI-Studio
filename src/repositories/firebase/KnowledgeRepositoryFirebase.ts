import { KnowledgeRepository, KnowledgeArticle } from '../interfaces';
import { db } from '../../lib/firebase';
import { collection, doc, getDocs, updateDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';

export class KnowledgeRepositoryFirebase implements KnowledgeRepository {
  async search(queryStr: string, tenantId: string): Promise<KnowledgeArticle[]> {
    // Note: Full-text search or vector search implementation may vary in Firebase.
    // For now, this is a basic stub that would typically integrate with Algolia, Elastic, or vector embeddings directly.
    // This is replacing direct calls in db.ts or gemini.ts
    throw new Error('Search requires vector store or external index in Firebase.');
  }

  async findAll(tenantId: string): Promise<KnowledgeArticle[]> {
    const q = query(
      collection(db, 'knowledge_base'),
      where('tenant_id', '==', tenantId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeArticle));
  }

  async create(data: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> {
    const docRef = await addDoc(collection(db, 'knowledge_base'), data);
    return { id: docRef.id, ...data } as KnowledgeArticle;
  }

  async update(id: string, data: Partial<KnowledgeArticle>): Promise<void> {
    await updateDoc(doc(db, 'knowledge_base', id), data);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'knowledge_base', id));
  }
}
