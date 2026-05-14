import { ServiceOrderRepository, ServiceOrder } from '../interfaces';
import { db } from '../../lib/firebase';
import { collection, doc, getDoc, getDocs, updateDoc, addDoc, query, where, Timestamp } from 'firebase/firestore';

export class ServiceOrderRepositoryFirebase implements ServiceOrderRepository {
  async findById(id: string): Promise<ServiceOrder | null> {
    const docRef = doc(db, 'service_orders', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ServiceOrder;
  }

  async findOpenByCustomer(customerId: string, tenantId: string): Promise<ServiceOrder[]> {
    const q = query(
      collection(db, 'service_orders'),
      where('customer_id', '==', customerId),
      where('tenant_id', '==', tenantId),
      where('status', 'in', ['open', 'in_progress', 'scheduled'])
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceOrder));
  }

  async findByDateRange(tenantId: string, start: Date, end: Date): Promise<ServiceOrder[]> {
    const q = query(
      collection(db, 'service_orders'),
      where('tenant_id', '==', tenantId),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end))
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceOrder));
  }

  async create(data: Partial<ServiceOrder>): Promise<ServiceOrder> {
    const docRef = await addDoc(collection(db, 'service_orders'), data);
    return { id: docRef.id, ...data } as ServiceOrder;
  }

  async update(id: string, data: Partial<ServiceOrder>): Promise<void> {
    await updateDoc(doc(db, 'service_orders', id), data);
  }
}
