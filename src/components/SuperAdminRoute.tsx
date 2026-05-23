import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "../lib/firebase.ts";
import { useAppStore } from "../store/useAppStore.ts";

export const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const { user } = useAppStore();

  useEffect(() => {
    const checkSuperAdmin = async () => {
      if (user) {
        try {
          const tokenResult = await auth.currentUser?.getIdTokenResult();
          setIsSuperAdmin(!!tokenResult?.claims?.isSuperAdmin);
        } catch (error) {
          console.error("Error fetching token result:", error);
          setIsSuperAdmin(false);
        }
      } else {
        setIsSuperAdmin(false);
      }
    };
    
    // We need to wait for Firebase auth to be ready
    if (auth.currentUser) {
        checkSuperAdmin();
    } else {
        const unsubscribe = auth.onAuthStateChanged((currUser) => {
            if (currUser) {
                checkSuperAdmin();
            } else {
                setIsSuperAdmin(false);
            }
        });
        return () => unsubscribe();
    }
  }, [user]);

  if (isSuperAdmin === null) {
    return <div className="flex h-screen items-center justify-center">Verificando permissões...</div>;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
