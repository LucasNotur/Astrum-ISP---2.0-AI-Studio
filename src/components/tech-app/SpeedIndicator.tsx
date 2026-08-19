import React from 'react';

/**
 * Indicador de velocidade — clone 1:1 do case "Navigator" (dprofile.ru/case/30156,
 * imagens 1 e 9): placa de limite (círculo com anel vermelho, como sinalização de
 * trânsito) empilhada sobre a velocidade atual em texto simples, sem cartão/fundo.
 * Posicionado na borda ESQUERDA da tela (não no canto superior direito).
 */
interface SpeedIndicatorProps {
  speedKmh: number;
  limitKmh: number;
}

export function SpeedIndicator({ speedKmh, limitKmh }: SpeedIndicatorProps) {
  const over = speedKmh > limitKmh;
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Placa de limite — sempre com anel vermelho, como no case de referência */}
      <div
        className="flex items-center justify-center rounded-full shadow-xl"
        style={{ width: 52, height: 52, border: '4px solid #D64045', background: '#fff' }}
      >
        <span className="text-xl font-extrabold leading-none tabular-nums" style={{ color: '#111' }}>
          {limitKmh}
        </span>
      </div>
      {/* Velocidade atual — texto simples, vira vermelho ao ultrapassar o limite */}
      <span
        className="text-lg font-extrabold leading-none tabular-nums"
        style={{ color: over ? '#D64045' : '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
      >
        {Math.round(speedKmh)}
      </span>
    </div>
  );
}
