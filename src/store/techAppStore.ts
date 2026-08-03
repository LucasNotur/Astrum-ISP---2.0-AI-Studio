import { create } from 'zustand';
import type { FieldOs, OptimizedRouteResult } from '../lib/fieldOps';
import type { OsrmRoute, OsrmStep } from '../lib/osrm';

export type TechView =
  | 'map'
  | 'navigation'
  | 'active-os'
  | 'agenda'
  | 'my-day'
  | 'day-route'   // Rota do dia (timeline vertical de paradas) — inspirado no Citymapper/transit
  | 'day-report'; // Relatório de fim de turno — inspirado no report do Yango

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
}

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
}));
