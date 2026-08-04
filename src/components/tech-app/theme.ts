import { useTechAppStore } from '../../store/techAppStore';

/**
 * Tema do app Uber Técnico — claro + escuro, ambos alinhados ao design system
 * Astrum (accent Fiber #3D5AFE). Cada componente pega os tokens via useTech(),
 * que lê o modo atual da store. `tech` (default = escuro) fica como fallback.
 */
export interface TechTokens {
  bg: string; card: string; elevated: string; border: string; borderSubtle: string;
  text: string; textSecondary: string; textMuted: string; textDim: string;
  accent: string; accentLight: string; accentDeep: string; onAccent: string;
  accentDim: string; accentBorder: string; accentGlow: string;
  lemon: string;
  pending: string; active: string; done: string; danger: string;
  trafficFree: string; trafficMed: string; trafficHeavy: string;
  isDark: boolean;
}

export const DARK: TechTokens = {
  bg: '#0a0a0b', card: '#151517', elevated: '#1c1c1e', border: '#26262a', borderSubtle: '#1c1c1e',
  text: '#fafafa', textSecondary: '#9c9ca0', textMuted: '#6a6a70', textDim: '#48484d',
  accent: '#3D5AFE', accentLight: '#6d89ff', accentDeep: '#2f48d1', onAccent: '#ffffff',
  accentDim: 'rgba(61,90,254,0.12)', accentBorder: 'rgba(61,90,254,0.28)', accentGlow: 'rgba(61,90,254,0.45)',
  lemon: '#F2E349',
  pending: '#F5A524', active: '#3D5AFE', done: '#00C2A8', danger: '#E5484D',
  trafficFree: '#00C2A8', trafficMed: '#F5A524', trafficHeavy: '#E5484D',
  isDark: true,
};

export const LIGHT: TechTokens = {
  bg: '#f4f4f6', card: '#ffffff', elevated: '#eef0f2', border: '#e2e2e7', borderSubtle: '#ececef',
  text: '#0e0e12', textSecondary: '#52525b', textMuted: '#71717a', textDim: '#a1a1aa',
  accent: '#3D5AFE', accentLight: '#2e4be0', accentDeep: '#2233a8', onAccent: '#ffffff',
  accentDim: 'rgba(61,90,254,0.10)', accentBorder: 'rgba(61,90,254,0.25)', accentGlow: 'rgba(61,90,254,0.30)',
  lemon: '#a88f00',
  pending: '#d97706', active: '#3D5AFE', done: '#059f89', danger: '#dc2626',
  trafficFree: '#059f89', trafficMed: '#d97706', trafficHeavy: '#dc2626',
  isDark: false,
};

/**
 * `tech` é um proxy vivo: cada acesso (tech.bg, tech.accent…) devolve o valor do
 * modo ATUAL da store. Assim todos os `tech.x` e `${tech.x}alpha` já espalhados
 * pelos componentes viram theme-aware sem reescrever nada. Como leitura de proxy
 * não dispara re-render, as páginas remontam a árvore via key={themeMode}.
 */
export const tech: TechTokens = new Proxy(DARK, {
  get(_t, prop) {
    const mode = useTechAppStore.getState().themeMode;
    return (mode === 'light' ? LIGHT : DARK)[prop as keyof TechTokens];
  },
}) as TechTokens;

/** Hook reativo (opcional): retorna os tokens do modo atual e re-renderiza. */
export function useTech(): TechTokens {
  const mode = useTechAppStore((s) => s.themeMode);
  return mode === 'light' ? LIGHT : DARK;
}

export type TechColor = keyof TechTokens;
