import React from 'react';

/**
 * Set de ícones bespoke do app do técnico — réplica 1:1 do icon sheet do case
 * "Navigator" (dprofile.ru/case/30156, "Иконки"): geométricos, cantos/pontas
 * arredondadas, traço grosso (outline) ou sólido conforme o original. Substitui
 * o lucide-react nas telas de mapa/navegação/barra inferior pra fidelidade total.
 *
 * Convenção: viewBox 24×24, `size` (px), `color` (currentColor por padrão).
 */
export interface IconProps { size?: number; color?: string; className?: string; style?: React.CSSProperties; strokeWidth?: number }

function Svg({ size = 22, color = 'currentColor', className, style, strokeWidth = 2, children, fill = 'none' }:
  IconProps & { children: React.ReactNode; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? color : 'none'}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      {children}
    </svg>
  );
}

/** Navegar/Send — seta sólida tipo "papel de avião" do case (arredondada). */
export const IcSend = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <path d="M21.3 3.1a1 1 0 0 1 .5 1.2l-6.1 16.2c-.3.9-1.6.9-2 .1l-3-6.2-6.2-3c-.8-.4-.8-1.6.1-2L20.1 3.3a1 1 0 0 1 1.2-.2Z" />
  </Svg>
);

/** Busca — lupa. */
export const IcSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.2 16.2 20.5 20.5" />
  </Svg>
);

/** Raio (CTO/energia) — sólido. */
export const IcBolt = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <path d="M13 2.5 4.7 13.4c-.4.5 0 1.2.6 1.2H9l-1 6.6c-.1.8.9 1.2 1.4.5l8.4-11c.4-.5 0-1.2-.6-1.2H12.9l1-6.4c.1-.8-.9-1.2-1.4-.6Z" />
  </Svg>
);

/** Localizar — alvo/crosshair. */
export const IcTarget = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.4" />
    <path d="M12 2.2V5M12 19v2.8M2.2 12H5M19 12h2.8" />
  </Svg>
);

/** Camadas — pilha de losangos. */
export const IcLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 21 8l-9 5-9-5 9-5Z" />
    <path d="M3.4 12 12 17l8.6-5" />
    <path d="M3.4 16 12 21l8.6-5" />
  </Svg>
);

/** Grid de apps (Ajustes/menu) — 4 quadrados arredondados. */
export const IcGrid = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </Svg>
);

export const IcPlus = (p: IconProps) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>);
export const IcMinus = (p: IconProps) => (<Svg {...p}><path d="M5 12h14" /></Svg>);
export const IcClose = (p: IconProps) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>);
export const IcChevronUp = (p: IconProps) => (<Svg {...p}><path d="M6 15l6-6 6 6" /></Svg>);
export const IcChevronDown = (p: IconProps) => (<Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>);

/** Estrela — sólida. */
export const IcStar = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.9l-5.8 3-1.1-6.45-4.7-4.6 6.5-.95L12 2.5Z" />
  </Svg>
);

/** Rota — nós conectados (Jornada). */
export const IcRoute = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="18" cy="6" r="2.4" />
    <path d="M8.2 16.4C12 13 12.5 11 15.9 7.7" />
    <path d="M12 5H8.5A3.5 3.5 0 0 0 5 8.5" opacity="0" />
  </Svg>
);

/** Pino de local — teardrop com furo. */
export const IcPin = (p: IconProps) => (
  <Svg {...p} fill={p.color ?? 'currentColor'}>
    <path d="M12 2.4a7 7 0 0 0-7 7c0 4.7 5.6 11 6.3 11.8.4.4 1 .4 1.4 0C13.4 20.4 19 14.1 19 9.4a7 7 0 0 0-7-7Zm0 9.4a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8Z" />
  </Svg>
);

/** Relógio. */
export const IcClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.4" /><path d="M12 7.5V12l3 1.8" /></Svg>
);

/** Combustível — bomba. */
export const IcFuel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21h9V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16Z" />
    <path d="M4 11h9" />
    <path d="M16 8l2.2 2.2c.5.5.8 1.1.8 1.8v5a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.5L18.5 6" />
  </Svg>
);

/** Carro (frota) — vista lateral simples. */
export const IcCar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13l1.8-4.5A2 2 0 0 1 6.7 7h10.6a2 2 0 0 1 1.9 1.5L21 13v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
    <path d="M3.5 13h17" />
    <circle cx="7.5" cy="16.5" r="1.2" fill={p.color ?? 'currentColor'} stroke="none" />
    <circle cx="16.5" cy="16.5" r="1.2" fill={p.color ?? 'currentColor'} stroke="none" />
  </Svg>
);

/** Chave inglesa — tipo de serviço. */
export const IcWrench = (p: IconProps) => (
  <Svg {...p}><path d="M14.5 6.5a3.8 3.8 0 0 1-4.9 4.9L5 16l3 3 4.6-4.6a3.8 3.8 0 0 1 4.9-4.9l-2.4 2.4-2-2 2.4-2.4Z" /></Svg>
);
/** Telefone. */
export const IcPhone = (p: IconProps) => (
  <Svg {...p}><path d="M6.5 3.5 9 4l1 3.5-1.8 1.4a11 11 0 0 0 5 5L14.5 15l3.5 1 .5 2.5a1.5 1.5 0 0 1-1.6 1.7A14.5 14.5 0 0 1 3.8 6.1 1.5 1.5 0 0 1 5.5 4.5Z" /></Svg>
);

// ─── Barra inferior ──────────────────────────────────────────────────────────
export const IcHome = (p: IconProps) => (
  <Svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /></Svg>
);
export const IcClients = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5M20.5 20a5 5 0 0 0-4-4.9" /></Svg>
);
export const IcMap = (p: IconProps) => (
  <Svg {...p}><path d="M9 4 3.5 6.2V20L9 17.8l6 2.2 5.5-2.2V4L15 6.2 9 4Z" /><path d="M9 4v13.8M15 6.2V20" /></Svg>
);
export const IcUser = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Svg>
);
