import { useState, useCallback } from 'react';
import { OVERVIEW_WIDGETS, DASHBOARD_PRESETS } from '@/src/lib/dashboard-registry';

export interface LayoutItem { id: string; visible: boolean; }

const storageKey = (tenantId: string) => `astrum:dashboard-layout:${tenantId}`;

const defaultItems = (): LayoutItem[] =>
  OVERVIEW_WIDGETS.map((w) => ({ id: w.id, visible: true }));

export function useDashboardLayout(tenantId: string) {
  const key = storageKey(tenantId);

  const [items, setItems] = useState<LayoutItem[]>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultItems();
  });

  const [editMode, setEditMode] = useState(false);

  const save = useCallback((newItems: LayoutItem[]) => {
    setItems(newItems);
    try { localStorage.setItem(key, JSON.stringify(newItems)); } catch {}
  }, [key]);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    save(next);
  }, [items, save]);

  const toggleVisibility = useCallback((id: string) => {
    save(items.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)));
  }, [items, save]);

  const applyPreset = useCallback((presetKey: string) => {
    const preset = DASHBOARD_PRESETS[presetKey];
    if (!preset) return;
    save([...preset.items]);
  }, [save]);

  return { items, editMode, setEditMode, reorder, toggleVisibility, applyPreset };
}
