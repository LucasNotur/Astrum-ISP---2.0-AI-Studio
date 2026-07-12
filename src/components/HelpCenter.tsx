import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, HelpCircle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { HELP_LINKS } from '@/src/lib/onboarding-steps';
import { cn } from '@/src/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  role: string;
}

export function HelpCenter({ open, onClose, role }: Props) {
  const navigate = useNavigate();
  const links = HELP_LINKS[role] ?? HELP_LINKS['support'];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed bottom-0 left-0 top-0 z-50 flex flex-col w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-4 border-b dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} className="text-primary" />
            <span className="font-semibold text-sm">Central de Ajuda</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-3">Acesso rápido</p>
          {links.map((link) => (
            <button
              key={link.path + link.label}
              onClick={() => { navigate(link.path); onClose(); }}
              className="w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group"
            >
              <span className="text-xl shrink-0">{link.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-primary transition-colors">{link.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{link.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t dark:border-zinc-800">
          <p className="text-[11px] text-zinc-400 text-center">
            Astrum ISP — Suporte: suporte@astrum.com.br
          </p>
        </div>
      </div>
    </>
  );
}
