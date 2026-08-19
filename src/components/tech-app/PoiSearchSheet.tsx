import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Fuel, Wrench, Pill, UtensilsCrossed, Coffee, MapPin } from 'lucide-react';
import { useTechAppStore } from '../../store/techAppStore';
import { fetchNearbyPoi, searchAddress, POI_CATEGORIES, type PoiCategory, type PoiResult } from '../../lib/poiSearch';
import { tech } from './theme';

const CATEGORY_ICON: Record<PoiCategory, React.ReactNode> = {
  fuel: <Fuel size={20} />,
  hardware: <Wrench size={20} />,
  pharmacy: <Pill size={20} />,
  restaurant: <UtensilsCrossed size={20} />,
  cafe: <Coffee size={20} />,
};

/**
 * Busca de POI genérico no mapa — clone da tela "Поиск локаций" do case
 * dprofile.ru/case/30156: chips "Find nearby" por categoria + busca livre de
 * endereço, mesmo layout (chips redondos + lista + campo de busca embaixo).
 */
export function PoiSearchSheet() {
  const searchOpen = useTechAppStore((s) => s.searchOpen);
  const setSearchOpen = useTechAppStore((s) => s.setSearchOpen);
  const gps = useTechAppStore((s) => s.gps);
  const setPoiResults = useTechAppStore((s) => s.setPoiResults);
  const setSelectedPoi = useTechAppStore((s) => s.setSelectedPoi);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PoiCategory | null>(null);
  const [results, setResults] = useState<PoiResult[]>([]);
  const [loading, setLoading] = useState(false);

  if (!searchOpen) return null;

  async function handleCategory(cat: PoiCategory) {
    if (!gps) return;
    setActiveCategory(cat);
    setQuery('');
    setLoading(true);
    const found = await fetchNearbyPoi(cat, { lat: gps.lat, lng: gps.lng });
    setResults(found);
    setLoading(false);
  }

  async function handleSearch(text: string) {
    setQuery(text);
    setActiveCategory(null);
    if (text.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    const found = await searchAddress(text, gps ? { lat: gps.lat, lng: gps.lng } : undefined);
    setResults(found);
    setLoading(false);
  }

  function handlePick(poi: PoiResult) {
    setSelectedPoi(poi);
    setPoiResults(results);
    setSearchOpen(false);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="absolute inset-0 z-30 flex flex-col"
        style={{ background: tech.bg }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <h2 className="text-lg font-extrabold" style={{ color: tech.text }}>Buscar no mapa</h2>
          <button onClick={() => setSearchOpen(false)} className="p-2 rounded-full active:scale-90 transition-transform" style={{ background: tech.elevated }}>
            <X size={18} style={{ color: tech.text }} />
          </button>
        </div>

        {/* Find nearby — chips por categoria */}
        <div className="px-4 pb-2">
          <p className="text-xs font-bold mb-2.5" style={{ color: tech.textMuted }}>PERTO DE VOCÊ</p>
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {POI_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => handleCategory(c.key)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform"
              >
                <div
                  className="flex items-center justify-center rounded-2xl"
                  style={{
                    width: 52, height: 52,
                    background: activeCategory === c.key ? tech.accent : tech.elevated,
                    color: activeCategory === c.key ? '#fff' : tech.text,
                  }}
                >
                  {CATEGORY_ICON[c.key]}
                </div>
                <span className="text-[10px] font-semibold" style={{ color: tech.textSecondary, maxWidth: 64 }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto px-4 pt-2">
          {loading && <p className="text-sm text-center mt-6" style={{ color: tech.textMuted }}>Buscando...</p>}
          {!loading && results.length === 0 && query.length >= 3 && (
            <p className="text-sm text-center mt-6" style={{ color: tech.textMuted }}>Nada encontrado.</p>
          )}
          <div className="space-y-1">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => handlePick(r)}
                className="w-full flex items-center gap-3 py-3 text-left active:opacity-70 transition-opacity"
                style={{ borderBottom: `1px solid ${tech.borderSubtle}` }}
              >
                <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 36, height: 36, background: tech.elevated }}>
                  <MapPin size={16} style={{ color: tech.accentLight }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate" style={{ color: tech.text }}>{r.name}</p>
                  {r.address && <p className="text-xs truncate" style={{ color: tech.textMuted }}>{r.address}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Campo de busca — "Where you going?" */}
        <div className="px-4 pb-6 pt-2" style={{ borderTop: `1px solid ${tech.border}` }}>
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: tech.elevated, borderRadius: 16 }}>
            <Search size={18} style={{ color: tech.textMuted }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar endereço ou local..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: tech.text }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
