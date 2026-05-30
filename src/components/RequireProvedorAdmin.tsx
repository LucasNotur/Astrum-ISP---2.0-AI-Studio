import React from 'react';
import { Lock } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface RequireProvedorAdminProps {
  children: React.ReactNode;
}

export function RequireProvedorAdmin({ children }: RequireProvedorAdminProps) {
  const { currentUserRole } = useAppStore();

  const isProvedorAdmin = currentUserRole === 'admin' || currentUserRole === 'owner';

  if (!isProvedorAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-8 text-center bg-zinc-950 rounded-xl border border-zinc-800">
        <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-50 mb-3 tracking-tight">
          Erro 403 - Acesso Restrito
        </h2>
        <p className="text-zinc-400 max-w-md text-sm md:text-base leading-relaxed">
          Acesso Negado: Apenas o administrador da conta (Provedor admin) possui credenciais para visualizar e alterar os dados de faturamento e assinatura.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
