import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility para combinar classes Tailwind sem conflitos.
 * cn('px-2 py-1', condition && 'bg-red-500', 'px-4')
 * → 'py-1 bg-red-500 px-4' (px-4 vence o px-2)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formata centavos para BRL */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/** Formata data ISO para pt-BR */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso));
}

/** Badge de status de ticket */
export function ticketStatusColor(status: string): string {
  return {
    open:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
    in_progress: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    resolved:    'bg-brand-500/10 text-brand-400 border-brand-500/20',
    closed:      'bg-gray-500/10 text-gray-400 border-gray-500/20',
  }[status] ?? 'bg-gray-500/10 text-gray-400';
}

/** Badge de prioridade */
export function priorityColor(priority: string): string {
  return {
    urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
    high:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    low:    'bg-gray-500/10 text-gray-400 border-gray-500/20',
  }[priority] ?? 'bg-gray-500/10 text-gray-400';
}
