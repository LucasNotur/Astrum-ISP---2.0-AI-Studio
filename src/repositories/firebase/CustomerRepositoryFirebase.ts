import { CustomerRepository, Customer } from '../interfaces';
import { db } from '../../lib/firebase';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, addDoc } from 'firebase/firestore';
import { wrapFirestoreCollection } from '../../lib/tenantGuard';

export class CustomerRepositoryFirebase implements CustomerRepository {
  async findById(id: string, tenantId: string): Promise<Customer | null> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const docRef = doc(db, 'customers', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.tenant_id !== tenantId) return null;
    return { id: snap.id, ...data } as Customer;
  }

  async findByPhone(phone: string, tenantId: string): Promise<Customer | null> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const q = wrapFirestoreCollection(db, 'customers', tenantId).query(
      where('phone_number', '==', phone),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Customer;
  }

  async findByCpf(cpf: string, tenantId: string): Promise<Customer | null> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const { decryptCpf } = await import('../../lib/db');
    const q = wrapFirestoreCollection(db, 'customers', tenantId).query();
    const snap = await getDocs(q);
    const cleanedCpf = cpf.replace(/\D/g, "");
    
    const customerMatch = snap.docs.find((d) => {
      const c = d.data().cpf;
      if (!c) return false;
      try {
        return decryptCpf(c).replace(/\D/g, "") === cleanedCpf;
      } catch (e) {
        return c.replace(/\D/g, "") === cleanedCpf;
      }
    });
    
    if (!customerMatch) return null;
    return { id: customerMatch.id, ...customerMatch.data() } as Customer;
  }

  async create(data: Partial<Customer>): Promise<Customer> {
    if (!data.tenant_id) throw new Error('TENANT_REQUIRED');
    const docRef = await addDoc(wrapFirestoreCollection(db, 'customers', data.tenant_id as string).ref, data);
    return { id: docRef.id, ...data } as Customer;
  }

  async update(id: string, data: Partial<Customer>): Promise<void> {
    await updateDoc(doc(db, 'customers', id), data);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'customers', id));
  }
}
