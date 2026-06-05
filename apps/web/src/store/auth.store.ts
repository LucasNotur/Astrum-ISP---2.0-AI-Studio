import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/**
 * Auth Store — Zustand
 *
 * BLOCO 8 — State Management Global
 * Substitui o AuthContext do React (Context API tem re-renders excessivos)
 *
 * VANTAGENS do Zustand vs Context:
 * - Sem Provider hell no App.tsx
 * - Subscriptions granulares (componente só re-renderiza se SEU slice mudou)
 * - Middleware persist: auth sobrevive ao F5
 * - Immer: mutations seguras sem spread desnecessário
 */

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  tenantId: string;
  tenantName: string;
  plan: 'starter' | 'pro' | 'enterprise';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateToken: (accessToken: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer((set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: (user, accessToken, refreshToken) => set((state) => {
        state.user = user as any;
        state.accessToken = accessToken;
        state.refreshToken = refreshToken;
        state.isAuthenticated = true;
      }),

      logout: () => set((state) => {
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
      }),

      updateToken: (accessToken) => set((state) => {
        state.accessToken = accessToken;
      }),

      setLoading: (loading) => set((state) => {
        state.isLoading = loading;
      }),
    })),
    {
      name: 'astrum_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
