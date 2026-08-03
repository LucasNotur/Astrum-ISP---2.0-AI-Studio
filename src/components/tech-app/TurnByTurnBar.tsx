import React from 'react';

interface TurnByTurnBarProps {
  icon: string;
  instruction: string;
  distance: string;
  nextInstruction?: string;
}

export function TurnByTurnBar({ icon, instruction, distance, nextInstruction }: TurnByTurnBarProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 safe-area-top">
      <div
        className="mx-3 mt-3 backdrop-blur-lg shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(17,17,17,0.95)',
          borderRadius: '20px',
          border: '1px solid #222',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-3xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">{instruction}</p>
            <p className="text-xs mt-0.5" style={{ color: '#3D5AFE' }}>{distance}</p>
          </div>
        </div>

        {nextInstruction && (
          <div className="px-4 py-2" style={{ background: '#1a1a1a', borderTop: '1px solid #222' }}>
            <p className="text-xs truncate" style={{ color: '#666' }}>Depois: {nextInstruction}</p>
          </div>
        )}
      </div>
    </div>
  );
}
