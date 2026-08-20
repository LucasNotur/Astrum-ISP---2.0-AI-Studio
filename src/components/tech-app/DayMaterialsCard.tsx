import React, { useEffect, useState } from 'react';
import { Package, Check } from 'lucide-react';
import { fetchDayMaterials, type DayMaterial } from '../../lib/fieldOps';
import { tech } from './theme';

/**
 * "Materiais a levar hoje" — soma os itens de todas as OS do dia (endpoint
 * /api/v2/field/materials) numa checklist que o técnico confere ANTES de sair
 * da base, pra não voltar por causa de um roteador que faltou. Cada item pode
 * ser marcado como "peguei" (estado local, só visual).
 */
export function DayMaterialsCard() {
  const [items, setItems] = useState<DayMaterial[]>([]);
  const [osCount, setOsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [taken, setTaken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetchDayMaterials();
        if (!alive) return;
        setItems(r.items);
        setOsCount(r.osCount);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Sem materiais (ou API indisponível no preview) → não polui a home.
  if (loading || error || items.length === 0) return null;

  const takenCount = items.filter((i) => taken[i.name]).length;

  return (
    <div>
      <div className="p-4" style={{ background: tech.card, borderRadius: 16, border: `1px solid ${tech.borderSubtle}` }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: tech.accentDim }}>
            <Package size={18} style={{ color: tech.accentLight }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: tech.text }}>Materiais a levar hoje</p>
            <p className="text-xs" style={{ color: tech.textMuted }}>
              {takenCount}/{items.length} conferidos · {osCount} OS
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {items.map((m) => {
            const on = !!taken[m.name];
            return (
              <button
                key={m.name}
                onClick={() => setTaken((t) => ({ ...t, [m.name]: !t[m.name] }))}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                style={{ background: tech.elevated, borderRadius: 12, opacity: on ? 0.55 : 1 }}
              >
                <div
                  className="flex items-center justify-center rounded-md flex-shrink-0"
                  style={{ width: 20, height: 20, background: on ? tech.done : 'transparent', border: `1.5px solid ${on ? tech.done : tech.border}` }}
                >
                  {on && <Check size={13} style={{ color: '#08120f' }} />}
                </div>
                <span className="flex-1 text-sm font-medium" style={{ color: tech.text, textDecoration: on ? 'line-through' : 'none' }}>
                  {m.name}
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: tech.accentLight }}>
                  {m.quantity} {m.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
