import { ServiceOrderRepository, ServiceOrder } from '../interfaces';
import { db } from '../../lib/firebase';
import { doc, getDoc, getDocs, updateDoc, addDoc, query, where, Timestamp } from 'firebase/firestore';
import { wrapFirestoreCollection } from '../../lib/tenantGuard';

export class ServiceOrderRepositoryFirebase implements ServiceOrderRepository {
  async findById(id: string): Promise<ServiceOrder | null> {
    const docRef = doc(db, 'service_orders', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ServiceOrder;
  }

  async findOpenByCustomer(customerId: string, tenantId: string): Promise<ServiceOrder[]> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const q = wrapFirestoreCollection(db, 'service_orders', tenantId).query(
      where('customer_id', '==', customerId),
      where('status', 'in', ['open', 'in_progress', 'scheduled'])
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceOrder));
  }

  async findByDateRange(tenantId: string, start: Date, end: Date): Promise<ServiceOrder[]> {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const q = wrapFirestoreCollection(db, 'service_orders', tenantId).query(
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end))
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceOrder));
  }

  async create(data: Partial<ServiceOrder>): Promise<ServiceOrder> {
    if (!data.tenant_id) throw new Error('TENANT_REQUIRED');
    const docRef = await addDoc(wrapFirestoreCollection(db, 'service_orders', data.tenant_id as string).ref, data);
    return { id: docRef.id, ...data } as ServiceOrder;
  }

  async update(id: string, data: Partial<ServiceOrder>): Promise<void> {
    await updateDoc(doc(db, 'service_orders', id), data);
  }
}
