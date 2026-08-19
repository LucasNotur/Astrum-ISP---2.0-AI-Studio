import React from 'react';
import { Calendar, LoaderCircle, CheckCircle2 } from 'lucide-react';
import { useTech } from './theme';

/**
 * StatusCard — clone fiel do card "Network devices" (Imagem 1 de referência),
 * agora theme-aware. No tema ESCURO reproduz exatamente o visual aprovado
 * (superfície cinza c/ degradê interno, barra de acento colorida à esquerda,
 * badge de status, findings). No tema CLARO usa o equivalente sobre superfície
 * clara, lendo os tokens `tech.*` do design system Astrum.
 */

export type CardStatus = 'scheduled' | 'in_progress' | 'completed';

export interface Finding {
  value: string;
  /** cor de preenchimento do círculo */
  color: string;
}

export interface StatusCardProps {
  icon: React.ReactNode;
  /** cor do ícone (glyph) */
  iconColor: string;
  title: string;
  subtitle?: string;
  status?: CardStatus;
  /** cor da barra de acento à esquerda; default derivado do status */
  accent?: string;
  findings?: Finding[];
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Metadados de badge por status — variante escura (aprovada) e clara. */
const BADGE_DARK: Record<CardStatus, { label: string; bg: string; border: string; color: string }> = {
  scheduled:   { label: 'Scheduled',   bg: 'rgba(61,90,254,0.16)',  border: 'rgba(61,90,254,0.34)',  color: '#8aa0ff' },
  in_progress: { label: 'In progress', bg: 'rgba(255,255,255,0.055)', border: 'rgba(255,255,255,0.10)', color: '#a9a9b0' },
  completed:   { label: 'Completed',   bg: 'rgba(0,194,168,0.15)',  border: 'rgba(0,194,168,0.32)',  color: '#22d3b7' },
};
const BADGE_LIGHT: Record<CardStatus, { label: string; bg: string; border: string; color: string }> = {
  scheduled:   { label: 'Scheduled',   bg: 'rgba(61,90,254,0.10)', border: 'rgba(61,90,254,0.28)', color: '#2e4be0' },
  in_progress: { label: 'In progress', bg: 'rgba(0,0,0,0.05)',      border: 'rgba(0,0,0,0.10)',     color: '#52525b' },
  completed:   { label: 'Completed',   bg: 'rgba(5,159,137,0.12)',  border: 'rgba(5,159,137,0.30)', color: '#059f89' },
};

const STATUS_ICON: Record<CardStatus, { icon: React.ReactNode; spin?: boolean }> = {
  scheduled:   { icon: <Calendar size={13} strokeWidth={2.4} /> },
  in_progress: { icon: <LoaderCircle size={13} strokeWidth={2.4} />, spin: true },
  completed:   { icon: <CheckCircle2 size={13} strokeWidth={2.4} /> },
};

const ACCENT_BY_STATUS: Record<CardStatus, string> = {
  scheduled: '#0075F2',
  in_progress: '#4d9bff',
  completed: '#8BD164',
};

function dotGrid(isDark: boolean): React.CSSProperties {
  const c = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
  return {
    backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1px)`,
    backgroundSize: '22px 22px',
    backgroundPosition: '-1px -1px',
  };
}

/** Superfície cinza (dark, aprovada) vs. clara (light). */
function cardSurface(isDark: boolean): string {
  return isDark
    ? 'linear-gradient(155deg, #27272d 0%, #201f25 55%, #191920 100%)'
    : 'linear-gradient(155deg, #ffffff 0%, #f7f8fa 55%, #f1f2f6 100%)';
}

export function StatusBadge({ status }: { status: CardStatus }) {
  const t = useTech();
  const m = (t.isDark ? BADGE_DARK : BADGE_LIGHT)[status];
  const si = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 flex-shrink-0"
      style={{
        background: m.bg,
        border: `1px solid ${m.border}`,
        color: m.color,
        borderRadius: 999,
        padding: '5px 11px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={si.spin ? { animation: 'astrum-spin 1s linear infinite', display: 'inline-flex' } : { display: 'inline-flex' }}>
        {si.icon}
      </span>
      {m.label}
    </span>
  );
}

export function StatusCard({
  icon, iconColor, title, subtitle, status, accent, findings, onClick, className, style,
}: StatusCardProps) {
  const t = useTech();
  const accentColor = accent ?? (status ? ACCENT_BY_STATUS[status] : t.accent);
  const Wrapper: any = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        textAlign: 'left',
        display: 'block',
        borderRadius: 18,
        padding: '18px 20px 18px 22px',
        background: cardSurface(t.isDark),
        border: `1px solid ${t.isDark ? 'rgba(255,255,255,0.09)' : t.border}`,
        boxShadow: t.isDark
          ? '0 1px 0 rgba(255,255,255,0.045) inset, 0 10px 26px -16px rgba(0,0,0,0.9)'
          : '0 1px 2px rgba(16,18,26,0.04), 0 8px 20px -16px rgba(16,18,26,0.18)',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {/* textura de grade pontilhada */}
      <span aria-hidden style={{ position: 'absolute', inset: 0, ...dotGrid(t.isDark), opacity: 0.8, pointerEvents: 'none' }} />
      {/* barra de acento à esquerda */}
      <span
        aria-hidden
        style={{
          position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
          borderRadius: '0 4px 4px 0',
          background: accentColor,
          boxShadow: `0 0 8px ${accentColor}2e`,
        }}
      />

      <div style={{ position: 'relative' }}>
        {/* linha 1 — ícone + título ......... badge */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span style={{ color: iconColor, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
            <span style={{ color: t.text, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }} className="truncate">
              {title}
            </span>
          </div>
          {status && <StatusBadge status={status} />}
        </div>

        {/* linha 2 — subtítulo ou findings */}
        {findings && findings.length > 0 ? (
          <div className="flex items-center gap-2 mt-3">
            <span style={{ color: t.textSecondary, fontSize: 15 }}>Findings:</span>
            <div className="flex items-center gap-1.5">
              {findings.map((f, i) => (
                <span
                  key={i}
                  style={{
                    minWidth: 26, height: 26, padding: '0 7px',
                    borderRadius: 999, background: f.color, color: '#fff',
                    fontSize: 13, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {f.value}
                </span>
              ))}
            </div>
          </div>
        ) : subtitle ? (
          <p style={{ color: t.textSecondary, fontSize: 15, marginTop: 8 }} className="truncate">{subtitle}</p>
        ) : null}
      </div>
    </Wrapper>
  );
}

/**
 * HeroStatusCard — variante "flutuante" em destaque: borda de vidro fina em
 * degradê (azul-lavanda→roxo→rosado, sutil, sem neon) + sombra real, exibindo
 * skeleton lines (estado de template do mockup). Otimizada para o tema escuro.
 */
export function HeroStatusCard({
  icon, iconColor, title, status = 'scheduled', trailing,
}: {
  icon: React.ReactNode; iconColor: string; title: string; status?: CardStatus; trailing?: string;
}) {
  const t = useTech();
  return (
    <div
      style={{
        borderRadius: 24,
        padding: 1,
        background:
          'linear-gradient(208deg, rgba(160,178,246,0.80) 0%, rgba(150,122,222,0.46) 46%, rgba(214,142,188,0.60) 100%)',
        boxShadow:
          '0 22px 55px -22px rgba(0,0,0,0.85), 0 4px 14px -8px rgba(0,0,0,0.6), 0 0 30px -18px rgba(150,112,200,0.30)',
      }}
    >
      <div
        style={{
          position: 'relative',
          borderRadius: 23,
          padding: '20px 22px',
          background: cardSurface(t.isDark),
          overflow: 'hidden',
        }}
      >
        <span aria-hidden style={{ position: 'absolute', inset: 0, ...dotGrid(t.isDark), opacity: 0.7, pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          {/* topo: ícone + título ....... skeleton pill */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span style={{ color: iconColor, display: 'inline-flex' }}>{icon}</span>
              <span style={{ color: t.text, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</span>
            </div>
            <Skel w={44} h={12} dark={t.isDark} />
          </div>

          {/* skeleton lines */}
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skel w="62%" h={11} dark={t.isDark} />
              <Skel w={34} h={11} dark={t.isDark} />
            </div>
            <Skel w="82%" h={11} dark={t.isDark} />
            <Skel w="48%" h={11} dark={t.isDark} />
          </div>

          {/* rodapé: badge + trailing */}
          <div className="flex items-center justify-between mt-5">
            <StatusBadge status={status} />
            {trailing && <span style={{ color: t.textSecondary, fontSize: 14, fontWeight: 500 }}>{trailing}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Skel({ w, h, dark }: { w: number | string; h: number; dark: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block', width: w as any, height: h,
        borderRadius: 999,
        background: dark
          ? 'linear-gradient(90deg, #2a2a2e 0%, #303036 50%, #2a2a2e 100%)'
          : 'linear-gradient(90deg, #e6e8ec 0%, #eef0f3 50%, #e6e8ec 100%)',
      }}
    />
  );
}
