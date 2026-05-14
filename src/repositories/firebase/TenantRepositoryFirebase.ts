import { TenantRepository, Tenant } from '../interfaces';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export class TenantRepositoryFirebase implements TenantRepository {
  async findById(id: string): Promise<Tenant | null> {
    const docRef = doc(db, 'tenants', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Tenant;
  }
}
