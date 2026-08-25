import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore.ts";
import { apiGet } from "../lib/apiClient.ts";

// F1-D — checava super_admin com `supabase.from('users').select('role')` direto
// (client anônimo, bloqueado pela migration 092) — o guard bloqueava TODO mundo,
// inclusive super admins reais. Role agora vem do JWT do apps/api (GET
// /api/v2/auth/me). A verificação de verdade continua sendo do backend; aqui é
// só gate de UI.
export const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const { user } = useAppStore();

  useEffect(() => {
    let cancelled = false;
    const checkSuperAdmin = async () => {
      try {
        const { role } = await apiGet<{ role: string | null }>('/api/v2/auth/me');
        if (!cancelled) setIsSuperAdmin(role === "super_admin");
      } catch (error) {
        console.error("Error checking super admin role:", error);
        if (!cancelled) setIsSuperAdmin(false);
      }
    };
    checkSuperAdmin();
    return () => { cancelled = true; };
  }, [user]);

  if (isSuperAdmin === null) {
    return <div className="flex h-screen items-center justify-center">Verificando permissões...</div>;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
