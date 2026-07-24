import React from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Skeleton } from '@/src/components/Skeleton';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';

// --- FadeIn wrapper ---

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export function FadeIn({ children, className, delay = 0, duration = 0.3 }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// --- Staggered list ---

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } },
};

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerList({ children, className }: StaggerListProps) {
  return (
    <motion.div variants={listVariants} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

// --- Skeleton patterns ---

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      <div className="flex gap-4 p-3 border-b border-border bg-muted/30">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-3 border-b border-border/50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-[160px]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Toast with undo ---

export function undoToast(
  message: string,
  onUndo: () => void,
  opts?: { description?: string; duration?: number },
) {
  toast(message, {
    description: opts?.description,
    duration: opts?.duration || 6000,
    action: {
      label: 'Desfazer',
      onClick: onUndo,
    },
  });
}

// --- Empty state (promoted to ui/, teaches the user) ---

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, hint, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center',
        className,
      )}
    >
      <div className="mb-4 rounded-2xl bg-muted p-4 text-muted-foreground">
        <Icon size={32} />
      </div>
      <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {hint && (
        <p className="mt-2 max-w-sm text-xs text-muted-foreground/70 italic">{hint}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

// --- Animated number ---

interface AnimatedNumberProps {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedNumber({ value, className, prefix = '', suffix = '', decimals = 0 }: AnimatedNumberProps) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      {prefix}{value.toFixed(decimals)}{suffix}
    </motion.span>
  );
}

// --- Optimistic badge (shows pending state) ---

export function OptimisticBadge({ label, pending }: { label: string; pending?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-opacity',
      pending ? 'opacity-60 border-dashed' : 'opacity-100',
    )}>
      {pending && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}
