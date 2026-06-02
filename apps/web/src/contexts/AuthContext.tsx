import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

interface AuthUser {
  userId: string;
  tenantId: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer';
  email?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar sessão existente ao inicializar
  useEffect(() => {
    const session = JSON.parse(localStorage.getItem('astrum_auth') ?? 'null');
    if (session?.accessToken) {
      try {
        // Decodificar payload do JWT (sem verificar assinatura — server faz isso)
        const payload = JSON.parse(atob(session.accessToken.split('.')[1]));

        if (payload.exp * 1000 > Date.now()) {
          setUser({
            userId: payload.userId,
            tenantId: payload.tenantId,
            role: payload.role,
          });
        } else {
          localStorage.removeItem('astrum_auth');
        }
      } catch {
        localStorage.removeItem('astrum_auth');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post('/api/v2/auth/login', { email, password });

    localStorage.setItem('astrum_auth', JSON.stringify({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    }));

    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    setUser({
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/v2/auth/logout');
    } catch { /* ignorar erros de logout */ } finally {
      localStorage.removeItem('astrum_auth');
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login,
      logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
