import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';

/**
 * D-018 — linguagem de catálogo (Netflix/Prime/game launcher): a ARTE conduz a
 * navegação. Hero com imagem grande + trilho de capas + grade de marcas.
 * Usar em: novidades/changelog, base de conhecimento, planos, integrações,
 * onboarding. NUNCA em área de trabalho densa (tabela, formulário).
 */

export interface MediaItem {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  /** Cor de fundo quando não há arte (fallback elegante, sem imagem quebrada). */
  tint?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}

/** Card de capa — proporção de pôster, título sobre gradiente de leitura. */
export function MediaCard({
  item,
  aspect = 'poster',
  className,
}: {
  item: MediaItem;
  aspect?: 'poster' | 'wide' | 'square';
  className?: string;
}) {
  const ratio = aspect === 'poster' ? 'aspect-[3/4]' : aspect === 'wide' ? 'aspect-video' : 'aspect-square';
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-stable-lg border border-border text-left',
        'transition-transform duration-base hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ratio, className
      )}
      style={item.image ? undefined : { background: item.tint ?? 'hsl(var(--secondary))' }}
    >
      {item.image && (
        <img src={item.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* gradiente de leitura sobre a arte */}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      {item.badge && (
        <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {item.badge}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span className="block font-semibold text-sm text-white leading-tight line-clamp-2">{item.title}</span>
        {item.subtitle && <span className="block text-[11px] text-white/70 mt-0.5 truncate">{item.subtitle}</span>}
      </span>
    </button>
  );
}

/** Trilho horizontal com cabeçalho de seção (padrão "Most Popular"). */
export function MediaRail({
  title,
  action,
  items,
  aspect = 'poster',
  cardWidth = 'w-[150px]',
  className,
}: {
  title: React.ReactNode;
  action?: { label: string; onClick: () => void };
  items: MediaItem[];
  aspect?: 'poster' | 'wide' | 'square';
  cardWidth?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            {action.label} <ChevronRight size={13} />
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {items.map((it, i) => (
          <motion.div
            key={it.id}
            initial={reduce ? undefined : { opacity: 0, x: 24 }}
            animate={reduce ? undefined : { opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.32, ease: [0.2, 0, 0, 1] }}
            className="shrink-0"
          >
            <MediaCard item={it} aspect={aspect} className={cardWidth} />
          </motion.div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground py-6">Nada por aqui ainda.</p>
        )}
      </div>
    </section>
  );
}

/** Hero de catálogo: arte grande, título/logo, meta e CTA em pill. */
export function MediaHero({
  image,
  tint,
  eyebrow,
  title,
  description,
  meta,
  cta,
  className,
}: {
  image?: string;
  tint?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode[];
  cta?: { label: string; onClick: () => void };
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? undefined : { opacity: 0, scale: 0.99 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
      className={cn('relative overflow-hidden rounded-stable-xl border border-border min-h-[280px] flex', className)}
      style={image ? undefined : { background: tint ?? 'hsl(var(--secondary))' }}
    >
      {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-transparent" />
      <div className="relative z-10 p-6 md:p-8 max-w-xl flex flex-col justify-end">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-wider text-astrum-lemon mb-2">{eyebrow}</div>
        )}
        <h2 className="font-display text-2xl md:text-4xl font-semibold tracking-tight text-white leading-[1.1]">{title}</h2>
        {description && <p className="text-sm text-white/70 mt-3 leading-relaxed line-clamp-3">{description}</p>}
        {meta && meta.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {meta.map((m, i) => (
              <span key={i} className="rounded-md bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                {m}
              </span>
            ))}
          </div>
        )}
        {cta && (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-5 w-fit rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold shadow-3 transition-transform duration-fast active:scale-[0.98]"
          >
            {cta.label}
          </button>
        )}
      </div>
    </motion.section>
  );
}

/** Grade de tiles de marca/integração (referência: grade de apps de streaming). */
export function BrandGrid({
  items,
  className,
}: {
  items: { id: string; label: string; logo?: string; tint?: string; onClick?: () => void }[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3', className)}>
      {items.map((it, i) => (
        <motion.button
          key={it.id}
          type="button"
          onClick={it.onClick}
          initial={reduce ? undefined : { opacity: 0, y: 10 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.28, ease: [0.2, 0, 0, 1] }}
          className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-stable-lg border border-border transition-transform duration-base hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ background: it.tint ?? 'hsl(var(--card))' }}
        >
          {it.logo
            ? <img src={it.logo} alt={it.label} className="max-h-8 max-w-[70%] object-contain" loading="lazy" />
            : <span className="font-display font-semibold text-sm text-center px-2 line-clamp-2">{it.label}</span>}
        </motion.button>
      ))}
    </div>
  );
}
