import { TicketRepository, Ticket, SessionState } from '../interfaces';
import { db } from '../../lib/firebase';
import { doc, getDoc, getDocs, updateDoc, addDoc, query, where, limit } from 'firebase/firestore';
import { wrapFirestoreCollection } from '../../lib/tenantGuard';

export class TicketRepositoryFirebase implements TicketRepository {
  async findById(id: string): Promise<Ticket | null> {
    const docRef = doc(db, 'tickets', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Ticket;
  }

  async findOpenByPhone(phone: string, tenantId: string): Promise<Ticket | null> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const q = wrapFirestoreCollection(db, 'tickets', tenantId).query(
      where('phone_number', '==', phone),
      where('status', 'in', ['open', 'in_progress', 'waiting']),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Ticket;
  }

  async create(data: Partial<Ticket>): Promise<Ticket> {
    if (!data.tenant_id) throw new Error('TENANT_REQUIRED');
    const docRef = await addDoc(wrapFirestoreCollection(db, 'tickets', data.tenant_id as string).ref, data);
    return { id: docRef.id, ...data } as Ticket;
  }

  async update(id: string, data: Partial<Ticket>): Promise<void> {
    await updateDoc(doc(db, 'tickets', id), data);
  }

  async updateSessionState(id: string, state: Partial<SessionState>): Promise<void> {
    await updateDoc(doc(db, 'tickets', id), { session_state: state });
  }
}
