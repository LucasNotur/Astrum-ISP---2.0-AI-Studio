import { useTechAppStore } from '../../store/techAppStore';

/**
 * Tema do app técnico — claro + escuro. O modo escuro (usado sempre no mapa/nav)
 * clona a paleta do case "Navigator" (dprofile.ru/case/30156): MegaBlack + Blue
 * #0075F2 + Yellow #EECF6D + Green #8BD164 + Red #D64045. Cada componente pega
 * os tokens via useTech(), que lê o modo atual da store. `tech` (default =
 * escuro) fica como fallback.
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

// Paleta clonada do case "Navigator" (dprofile.ru/case/30156) — MegaBlack + os 4
// acentos exatos do moodboard: Blue #0075F2, Yellow #EECF6D, Green #8BD164, Red #D64045.
export const DARK: TechTokens = {
  bg: '#0B0B0B', card: '#151517', elevated: '#1c1c1e', border: '#282828', borderSubtle: '#1c1c1e',
  text: '#fafafa', textSecondary: '#9c9ca0', textMuted: '#6a6a70', textDim: '#48484d',
  accent: '#0075F2', accentLight: '#4d9bff', accentDeep: '#0058ba', onAccent: '#ffffff',
  accentDim: 'rgba(0,117,242,0.12)', accentBorder: 'rgba(0,117,242,0.28)', accentGlow: 'rgba(0,117,242,0.45)',
  lemon: '#EECF6D',
  pending: '#EECF6D', active: '#0075F2', done: '#8BD164', danger: '#D64045',
  trafficFree: '#8BD164', trafficMed: '#EECF6D', trafficHeavy: '#D64045',
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
