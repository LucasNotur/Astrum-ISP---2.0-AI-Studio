import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/src/lib/utils';

/**
 * D-012 — linguagem "spotlight" (réplica do print de referência #6):
 * contraste cinematográfico preto↔branco. O momento-herói da tela é um card
 * BRANCO sobre fundo quase preto; o resto respira em hairlines e tipografia.
 * Padrão global — usar em detalhe de cliente/OS, app do técnico, resumos.
 */

/** Faixa horizontal de miniaturas arredondadas (topo do print). */
export function ThumbStrip({
  images,
  activeIndex = 0,
  onSelect,
  className,
}: {
  images: { src: string; alt?: string }[];
  activeIndex?: number;
  onSelect?: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto no-scrollbar py-1', className)}>
      {images.map((img, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect?.(i)}
          className={cn(
            'shrink-0 overflow-hidden rounded-stable-sm border transition-all duration-base',
            i === activeIndex
              ? 'h-20 w-16 border-foreground/25 scale-100'
              : 'h-14 w-12 self-center border-transparent opacity-70 hover:opacity-100'
          )}
        >
          <img src={img.src} alt={img.alt ?? ''} className="h-full w-full object-cover" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

/** Card-herói branco com mídia à esquerda, título, subtítulo e faixa de stats. */
export function SpotlightCard({
  image,
  imageBadge,
  title,
  subtitle,
  avatars,
  stats,
  onClick,
  className,
}: {
  image?: string;
  /** Selo sobre a imagem (ex.: temperatura, status do link). */
  imageBadge?: React.ReactNode;
  title: string;
  subtitle?: string;
  avatars?: { src?: string; fallback: string }[];
  stats?: { icon?: React.ReactNode; label: React.ReactNode }[];
  onClick?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      onClick={onClick}
      initial={reduce ? undefined : { opacity: 0, y: 14 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
      className={cn(
        'overflow-hidden rounded-stable-xl bg-primary text-primary-foreground shadow-4',
        onClick && 'cursor-pointer',
        className
      )}
    >
      <div className="flex gap-0">
        {image && (
          <div className="relative w-2/5 min-h-[132px] shrink-0 p-2">
            <img src={image} alt="" className="h-full w-full object-cover rounded-stable-lg" loading="lazy" />
            {imageBadge && (
              <span className="absolute bottom-4 left-4 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white backdrop-blur-sm">
                {imageBadge}
              </span>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 p-4 flex flex-col">
          <h3 className="font-display text-lg font-semibold leading-tight truncate">{title}</h3>
          {subtitle && <p className="text-sm opacity-60 mt-0.5 truncate">{subtitle}</p>}
          {avatars && avatars.length > 0 && (
            <div className="flex -space-x-2 mt-2.5">
              {avatars.slice(0, 5).map((a, i) => (
                <span key={i} className="h-7 w-7 rounded-full ring-2 ring-primary overflow-hidden bg-black/10 flex items-center justify-center text-[10px] font-semibold">
                  {a.src ? <img src={a.src} alt="" className="h-full w-full object-cover" /> : a.fallback}
                </span>
              ))}
            </div>
          )}
          {stats && stats.length > 0 && (
            <div className="mt-auto pt-3 flex items-center rounded-stable-lg bg-black/[0.06] divide-x divide-black/10">
              {stats.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium min-w-0">
                  {s.icon}
                  <span className="truncate">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Linhas chave-valor com hairline: label muted à esquerda, valor forte à direita. */
export function KeyValueList({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode }[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('w-full', className)}>
      {items.map((it, i) => (
        <motion.div
          key={i}
          className="flex items-center justify-between gap-4 py-3.5 border-b border-border last:border-0"
          initial={reduce ? undefined : { opacity: 0, y: 8 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.28, ease: [0.2, 0, 0, 1] }}
        >
          <span className="text-sm text-muted-foreground">{it.label}</span>
          <span className="text-sm font-semibold text-right">{it.value}</span>
        </motion.div>
      ))}
    </div>
  );
}

/** Dica/observação com barra vertical à esquerda (padrão do print). */
export function TipCallout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3', className)}>
      <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-foreground/70" />
      <p className="text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground [&_strong]:font-semibold">
        {children}
      </p>
    </div>
  );
}

/** Timeline numerada com conector vertical e cards escuros. */
export function NumberedTimeline({
  items,
  className,
}: {
  items: {
    title: string;
    subtitle?: string;
    image?: string;
    avatars?: { src?: string; fallback: string }[];
    onClick?: () => void;
  }[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('relative', className)}>
      {items.map((it, i) => (
        <motion.div
          key={i}
          className="relative flex gap-3 pb-3 last:pb-0"
          initial={reduce ? undefined : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: i * 0.07, duration: 0.3, ease: [0.2, 0, 0, 1] }}
        >
          <div className="flex flex-col items-center shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card font-mono text-xs font-semibold">
              {i + 1}
            </span>
            {i < items.length - 1 && <span aria-hidden className="w-px flex-1 bg-border mt-1" />}
          </div>
          <button
            type="button"
            onClick={it.onClick}
            className="flex-1 min-w-0 text-left flex gap-3 items-center rounded-stable-lg bg-card border border-border p-2 hover:bg-foreground/[0.04] transition-colors duration-fast"
          >
            {it.image && (
              <img src={it.image} alt="" className="h-14 w-16 shrink-0 rounded-stable-sm object-cover" loading="lazy" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{it.title}</div>
              {it.subtitle && <div className="text-xs text-muted-foreground truncate mt-0.5">{it.subtitle}</div>}
              {it.avatars && it.avatars.length > 0 && (
                <div className="flex -space-x-2 mt-1.5">
                  {it.avatars.slice(0, 4).map((a, k) => (
                    <span key={k} className="h-6 w-6 rounded-full ring-2 ring-card overflow-hidden bg-secondary flex items-center justify-center text-[9px] font-semibold">
                      {a.src ? <img src={a.src} alt="" className="h-full w-full object-cover" /> : a.fallback}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        </motion.div>
      ))}
    </div>
  );
}

/** CTA flutuante em pill branco, ancorado ao rodapé da área de conteúdo. */
export function FloatingPill({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduce ? undefined : { opacity: 0, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 26 }}
      className={cn(
        'sticky bottom-4 mx-auto flex items-center gap-2 rounded-full bg-primary text-primary-foreground',
        'px-7 py-3.5 text-sm font-semibold shadow-4 backdrop-blur transition-transform duration-fast active:scale-[0.98]',
        className
      )}
    >
      {children}
    </motion.button>
  );
}
