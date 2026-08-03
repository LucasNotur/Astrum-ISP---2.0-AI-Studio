import React from 'react';
import { tech } from './theme';

/**
 * Indicador de velocidade atual + limite da via — inspirado no nav (Mapbox/Yango):
 * velocímetro grande à esquerda, placa de limite estilo sinalização à direita.
 * Fica vermelho quando acima do limite.
 */
interface SpeedIndicatorProps {
  speedKmh: number;
  limitKmh: number;
}

export function SpeedIndicator({ speedKmh, limitKmh }: SpeedIndicatorProps) {
  const over = speedKmh > limitKmh;
  return (
    <div className="flex items-stretch shadow-xl" style={{ borderRadius: 16, overflow: 'hidden' }}>
      {/* Velocidade atual */}
      <div
        className="flex flex-col items-center justify-center px-3 py-1.5"
        style={{ background: over ? tech.danger : `${tech.card}f2`, backdropFilter: 'blur(20px)', minWidth: 58 }}
      >
        <span className="text-xl font-extrabold leading-none tabular-nums" style={{ color: '#fff' }}>
          {Math.round(speedKmh)}
        </span>
        <span className="text-[8px] font-bold mt-0.5" style={{ color: over ? 'rgba(255,255,255,0.8)' : tech.textMuted }}>
          km/h
        </span>
      </div>
      {/* Placa de limite */}
      <div
        className="flex flex-col items-center justify-center px-2 py-1"
        style={{ background: '#fff' }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 38, height: 38, border: '3px solid #E5484D', background: '#fff' }}
        >
          <span className="text-base font-extrabold leading-none tabular-nums" style={{ color: '#111' }}>
            {limitKmh}
          </span>
        </div>
      </div>
    </div>
  );
}
