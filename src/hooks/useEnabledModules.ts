import { useAppStore } from '@/src/store/useAppStore';

/**
 * Returns whether a module key is enabled for the current tenant.
 * Default: enabled (absence of key in enabledModules = true).
 */
export function useEnabledModules() {
  const { enabledModules } = useAppStore();
  return {
    isEnabled: (key: string): boolean => enabledModules[key] !== false,
  };
}
