/**
 * Paleta oficial do app Uber Técnico — alinhada ao design system Astrum.
 * Fonte da verdade: src/index.css (@theme --color-astrum-*) + tokens dark shadcn.
 *
 * Accent principal = Astrum Fiber (#3D5AFE). Texto sobre o accent = branco.
 * Lemon (#F2E349) é detalhe/destaque pontual (avaliação, "pico"), nunca área grande.
 */
export const tech = {
  // Grounds (dark-first, espelham os tokens dark do sistema)
  bg: '#0a0a0b',          // --background dark
  card: '#151517',        // --card dark
  elevated: '#1c1c1e',    // superfícies elevadas / inputs
  border: '#26262a',      // --border/secondary dark
  borderSubtle: '#1c1c1e',

  // Texto
  text: '#fafafa',        // --foreground dark
  textSecondary: '#9c9ca0', // --muted-foreground dark
  textMuted: '#6a6a70',
  textDim: '#48484d',

  // Accent = Astrum Fiber
  accent: '#3D5AFE',
  accentLight: '#6d89ff',
  accentDeep: '#2f48d1',
  onAccent: '#ffffff',
  accentDim: 'rgba(61,90,254,0.12)',
  accentBorder: 'rgba(61,90,254,0.28)',
  accentGlow: 'rgba(61,90,254,0.45)',

  // Detalhe
  lemon: '#F2E349',       // --color-astrum-lemon

  // Semânticos (status)
  pending: '#F5A524',     // astrum-amber
  active: '#3D5AFE',      // astrum-fiber
  done: '#00C2A8',        // astrum-signal
  danger: '#E5484D',      // astrum-red

  // Traffic (rota por congestionamento — inspirado no nav de referência)
  trafficFree: '#00C2A8',
  trafficMed: '#F5A524',
  trafficHeavy: '#E5484D',
} as const;

export type TechColor = keyof typeof tech;
