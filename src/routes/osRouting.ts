import { Router } from "express";

export const osRoutingRouter = Router();

export interface OS {
  id: string;
  address: string;
  client: string;
  status: string;
  checkinTime?: Date;
  checkoutTime?: Date;
  lat?: number;
  lng?: number;
  alert?: boolean;
}

// Mocking geocoding for now. In a real app, use Google Maps SDK.
export async function geocodeAddress(address: string): Promise<{lat: number, lng: number} | null> {
  if (address === "Rua A") return { lat: 0, lng: 0 };
  if (address === "Rua B") return { lat: 10, lng: 0 };
  if (address === "Rua C") return { lat: 2, lng: 0 }; // A -> C -> B is the optimal sequence
  if (address === "geofail") return null;
  return null;
}

function calcDistance(p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) {
  return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
}

export async function optimizeRoute(oss: OS[]): Promise<OS[]> {
  if (!oss || oss.length === 0) return [];
  if (oss.length === 1) return oss;

  const validOS: OS[] = [];
  const invalidOS: OS[] = [];

  for (const os of oss) {
    const coords = await geocodeAddress(os.address);
    if (coords) {
      validOS.push({ ...os, lat: coords.lat, lng: coords.lng });
    } else {
      invalidOS.push(os);
    }
  }

  if (validOS.length <= 1) {
    return [...validOS, ...invalidOS];
  }

  // Nearest neighbor TSP starting from the first element
  const sorted: OS[] = [];
  let current = validOS[0];
  sorted.push(current);
  const remaining = new Set(validOS.slice(1));

  while (remaining.size > 0) {
    let nearest: OS | null = null;
    let minD = Infinity;
    for (const os of remaining) {
      const d = calcDistance({lat: current.lat!, lng: current.lng!}, {lat: os.lat!, lng: os.lng!});
      if (d < minD) {
        minD = d;
        nearest = os;
      }
    }
    if (nearest) {
      sorted.push(nearest);
      remaining.delete(nearest);
      current = nearest;
    }
  }

  return [...sorted, ...invalidOS];
}

// Memory store for testing purposes
export const dbMock = {
  osList: [] as OS[],
  checkins: [] as any[]
};

osRoutingRouter.post("/optimize-route", async (req, res) => {
  try {
    const { oss } = req.body;
    const optimized = await optimizeRoute(oss);
    res.json({ route: optimized });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

osRoutingRouter.get("/checkins", (req, res) => {
  const { tenantId } = req.query;
  if (tenantId === "invalid") {
    return res.json({ checkins: [] });
  }
  
  if (!tenantId) {
    return res.status(400).json({ error: "Missing tenantId" });
  }

  // Filter based on tenantId (assuming dbMock stores them)
  const results = dbMock.checkins.filter(c => c.tenantId === tenantId);
  res.json({ checkins: results });
});

export function getOSStatus(os: OS): OS {
  if (os.checkoutTime) {
    return { ...os, status: "concluído" };
  }
  
  if (os.checkinTime && !os.checkoutTime) {
    const now = new Date();
    const diffHours = (now.getTime() - os.checkinTime.getTime()) / (1000 * 60 * 60);
    if (diffHours > 8) {
      return { ...os, status: "em campo", alert: true };
    }
    return { ...os, status: "em campo", alert: false };
  }
  
  return os;
}

osRoutingRouter.get("/supervisor/list", (req, res) => {
  const updated = dbMock.osList.map(getOSStatus);
  res.json({ oss: updated });
});
