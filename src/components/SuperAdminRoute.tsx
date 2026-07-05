import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import { useAppStore } from "../store/useAppStore.ts";

// FZ-4: super admin agora é a role 'super_admin' da tabela users (era claim
// isSuperAdmin do Firebase). A verificação de verdade acontece no backend
// (verifySupabaseToken) — aqui é apenas gate de UI.
export const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const { user } = useAppStore();

  useEffect(() => {
    let cancelled = false;
    const checkSuperAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) { if (!cancelled) setIsSuperAdmin(false); return; }
        const { data } = await supabase
          .from("users").select("role").eq("id", uid).maybeSingle();
        if (!cancelled) setIsSuperAdmin(data?.role === "super_admin");
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
