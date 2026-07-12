import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEnabledModules } from './useEnabledModules';
import { useAppStore } from '@/src/store/useAppStore';

beforeEach(() => {
  useAppStore.setState({ enabledModules: {} });
});

describe('useEnabledModules', () => {
  it('returns true for any key when enabledModules is empty (default enabled)', () => {
    const { result } = renderHook(() => useEnabledModules());
    expect(result.current.isEnabled('tickets')).toBe(true);
    expect(result.current.isEnabled('cobrai')).toBe(true);
    expect(result.current.isEnabled('nonexistent')).toBe(true);
  });

  it('returns false when a module is explicitly set to false', () => {
    act(() => useAppStore.getState().setEnabledModules({ cobrai: false, bi: false }));
    const { result } = renderHook(() => useEnabledModules());
    expect(result.current.isEnabled('cobrai')).toBe(false);
    expect(result.current.isEnabled('bi')).toBe(false);
  });

  it('returns true for modules not mentioned even when others are disabled', () => {
    act(() => useAppStore.getState().setEnabledModules({ cobrai: false }));
    const { result } = renderHook(() => useEnabledModules());
    expect(result.current.isEnabled('tickets')).toBe(true);
  });

  it('returns true when a module is explicitly set to true', () => {
    act(() => useAppStore.getState().setEnabledModules({ cobrai: true }));
    const { result } = renderHook(() => useEnabledModules());
    expect(result.current.isEnabled('cobrai')).toBe(true);
  });

  it('reacts to store updates', () => {
    const { result } = renderHook(() => useEnabledModules());
    expect(result.current.isEnabled('monitoring')).toBe(true);
    act(() => useAppStore.getState().setEnabledModules({ monitoring: false }));
    expect(result.current.isEnabled('monitoring')).toBe(false);
  });
});
