import React from 'react';
import { cn } from '@/src/lib/utils';

/**
 * D-020 — tratamento de imagem da Astrum.
 *
 * Resolve o problema de "imagem de banco não parece do produto": qualquer foto,
 * venha de onde vier, passa por um tratamento em CSS e sai falando a paleta.
 * Nada de editar arquivo — o tratamento é runtime, então trocar a paleta troca
 * todas as imagens do produto de uma vez.
 *
 * - `duotone`: duotone real (sombras na cor escura, luzes na cor de accent).
 *   O tratamento de marca — usar em capas, heros e cards de catálogo.
 * - `tint`: mantém as cores originais e joga um véu da cor por cima.
 *   Para foto que precisa continuar reconhecível (equipamento, print de tela).
 * - `dim`: só escurece, para texto ficar legível por cima.
 * - `none`: sem tratamento.
 */

export type ImageTreatment = 'duotone' | 'tint' | 'dim' | 'none';

const SHADOW = '#0A0A0B'; // igual ao --background do dark

export function TreatedImage({
  src,
  alt = '',
  treatment = 'duotone',
  /** Cor das luzes no duotone / do véu no tint. Padrão: fiber. */
  accent = 'var(--color-astrum-fiber)',
  /** Intensidade do tratamento (0–1). */
  strength = 1,
  /** Cor de fundo quando não há imagem — evita buraco na UI. */
  fallbackTint,
  className,
  imgClassName,
}: {
  src?: string;
  alt?: string;
  treatment?: ImageTreatment;
  accent?: string;
  strength?: number;
  fallbackTint?: string;
  className?: string;
  imgClassName?: string;
}) {
  // Sem imagem: superfície tintada, nunca <img> quebrada.
  if (!src) {
    return (
      <div
        aria-hidden
        className={cn('h-full w-full', className)}
        style={{
          background: fallbackTint
            ? `linear-gradient(145deg, color-mix(in srgb, ${fallbackTint} 45%, ${SHADOW}) 0%, ${SHADOW} 100%)`
            : 'hsl(var(--secondary))',
        }}
      />
    );
  }

  if (treatment === 'none') {
    return <img src={src} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', className, imgClassName)} />;
  }

  if (treatment === 'dim') {
    return (
      <div className={cn('relative h-full w-full overflow-hidden', className)}>
        <img src={src} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', imgClassName)} />
        <div aria-hidden className="absolute inset-0" style={{ background: SHADOW, opacity: 0.45 * strength }} />
      </div>
    );
  }

  if (treatment === 'tint') {
    return (
      <div className={cn('relative h-full w-full overflow-hidden', className)}>
        <img src={src} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', imgClassName)} />
        <div
          aria-hidden
          className="absolute inset-0 mix-blend-color"
          style={{ background: accent, opacity: 0.55 * strength }}
        />
      </div>
    );
  }

  // duotone: sombras -> SHADOW, luzes -> accent.
  // camada 1 (fundo) = accent | imagem em cinza com multiply | camada 3 = sombra com lighten
  return (
    <div
      className={cn('relative h-full w-full overflow-hidden isolate', className)}
      style={{ background: accent }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn('h-full w-full object-cover mix-blend-multiply', imgClassName)}
        style={{ filter: `grayscale(1) contrast(${1 + 0.15 * strength})` }}
      />
      <div aria-hidden className="absolute inset-0 mix-blend-lighten" style={{ background: SHADOW }} />
      {/* devolve um respiro da imagem original para não ficar chapado demais */}
      {strength < 1 && (
        <img
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          className={cn('absolute inset-0 h-full w-full object-cover', imgClassName)}
          style={{ opacity: 1 - strength }}
        />
      )}
    </div>
  );
}
