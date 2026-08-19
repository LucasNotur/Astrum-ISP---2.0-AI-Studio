import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Navigation, MapPin } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchOsrmRoute } from '../../lib/osrm';
import { tech } from './theme';
import type { FieldOs } from '../../lib/fieldOps';

/**
 * Ação sobre o local buscado/marcado manualmente — "iniciar rota até aqui" pra
 * um endereço digitado à mão (não uma OS cadastrada), pedido explícito: poder
 * simular/rodar a navegação sem depender do endereço já estar numa OS.
 */
export function PoiActionCard() {
  const selectedPoi = useTechAppStore((s) => s.selectedPoi);
  const setSelectedPoi = useTechAppStore((s) => s.setSelectedPoi);
  const gps = useTechAppStore((s) => s.gps);
  const startNavigation = useTechAppStore((s) => s.startNavigation);

  if (!selectedPoi) return null;

  async function handleStartRoute() {
    if (!gps || !selectedPoi) return;
    const route = await fetchOsrmRoute([[gps.lat, gps.lng], [selectedPoi.latitude, selectedPoi.longitude]]);
    if (!route) return;
    const destination: FieldOs = {
      id: `poi-${selectedPoi.id}`,
      title: selectedPoi.name,
      client: selectedPoi.name,
      address: selectedPoi.address || selectedPoi.name,
      scheduledTime: '--:--',
      status: 'pending',
      type: 'Endereço manual',
      latitude: selectedPoi.latitude,
      longitude: selectedPoi.longitude,
      checklist: [],
    };
    startNavigation(route, destination);
    setSelectedPoi(null);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute left-3 right-3 z-20"
        style={{ bottom: 92 }}
      >
        <div className="shadow-2xl overflow-hidden" style={{ background: `${tech.card}f7`, backdropFilter: 'blur(20px)', borderRadius: 22, border: `1px solid ${tech.border}` }}>
          <div className="flex items-start gap-3 px-4 pt-4">
            <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: tech.accentDim }}>
              <MapPin size={18} style={{ color: tech.accentLight }} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-extrabold truncate" style={{ color: tech.text }}>{selectedPoi.name}</h3>
              {selectedPoi.address && <p className="text-xs truncate mt-0.5" style={{ color: tech.textMuted }}>{selectedPoi.address}</p>}
            </div>
            <button onClick={() => setSelectedPoi(null)} className="p-1.5 rounded-full flex-shrink-0" style={{ background: tech.elevated }}>
              <X size={14} style={{ color: tech.textMuted }} />
            </button>
          </div>

          <div className="p-4">
            <button
              onClick={handleStartRoute}
              className="w-full flex items-center justify-center gap-2 py-3.5 font-bold active:scale-[0.98] transition-transform"
              style={{ background: tech.accent, color: '#fff', borderRadius: 16 }}
            >
              <Navigation size={16} /> Iniciar rota até aqui
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
