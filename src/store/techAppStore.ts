import { create } from 'zustand';
import type { FieldOs, OptimizedRouteResult } from '../lib/fieldOps';
import type { OsrmRoute, OsrmStep } from '../lib/osrm';

export type TechView =
  | 'map'
  | 'navigation'
  | 'active-os'
  | 'agenda'
  | 'my-day'
  | 'day-route'   // Jornada hora a hora — inspirado no Citymapper/transit
  | 'day-report'  // Relatório de fim de turno — inspirado no report do Yango
  | 'profile';    // Perfil / conta

export interface GpsPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface NavigationState {
  route: OsrmRoute;
  destinationOs: FieldOs;
  currentStepIndex: number;
  currentStep: OsrmStep | null;
  remainingDistance: number;
  remainingDuration: number;
  isActive: boolean;
}

export interface ShiftData {
  shiftId?: string;
  startedAt?: string;
  odometerStart?: number;
  odometerEnd?: number;
  computedKm?: number;
}

interface TechAppState {
  currentView: TechView;
  setView: (view: TechView) => void;

  osList: FieldOs[];
  setOsList: (os: FieldOs[]) => void;

  activeOs: FieldOs | null;
  setActiveOs: (os: FieldOs | null) => void;

  gps: GpsPosition | null;
  setGps: (pos: GpsPosition) => void;

  optimizedRoute: OptimizedRouteResult | null;
  setOptimizedRoute: (route: OptimizedRouteResult | null) => void;

  osrmRoute: OsrmRoute | null;
  setOsrmRoute: (route: OsrmRoute | null) => void;

  navigation: NavigationState | null;
  startNavigation: (route: OsrmRoute, os: FieldOs) => void;
  updateNavigation: (stepIndex: number, remainingDist: number, remainingDur: number) => void;
  stopNavigation: () => void;

  shift: ShiftData | null;
  setShift: (shift: ShiftData | null) => void;

  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  deferredInstallPrompt: any;
  setDeferredInstallPrompt: (prompt: any) => void;

  // Modo demo: pula câmera/API para simular o fluxo só com toques
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;

  // Tela de apresentação (onboarding / rever tutorial)
  introOpen: boolean;
  setIntroOpen: (v: boolean) => void;

  // Tema claro/escuro global
  themeMode: 'light' | 'dark';
  setThemeMode: (m: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Modo de exibição: Desktop (tela cheia) x Mobile (moldura de celular centralizada)
  viewMode: 'desktop' | 'mobile';
  setViewMode: (m: 'desktop' | 'mobile') => void;
  toggleViewMode: () => void;
}

const introInit = (() => {
  try { return localStorage.getItem('astrum-tech-intro-seen') !== '1'; } catch { return true; }
})();

const themeInit: 'light' | 'dark' = (() => {
  try { return localStorage.getItem('astrum-tech-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
})();

const viewInit: 'desktop' | 'mobile' = (() => {
  try {
    const saved = localStorage.getItem('astrum-tech-viewmode');
    if (saved === 'mobile' || saved === 'desktop') return saved;
  } catch {}
  // sem preferência salva: detecta pelo viewport (< 640px = celular real)
  try { return window.innerWidth < 640 ? 'mobile' : 'desktop'; } catch { return 'desktop'; }
})();

export const useTechAppStore = create<TechAppState>((set) => ({
  currentView: 'map',
  setView: (view) => set({ currentView: view }),

  osList: [],
  setOsList: (osList) => set({ osList }),

  activeOs: null,
  setActiveOs: (activeOs) => set({ activeOs }),

  gps: null,
  setGps: (gps) => set({ gps }),

  optimizedRoute: null,
  setOptimizedRoute: (optimizedRoute) => set({ optimizedRoute }),

  osrmRoute: null,
  setOsrmRoute: (osrmRoute) => set({ osrmRoute }),

  navigation: null,
  startNavigation: (route, os) => set({
    navigation: {
      route,
      destinationOs: os,
      currentStepIndex: 0,
      currentStep: route.legs[0]?.steps[0] ?? null,
      remainingDistance: route.distance,
      remainingDuration: route.duration,
      isActive: true,
    },
    currentView: 'navigation',
  }),
  updateNavigation: (stepIndex, remainingDist, remainingDur) => set((state) => {
    if (!state.navigation) return {};
    const allSteps = state.navigation.route.legs.flatMap(l => l.steps);
    return {
      navigation: {
        ...state.navigation,
        currentStepIndex: stepIndex,
        currentStep: allSteps[stepIndex] ?? null,
        remainingDistance: remainingDist,
        remainingDuration: remainingDur,
      },
    };
  }),
  stopNavigation: () => set({ navigation: null, currentView: 'map' }),

  shift: null,
  setShift: (shift) => set({ shift }),

  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  setIsOnline: (isOnline) => set({ isOnline }),

  deferredInstallPrompt: null,
  setDeferredInstallPrompt: (deferredInstallPrompt) => set({ deferredInstallPrompt }),

  demoMode: false,
  setDemoMode: (demoMode) => set({ demoMode }),

  introOpen: introInit,
  setIntroOpen: (introOpen) => {
    try { if (!introOpen) localStorage.setItem('astrum-tech-intro-seen', '1'); } catch {}
    set({ introOpen });
  },

  themeMode: themeInit,
  setThemeMode: (themeMode) => {
    try { localStorage.setItem('astrum-tech-theme', themeMode); } catch {}
    set({ themeMode });
  },
  toggleTheme: () => set((s) => {
    const next = s.themeMode === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('astrum-tech-theme', next); } catch {}
    return { themeMode: next };
  }),

  viewMode: viewInit,
  setViewMode: (viewMode) => {
    try { localStorage.setItem('astrum-tech-viewmode', viewMode); } catch {}
    set({ viewMode });
  },
  toggleViewMode: () => set((s) => {
    const next = s.viewMode === 'desktop' ? 'mobile' : 'desktop';
    try { localStorage.setItem('astrum-tech-viewmode', next); } catch {}
    return { viewMode: next };
  }),
}));
