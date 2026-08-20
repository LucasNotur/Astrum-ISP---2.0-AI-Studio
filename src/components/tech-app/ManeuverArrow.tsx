import React from 'react';

/**
 * Seta de manobra — clone das setas de navegação do case "Navigator"
 * (dprofile.ru/case/30156): traço azul, grosso, pontas arredondadas, sobre
 * fundo escuro. Substitui os emojis (↗ 🚗 🏁) por SVG nítido e consistente.
 */
type ManeuverKey =
  | 'straight' | 'slight-right' | 'slight-left'
  | 'right' | 'left' | 'sharp-right' | 'sharp-left'
  | 'uturn' | 'arrive' | 'depart' | 'roundabout' | 'merge';

const PATHS: Record<ManeuverKey, string> = {
  // seta reta pra cima
  straight: 'M12 21 V6 M6.5 11.5 L12 5.5 L17.5 11.5',
  depart: 'M12 21 V6 M6.5 11.5 L12 5.5 L17.5 11.5',
  merge: 'M8 21 V13 C8 9 12 8 16 8 M11 5 L16.5 8 L11 11',
  // sobe e vira à direita
  right: 'M8 21 V12 C8 9.2 9.5 8 12 8 H16.5 M13 4 L18.5 8 L13 12',
  'slight-right': 'M9 21 V14 L16.5 6.5 M12 6 H17 V11',
  'sharp-right': 'M8 21 V15 C8 11 11 10.5 14.5 12.5 L17 14 M14.5 7.5 L18 13.5 L11.5 14',
  // espelhos à esquerda
  left: 'M16 21 V12 C16 9.2 14.5 8 12 8 H7.5 M11 4 L5.5 8 L11 12',
  'slight-left': 'M15 21 V14 L7.5 6.5 M12 6 H7 V11',
  'sharp-left': 'M16 21 V15 C16 11 13 10.5 9.5 12.5 L7 14 M9.5 7.5 L6 13.5 L12.5 14',
  // retorno em U
  uturn: 'M8 21 V12 A4 4 0 0 1 16 12 V15 M12.5 12 L16 15.5 L19.5 12',
  // rotatória
  roundabout: 'M12 21 V15 M12 15 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M16 7 L16 11 L12 11',
  // chegada — pino
  arrive: 'M12 3 C8.7 3 6 5.7 6 9 C6 13.5 12 21 12 21 C12 21 18 13.5 18 9 C18 5.7 15.3 3 12 3 Z M12 9 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',
};

function resolveKey(type: string, modifier?: string): ManeuverKey {
  const m = (modifier || '').toLowerCase();
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (type === 'merge') return 'merge';
  if (type === 'continue' || type === 'new name') return 'straight';
  if (type === 'uturn' || m === 'uturn') return 'uturn';
  if (m.includes('sharp') && m.includes('right')) return 'sharp-right';
  if (m.includes('sharp') && m.includes('left')) return 'sharp-left';
  if (m.includes('slight') && m.includes('right')) return 'slight-right';
  if (m.includes('slight') && m.includes('left')) return 'slight-left';
  if (m.includes('right')) return 'right';
  if (m.includes('left')) return 'left';
  if (m === 'straight' || m === '') return 'straight';
  return 'straight';
}

interface Props {
  type: string;
  modifier?: string;
  size?: number;
  color?: string;
  fillPin?: boolean;
}

export function ManeuverArrow({ type, modifier, size = 30, color = '#4d9bff', fillPin }: Props) {
  const key = resolveKey(type, modifier);
  const isPin = key === 'arrive';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={PATHS[key]}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={isPin && fillPin ? color : 'none'}
      />
    </svg>
  );
}
