import { describe, it, expect, beforeEach } from 'vitest';
import { useTechAppStore } from '../../store/techAppStore';
import type { OsrmRoute } from '../../lib/osrm';
import type { FieldOs } from '../../lib/fieldOps';

const mockOs: FieldOs = {
  id: 'os-1',
  title: 'Instalação — Rua A',
  checklist: [],
  client: 'João Silva',
  address: 'Rua A, 100',
  type: 'Instalação',
  status: 'pending',
  scheduledTime: '09:00',
  latitude: -22.9,
  longitude: -43.17,
};

const mockRoute: OsrmRoute = {
  distance: 5000,
  duration: 600,
  geometry: [[-22.9, -43.17], [-22.88, -43.15]],
  legs: [{
    distance: 5000,
    duration: 600,
    steps: [
      { maneuver: { type: 'depart', location: [-43.17, -22.9], bearing_before: 0, bearing_after: 90 }, name: 'Rua A', distance: 2000, duration: 240, geometry: '' },
      { maneuver: { type: 'arrive', location: [-43.15, -22.88], bearing_before: 90, bearing_after: 0 }, name: '', distance: 0, duration: 0, geometry: '' },
    ],
  }],
};

describe('techAppStore', () => {
  beforeEach(() => {
    useTechAppStore.setState({
      currentView: 'map',
      osList: [],
      activeOs: null,
      gps: null,
      navigation: null,
      shift: null,
      isOnline: true,
    });
  });

  it('sets view', () => {
    useTechAppStore.getState().setView('agenda');
    expect(useTechAppStore.getState().currentView).toBe('agenda');
  });

  it('sets OS list', () => {
    useTechAppStore.getState().setOsList([mockOs]);
    expect(useTechAppStore.getState().osList).toHaveLength(1);
    expect(useTechAppStore.getState().osList[0].client).toBe('João Silva');
  });

  it('sets active OS', () => {
    useTechAppStore.getState().setActiveOs(mockOs);
    expect(useTechAppStore.getState().activeOs?.id).toBe('os-1');
  });

  it('starts navigation and switches to navigation view', () => {
    useTechAppStore.getState().startNavigation(mockRoute, mockOs);
    const state = useTechAppStore.getState();
    expect(state.currentView).toBe('navigation');
    expect(state.navigation).not.toBeNull();
    expect(state.navigation!.isActive).toBe(true);
    expect(state.navigation!.remainingDistance).toBe(5000);
    expect(state.navigation!.destinationOs.id).toBe('os-1');
    expect(state.navigation!.currentStepIndex).toBe(0);
  });

  it('updates navigation step', () => {
    useTechAppStore.getState().startNavigation(mockRoute, mockOs);
    useTechAppStore.getState().updateNavigation(1, 1000, 120);
    const nav = useTechAppStore.getState().navigation!;
    expect(nav.currentStepIndex).toBe(1);
    expect(nav.remainingDistance).toBe(1000);
    expect(nav.remainingDuration).toBe(120);
  });

  it('stops navigation and returns to map', () => {
    useTechAppStore.getState().startNavigation(mockRoute, mockOs);
    useTechAppStore.getState().stopNavigation();
    expect(useTechAppStore.getState().navigation).toBeNull();
    expect(useTechAppStore.getState().currentView).toBe('map');
  });

  it('tracks online/offline state', () => {
    useTechAppStore.getState().setIsOnline(false);
    expect(useTechAppStore.getState().isOnline).toBe(false);
    useTechAppStore.getState().setIsOnline(true);
    expect(useTechAppStore.getState().isOnline).toBe(true);
  });

  it('manages shift data', () => {
    useTechAppStore.getState().setShift({ startedAt: '2026-08-02T09:00:00Z', odometerStart: 12345 });
    expect(useTechAppStore.getState().shift?.odometerStart).toBe(12345);
    useTechAppStore.getState().setShift(null);
    expect(useTechAppStore.getState().shift).toBeNull();
  });
});
