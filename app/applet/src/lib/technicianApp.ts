export interface Location { lat: number; lng: number; }
export interface OS {
  id: string;
  signature_url?: string;
  status: 'pending' | 'in_progress' | 'completed';
  checkin_photo_skipped?: boolean;
}

export interface DevicePermissions {
  gps: boolean;
  camera: boolean;
}

export interface Storage {
  saveLocal(key: string, data: any): Promise<void>;
  getLocal(key: string): Promise<any>;
  removeLocal(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

export interface Api {
  syncCheckin(osId: string, data: any): Promise<void>;
  generatePdf(osId: string, signatureUrl: string): Promise<OS>;
}

export class TechnicianApp {
  private checkedInOs = new Set<string>();

  constructor(private storage: Storage, private api: Api, private isOnline: () => boolean) {}

  async checkIn(osId: string, permissions: DevicePermissions, location?: Location): Promise<{ success: boolean; error?: string; checkin_photo_skipped?: boolean }> {
    if (!permissions.gps) {
      return { success: false, error: 'GPS permission is required for check-in.' };
    }

    const checkInData = {
      timestamp: Date.now(),
      location,
      checkin_photo_skipped: !permissions.camera
    };

    if (this.isOnline()) {
      await this.api.syncCheckin(osId, checkInData);
      this.checkedInOs.add(osId);
    } else {
      await this.storage.saveLocal(`pending_checkin_${osId}`, checkInData);
    }

    return { success: true, checkin_photo_skipped: checkInData.checkin_photo_skipped };
  }

  async checkOut(osId: string): Promise<{ success: boolean; error?: string }> {
    const checkInLocal = await this.storage.getLocal(`pending_checkin_${osId}`);
    
    if (!checkInLocal && !this.checkedInOs.has(osId)) {
      return { success: false, error: 'Cannot check-out without a previous check-in.' };
    }

    this.checkedInOs.delete(osId);
    return { success: true };
  }

  async signOS(osId: string, signatureUrl: string): Promise<OS> {
    return await this.api.generatePdf(osId, signatureUrl);
  }

  optimizeRoute(addresses: { id: string; location: Location }[]): { id: string; location: Location }[] {
    const distance = (loc1: Location, loc2: Location) => 
      Math.sqrt(Math.pow(loc1.lat - loc2.lat, 2) + Math.pow(loc1.lng - loc2.lng, 2));

    let currentLoc = { lat: 0, lng: 0 };
    const unvisited = [...addresses];
    const optimized = [];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDis = distance(currentLoc, unvisited[0].location);
      for (let i = 1; i < unvisited.length; i++) {
        const d = distance(currentLoc, unvisited[i].location);
        if (d < minDis) {
          minDis = d;
          nearestIdx = i;
        }
      }
      currentLoc = unvisited[nearestIdx].location;
      optimized.push(unvisited[nearestIdx]);
      unvisited.splice(nearestIdx, 1);
    }

    return optimized;
  }

  async syncOfflineData() {
    const keys = await this.storage.getAllKeys();
    for (const k of keys) {
      if (k.startsWith('pending_checkin_')) {
        const osId = k.replace('pending_checkin_', '');
        const data = await this.storage.getLocal(k);
        await this.api.syncCheckin(osId, data);
        await this.storage.removeLocal(k);
        this.checkedInOs.add(osId);
      }
    }
  }

  getServiceWorkerStrategy(url: string): string {
    if (url.includes('/api/')) {
      return 'network-first';
    }
    return 'cache-first';
  }
}
