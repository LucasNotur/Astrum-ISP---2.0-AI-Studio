import { CustomerRepository, Customer } from '../interfaces';
import { db } from '../../lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, addDoc } from 'firebase/firestore';

export class CustomerRepositoryFirebase implements CustomerRepository {
  async findById(id: string, tenantId: string): Promise<Customer | null> {
    const docRef = doc(db, 'customers', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.tenant_id !== tenantId) return null;
    return { id: snap.id, ...data } as Customer;
  }

  async findByPhone(phone: string, tenantId: string): Promise<Customer | null> {
    const q = query(
      collection(db, 'customers'),
      where('phone_number', '==', phone),
      where('tenant_id', '==', tenantId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Customer;
  }

  async findByCpf(cpf: string, tenantId: string): Promise<Customer | null> {
    const { decryptCpf } = await import('../../lib/db');
    const q = query(
      collection(db, 'customers'),
      where('tenant_id', '==', tenantId)
    );
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
    const docRef = await addDoc(collection(db, 'customers'), data);
    return { id: docRef.id, ...data } as Customer;
  }

  async update(id: string, data: Partial<Customer>): Promise<void> {
    await updateDoc(doc(db, 'customers', id), data);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, 'customers', id));
  }
}
