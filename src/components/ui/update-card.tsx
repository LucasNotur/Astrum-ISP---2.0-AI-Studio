import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { GlowButton } from './glow-button';

/**
 * D-014 — card de anúncio/atualização com personagem Astrum (estilo Netflix/Prime).
 * A arte cel-shaded (Spider-Verso/What If) vive em `public/characters/*.png` e
 * entra pelo `characterSrc`, sangrando da borda direita. Sem arte, o card degrada
 * para um banner limpo com ícone. Uso: novidades de versão, anúncios de feature,
 * onboarding — NUNCA em área de trabalho densa.
 */
export function UpdateCard({
  eyebrow = 'Novidade',
  title,
  description,
  ctaLabel,
  onCta,
  onDismiss,
  characterSrc,
  characterAlt = '',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  onDismiss?: () => void;
  characterSrc?: string;
  characterAlt?: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-stable-xl border border-border bg-gradient-to-r from-card via-card to-astrum-fiber/15 shadow-2',
      className
    )}>
      <div className={cn('p-6 md:p-7', characterSrc && 'md:pr-56')}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-astrum-lemon">
          <Sparkles size={12} strokeWidth={2} />
          {eyebrow}
        </div>
        <h3 className="font-display text-xl md:text-2xl font-semibold tracking-tight mt-2">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-xl">{description}</p>
        )}
        {ctaLabel && onCta && (
          <div className="mt-5">
            <GlowButton onClick={onCta}>{ctaLabel}</GlowButton>
          </div>
        )}
      </div>

      {characterSrc && (
        <img
          src={characterSrc}
          alt={characterAlt}
          className="hidden md:block absolute right-0 bottom-0 h-full max-h-56 object-contain object-bottom pointer-events-none select-none"
        />
      )}

      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dispensar"
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors duration-fast"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
