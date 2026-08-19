/**
 * Disponibilidade de CTO em tempo real no mapa do técnico — equivalente Astrum
 * do "3/3 conectores disponíveis" do case dprofile.ru/case/30156: lá é vaga de
 * recarga, aqui é porta livre na caixa de terminação óptica mais próxima.
 * Leitura direta do Supabase (RLS por tenant_id), mesmo padrão já usado em
 * NetworkTwinPage/SandboxPage — não é rota do apps/api porque é só leitura de
 * uma tabela já protegida por RLS.
 */
import { supabase } from './supabase';

export interface CtoAvailability {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  totalPorts: number;
  usedPorts: number;
  status: string;
}

export async function fetchNearbyCtos(tenantId: string): Promise<CtoAvailability[]> {
  const { data, error } = await supabase
    .from('network_ctos')
    .select('id, name, latitude, longitude, total_ports, used_ports, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error || !data) return [];

  return data.map((c: any) => ({
    id: c.id,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude,
    totalPorts: c.total_ports ?? 0,
    usedPorts: c.used_ports ?? 0,
    status: c.status,
  }));
}

/** Cor do badge de ocupação: livre (verde) → cheio (vermelho), como o semáforo de trânsito da rota. */
export function occupancyColor(used: number, total: number): string {
  if (total <= 0) return '#6a6a70';
  const pct = used / total;
  if (pct >= 0.9) return '#D64045';
  if (pct >= 0.6) return '#EECF6D';
  return '#8BD164';
}
